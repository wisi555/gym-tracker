// The app's database (IndexedDB, built into the browser, stored on the phone).
//
// HOW CHANGES WORK (never lose data):
// The database has a version number. To change how data is stored, or to
// add/rename exercises, append a new function to MIGRATIONS. The browser then
// runs each missing step, in order, on the existing data. Never edit or
// remove a migration that has been released.

import { DEFAULT_EXERCISES, DEFAULT_ROUTINES } from './defaults.js';

const DB_NAME = 'gym-tracker';

// MIGRATIONS[0] takes an empty database to version 1, MIGRATIONS[1] takes
// version 1 to version 2, and so on. `tx` is the upgrade transaction.
const MIGRATIONS = [
  // v1: create the stores and load the starting routines.
  (db, tx) => {
    db.createObjectStore('exercises', { keyPath: 'id' });
    db.createObjectStore('routines', { keyPath: 'id' });
    const sets = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
    sets.createIndex('exercise_date', ['exerciseId', 'date']);
    sets.createIndex('date', 'date');
    db.createObjectStore('meta', { keyPath: 'key' });

    const exercises = tx.objectStore('exercises');
    for (const ex of DEFAULT_EXERCISES) exercises.add(ex);
    const routines = tx.objectStore('routines');
    for (const r of DEFAULT_ROUTINES) routines.add(r);
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      for (let v = event.oldVersion; v < SCHEMA_VERSION; v++) {
        MIGRATIONS[v](db, tx);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer app version wants to upgrade the database: step aside and
      // reload so this page runs the new code too.
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // Another open copy of the old app is holding the database.
    req.onblocked = () => console.warn('Database upgrade waiting for another open copy of the app to close.');
  });
  return dbPromise;
}

// Wraps an IndexedDB request in a promise.
function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) {
  const db = await openDB();
  return done(db.transaction(storeName).objectStore(storeName).getAll());
}

// Routines (sorted) with their exercises filled in, ready to display.
export async function getRoutines() {
  const [routines, exercises] = await Promise.all([getAll('routines'), getAll('exercises')]);
  const byId = new Map(exercises.map((ex) => [ex.id, ex]));
  return routines
    .sort((a, b) => a.order - b.order)
    .map((r) => ({
      ...r,
      items: r.items.map((it) => ({ ...it, exercise: byId.get(it.exerciseId) })),
    }));
}

// Ask the phone to treat our data as important, so Android won't clear it
// when storage runs low. Returns true if protected.
export async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
