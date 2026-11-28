// Shared helpers for the tests. All data here is MADE UP (the repo is public).
const { expect } = require('@playwright/test');

// 'YYYY-MM-DD' for today + n days, in the browser's own time zone.
function day(n = 0) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Opens the app, collects page errors, accepts confirm()/alert() dialogs.
async function openApp(page, { promptAnswer } = {}) {
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    if (d.type() === 'prompt') d.accept(typeof promptAnswer === 'function' ? promptAnswer() : promptAnswer);
    else d.accept();
  });
  await page.goto('./');
  await page.waitForSelector('#tab-log .exercise');
  await expect(page.locator('#version')).not.toHaveText('v…');
  return { errors, dialogs };
}

// Writes made-up records straight into the app's database, then reloads.
async function seed(page, data) {
  await page.evaluate(async (data) => {
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open('gym-tracker');
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const stores = Object.keys(data);
    const tx = db.transaction(stores, 'readwrite');
    for (const name of stores) for (const row of data[name]) tx.objectStore(name).put(row);
    await new Promise((res) => { tx.oncomplete = res; });
    db.close();
  }, data);
  await page.reload();
  await page.waitForSelector('#tab-log .exercise');
}

// Reads a whole store from the app's database.
async function readStore(page, name) {
  return page.evaluate((name) => new Promise((res) => {
    const q = indexedDB.open('gym-tracker');
    q.onsuccess = () => {
      const g = q.result.transaction(name).objectStore(name).getAll();
      g.onsuccess = () => { res(g.result); q.result.close(); };
    };
  }), name);
}

// Made-up sets: `sessions` = [[daysAgo, exerciseId, routineId, [[kg, reps], ...]], ...]
function makeSets(sessions) {
  let id = 1000;
  const out = [];
  for (const [ago, exerciseId, routineId, sets] of sessions) {
    sets.forEach(([weight, reps], i) => out.push({
      id: id++, date: day(-ago), exerciseId, routineId, setNo: i + 1, weight, reps, savedAt: id,
    }));
  }
  return out;
}

module.exports = { day, openApp, seed, readStore, makeSets, expect };
