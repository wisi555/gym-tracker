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
// v3 change, shared with the backup upgrade: reps top out at 10, not 12.
// 8–12 → 8–10, 10–12 → 10. Ranges ending at 15 are unchanged.
function capRepsAt10(routine) {
  return {
    ...routine,
    items: routine.items.map((it) => (it.reps.max === 12
      ? { ...it, reps: { min: Math.min(it.reps.min, 10), max: 10 } }
      : it)),
  };
}

// v4 change (user clarified): EVERY rep range tops out at 10.
// 10–15 → 10, 12–15 → 10. Shared with the backup upgrade.
function capAllRepsAt10(routine) {
  return {
    ...routine,
    items: routine.items.map((it) => (it.reps.max > 10
      ? { ...it, reps: { min: Math.min(it.reps.min, 10), max: 10 } }
      : it)),
  };
}

// v7 changes (user's request), shared with the backup upgrade:
// every exercise 3 sets × 8–10 reps, no "optional" marks, no routine
// subtitle ("Glute focus"), and "Hip thrust / glute bridge" → "Hip thrust".
function simplifyRoutine(routine) {
  const { subtitle, ...rest } = routine;
  return {
    ...rest,
    items: routine.items.map((it) => ({
      ...it, sets: { min: 3, max: 3 }, reps: { min: 8, max: 10 }, optional: false,
    })),
  };
}
const renameHipThrust = (ex) => (ex.id === 'hip-thrust' ? { ...ex, name: 'Hip thrust' } : ex);

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

  // v3: reps top out at 10 instead of 12 (user's request).
  (db, tx) => {
    tx.objectStore('routines').openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      cursor.update(capRepsAt10(cursor.value));
      cursor.continue();
    };
  },

  // v4: every rep range tops out at 10 (user clarified v3's request).
  (db, tx) => {
    tx.objectStore('routines').openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      cursor.update(capAllRepsAt10(cursor.value));
      cursor.continue();
    };
  },

  // v5: morning weigh-ins, one per day: { date, weight, savedAt }.
  (db) => {
    db.createObjectStore('weights', { keyPath: 'date' });
  },

  // v6: daily macros, one per day: { date, eaten: {kcal, protein, carbs,
  // fat, fiber}, target: {...same}, savedAt }. Missing numbers are left out.
  (db) => {
    db.createObjectStore('macros', { keyPath: 'date' });
  },

  // v7: all exercises 3 × 8–10, no "optional", no subtitle, rename hip thrust.
  (db, tx) => {
    tx.objectStore('routines').openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      cursor.update(simplifyRoutine(cursor.value));
      cursor.continue();
    };
    const exercises = tx.objectStore('exercises');
    exercises.get('hip-thrust').onsuccess = (event) => {
      if (event.target.result) exercises.put(renameHipThrust(event.target.result));
    };
  },

  // v8: monthly check-ins, one per day: { date, waist, hips, glutes, thighs,
  // savedAt } in cm. Missing measurements are left out.
  (db) => {
    db.createObjectStore('checkins', { keyPath: 'date' });
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

// Backup files carry the schema version they were made with. To import an
// older backup, its data is upgraded with these steps. RULE: every migration
// above needs a matching step here that makes the same change to plain data
// (even adding an exercise), keyed by the version it upgrades FROM.
const BACKUP_MIGRATIONS = {
  1: (data) => { data.exercises = data.exercises.map(({ note, ...rest }) => rest); },
  2: (data) => { data.routines = data.routines.map(capRepsAt10); },
  3: (data) => { data.routines = data.routines.map(capAllRepsAt10); },
  4: (data) => { data.weights = []; },
  5: (data) => { data.macros = []; },
  6: (data) => {
    data.routines = data.routines.map(simplifyRoutine);
    data.exercises = data.exercises.map(renameHipThrust);
  },
  7: (data) => { data.checkins = []; },
};

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

// Every set ever logged (for the Progress tab).
export async function getAllSets() {
  const db = await openDB();
  return done(db.transaction('sets').objectStore('sets').getAll());
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

// Changes a saved set's weight and reps; its date and position stay.
export async function updateSet(id, changes) {
  const db = await openDB();
  const tx = db.transaction('sets', 'readwrite');
  const store = tx.objectStore('sets');
  store.get(id).onsuccess = (event) => {
    const set = event.target.result;
    if (set) store.put({ ...set, ...changes });
  };
  await txDone(tx);
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

// ---- Morning weigh-ins ----

// All weigh-ins, newest first.
export async function getWeights() {
  const db = await openDB();
  const all = await done(db.transaction('weights').objectStore('weights').getAll());
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// One weight per day: saving again for the same date replaces it.
export async function saveWeight(date, weight) {
  const db = await openDB();
  const tx = db.transaction('weights', 'readwrite');
  tx.objectStore('weights').put({ date, weight, savedAt: Date.now() });
  await txDone(tx);
}

export async function deleteWeight(date) {
  const db = await openDB();
  const tx = db.transaction('weights', 'readwrite');
  tx.objectStore('weights').delete(date);
  await txDone(tx);
}

// ---- Daily macros ----

// All macro days, newest first.
export async function getMacros() {
  const db = await openDB();
  const all = await done(db.transaction('macros').objectStore('macros').getAll());
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// One entry per day: saving again for the same date replaces it.
export async function saveMacros(date, eaten, target) {
  const db = await openDB();
  const tx = db.transaction('macros', 'readwrite');
  tx.objectStore('macros').put({ date, eaten, target, savedAt: Date.now() });
  await txDone(tx);
}

export async function deleteMacros(date) {
  const db = await openDB();
  const tx = db.transaction('macros', 'readwrite');
  tx.objectStore('macros').delete(date);
  await txDone(tx);
}

// ---- Monthly check-ins (measurements in cm) ----

export const MEASUREMENTS = ['waist', 'hips', 'glutes', 'thighs'];

// All check-ins, newest first.
export async function getCheckins() {
  const db = await openDB();
  const all = await done(db.transaction('checkins').objectStore('checkins').getAll());
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// One check-in per day: saving again for the same date replaces it.
export async function saveCheckin(date, values) {
  const db = await openDB();
  const tx = db.transaction('checkins', 'readwrite');
  tx.objectStore('checkins').put({ ...values, date, savedAt: Date.now() });
  await txDone(tx);
}

export async function deleteCheckin(date) {
  const db = await openDB();
  const tx = db.transaction('checkins', 'readwrite');
  tx.objectStore('checkins').delete(date);
  await txDone(tx);
}

// ---- Small settings ("meta" store) ----

export async function getMeta(key) {
  const db = await openDB();
  const row = await done(db.transaction('meta').objectStore('meta').get(key));
  return row ? row.value : undefined;
}

export async function setMeta(key, value) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await txDone(tx);
}

// When the first thing was ever saved (sets, weigh-ins, macros), or null.
export async function firstSavedAt() {
  const db = await openDB();
  const stores = ['sets', 'weights', 'macros', 'checkins'];
  const tx = db.transaction(stores);
  const lists = await Promise.all(stores.map((n) => done(tx.objectStore(n).getAll())));
  const times = lists.flat().map((r) => r.savedAt).filter((t) => typeof t === 'number');
  return times.length ? Math.min(...times) : null;
}

export async function countSets() {
  const db = await openDB();
  return done(db.transaction('sets').objectStore('sets').count());
}

// ---- Backup: export / import ----

const STORES = ['exercises', 'routines', 'sets', 'meta', 'weights', 'macros', 'checkins'];
// Stores every backup has had since version 1.
const FIRST_STORES = ['exercises', 'routines', 'sets', 'meta'];
// Settings about this phone, not part of your data (kept when importing).
const DEVICE_ONLY = ['lastBackup'];

// Everything in the database as one object, ready to save as a file.
export async function exportAll() {
  const db = await openDB();
  const tx = db.transaction(STORES);
  const data = {};
  await Promise.all(STORES.map(async (name) => {
    data[name] = await done(tx.objectStore(name).getAll());
  }));
  data.meta = data.meta.filter((row) => !DEVICE_ONLY.includes(row.key));
  return { app: 'gym-tracker', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

// Reads a backup file's text: checks it, upgrades it if it's from an older
// version, and returns { data, exportedAt }. Throws an Error with a
// plain-language message if the file can't be used.
export function parseBackup(text) {
  let file;
  try { file = JSON.parse(text); } catch { throw new Error("This file isn't a Gym Tracker backup."); }
  if (!file || file.app !== 'gym-tracker' || !file.data || typeof file.data !== 'object') {
    throw new Error("This file isn't a Gym Tracker backup.");
  }
  const from = file.schemaVersion;
  if (!Number.isInteger(from) || from < 1) throw new Error('This backup is damaged (no version number).');
  if (from > SCHEMA_VERSION) {
    throw new Error('This backup was made by a newer version of the app. Open the app with internet on so it updates, then try again.');
  }
  const data = structuredClone(file.data);
  const missing = (name) => { throw new Error(`This backup is damaged (missing ${name}).`); };
  for (const name of FIRST_STORES) if (!Array.isArray(data[name])) missing(name);
  for (let v = from; v < SCHEMA_VERSION; v++) BACKUP_MIGRATIONS[v](data);
  for (const name of STORES) if (!Array.isArray(data[name])) missing(name);
  checkData(data);
  return { data, exportedAt: file.exportedAt };
}

function checkData(data) {
  const bad = (what) => { throw new Error(`This backup is damaged (${what}).`); };
  const isText = (x) => typeof x === 'string' && x.length > 0;
  const exerciseIds = new Set();
  for (const ex of data.exercises) {
    if (!isText(ex.id) || !isText(ex.name)) bad('an exercise has no id or name');
    exerciseIds.add(ex.id);
  }
  for (const r of data.routines) {
    if (!isText(r.id) || !isText(r.name) || !Array.isArray(r.items)) bad('a routine is incomplete');
    for (const it of r.items) if (!exerciseIds.has(it.exerciseId)) bad('a routine uses an unknown exercise');
  }
  for (const set of data.sets) {
    if (!Number.isInteger(set.id)) bad('a set has no id');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(set.date)) bad('a set has a bad date');
    if (!exerciseIds.has(set.exerciseId)) bad('a set belongs to an unknown exercise');
    if (typeof set.weight !== 'number' || !(set.weight >= 0)) bad('a set has a bad weight');
    if (!Number.isInteger(set.reps) || set.reps < 0) bad('a set has bad reps');
  }
  for (const row of data.meta) if (!isText(row.key)) bad('a setting has no name');
  for (const w of data.weights) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) bad('a weigh-in has a bad date');
    if (typeof w.weight !== 'number' || !(w.weight > 0)) bad('a weigh-in has a bad weight');
  }
  const numbersOk = (obj) => obj && typeof obj === 'object'
    && Object.values(obj).every((n) => typeof n === 'number' && n >= 0);
  for (const m of data.macros) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) bad('a macros day has a bad date');
    if (!numbersOk(m.eaten) || !numbersOk(m.target)) bad('a macros day has bad numbers');
  }
  for (const c of data.checkins) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) bad('a check-in has a bad date');
    for (const k of MEASUREMENTS) {
      if (c[k] != null && !(typeof c[k] === 'number' && c[k] > 0)) bad('a check-in has a bad measurement');
    }
  }
}

// Replaces ALL data with `data` in one step: if anything fails, nothing
// changes. Phone-only settings are kept.
export async function replaceAll(data) {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  const finished = txDone(tx);
  const meta = tx.objectStore('meta');
  const keep = (await done(meta.getAll())).filter((row) => DEVICE_ONLY.includes(row.key));
  for (const name of STORES) {
    const store = tx.objectStore(name);
    store.clear();
    for (const row of data[name]) {
      if (name === 'meta' && DEVICE_ONLY.includes(row.key)) continue;
      store.add(row);
    }
  }
  for (const row of keep) meta.put(row);
  await finished;
}

// Ask the phone to treat our data as important, so Android won't clear it
// when storage runs low. Returns true if protected.
export async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
