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

  // v2: remove machine setup tips (the user doesn't want them shown).
  (db, tx) => {
    tx.objectStore('exercises').openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      if ('note' in cursor.value) {
        const { note, ...rest } = cursor.value;
        cursor.update(rest);
      }
      cursor.continue();
    };
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

// ---- Sets (one record per saved set) ----

// Walks a cursor, collecting records while keepGoing(record, collected) is true.
function collect(req, keepGoing) {
  return new Promise((resolve, reject) => {
    const out = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && keepGoing(cursor.value, out)) {
        out.push(cursor.value);
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

const bySetOrder = (a, b) => a.setNo - b.setNo || a.savedAt - b.savedAt;

// All sets of one exercise on one date, in order.
export async function getSetsOn(exerciseId, date) {
  const db = await openDB();
  const index = db.transaction('sets').objectStore('sets').index('exercise_date');
  const sets = await done(index.getAll(IDBKeyRange.only([exerciseId, date])));
  return sets.sort(bySetOrder);
}

// The most recent session of an exercise strictly before `date`:
// { date, sets } or null if there is none.
export async function getLastSession(exerciseId, date) {
  const db = await openDB();
  const index = db.transaction('sets').objectStore('sets').index('exercise_date');
  // Every [exerciseId, earlier date], newest first.
  const range = IDBKeyRange.bound([exerciseId, ''], [exerciseId, date], false, true);
  const sets = await collect(index.openCursor(range, 'prev'),
    (set, found) => found.length === 0 || set.date === found[0].date);
  if (!sets.length) return null;
  return { date: sets[0].date, sets: sets.sort(bySetOrder) };
}

// All sets on a date (any exercise), oldest saved first.
export async function getSetsByDate(date) {
  const db = await openDB();
  const index = db.transaction('sets').objectStore('sets').index('date');
  const sets = await done(index.getAll(IDBKeyRange.only(date)));
  return sets.sort((a, b) => a.savedAt - b.savedAt);
}

// The set with the latest date, or null.
export async function getLatestSet() {
  const db = await openDB();
  const index = db.transaction('sets').objectStore('sets').index('date');
  const [set] = await collect(index.openCursor(null, 'prev'), (_, found) => found.length === 0);
  return set || null;
}

// Saves a set; resolves once it is safely written.
export async function addSet(set) {
  const db = await openDB();
  const tx = db.transaction('sets', 'readwrite');
  const req = tx.objectStore('sets').add(set);
  await txDone(tx);
  return req.result;
}

export async function deleteSet(id) {
  const db = await openDB();
  const tx = db.transaction('sets', 'readwrite');
  tx.objectStore('sets').delete(id);
  await txDone(tx);
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Ask the phone to treat our data as important, so Android won't clear it
// when storage runs low. Returns true if protected.
export async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
