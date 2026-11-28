// A phone that still has the very first database (version 1) gets every
// upgrade step, in order, without losing logged sets.
const { test } = require('@playwright/test');
const { openApp, readStore, day, expect } = require('./helpers');

test('version-1 database upgrades to the current one with data kept', async ({ page }) => {
  await page.goto('./manifest.webmanifest'); // same site, but no app code running
  await page.evaluate(async (setDate) => {
    await new Promise((resolve, reject) => {
      const q = indexedDB.open('gym-tracker', 1);
      q.onupgradeneeded = () => {
        const db = q.result;
        db.createObjectStore('exercises', { keyPath: 'id' });
        db.createObjectStore('routines', { keyPath: 'id' });
        const sets = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
        sets.createIndex('exercise_date', ['exerciseId', 'date']);
        sets.createIndex('date', 'date');
        db.createObjectStore('meta', { keyPath: 'key' });
        const tx = q.transaction;
        const ex = tx.objectStore('exercises');
        ex.add({ id: 'chest-press', name: 'Chest press' });
        ex.add({ id: 'hip-thrust', name: 'Hip thrust / glute bridge' });
        ex.add({ id: 'leg-press', name: 'Leg press', note: 'Feet high, slightly wide' });
        ex.add({ id: 'hip-abductor', name: 'Hip abductor' });
        const item = (exerciseId, s1, s2, r1, r2, optional = false) => ({
          exerciseId, sets: { min: s1, max: s2 }, reps: { min: r1, max: r2 }, optional,
        });
        const r = tx.objectStore('routines');
        r.add({ id: 'upper', name: 'Upper', order: 1, items: [item('chest-press', 3, 3, 8, 12)] });
        r.add({
          id: 'lower', name: 'Lower', subtitle: 'Glute focus', order: 2,
          items: [item('hip-thrust', 4, 4, 8, 12), item('leg-press', 3, 4, 8, 12), item('hip-abductor', 2, 3, 12, 15, true)],
        });
        tx.objectStore('sets').add({
          date: setDate, exerciseId: 'hip-thrust', routineId: 'lower', setNo: 1, weight: 40, reps: 10, savedAt: 1,
        });
      };
      q.onsuccess = () => { q.result.close(); resolve(); };
      q.onerror = () => reject(q.error);
    });
  }, day(-3));

  const { errors } = await openApp(page);
  const exercises = await readStore(page, 'exercises');
  expect(exercises.some((e) => 'note' in e)).toBe(false);
  expect(exercises.find((e) => e.id === 'hip-thrust').name).toBe('Hip thrust');
  for (const routine of await readStore(page, 'routines')) {
    expect(routine.subtitle).toBeUndefined();
    for (const it of routine.items) {
      expect(it.sets).toEqual({ min: 3, max: 3 });
      expect(it.reps).toEqual({ min: 8, max: 10 });
      expect(it.optional).toBe(false);
    }
  }
  expect(await readStore(page, 'sets')).toHaveLength(1);
  expect(await readStore(page, 'weights')).toEqual([]);
  expect(await readStore(page, 'macros')).toEqual([]);
  expect(await readStore(page, 'checkins')).toEqual([]);

  await page.click('#tab-log .segmented button:has-text("Lower")');
  const card = page.locator('#tab-log .exercise', { hasText: 'Hip thrust' });
  await expect(card).toContainText('1×10 – 40 kg');
  await expect(page.locator('#tab-log')).not.toContainText('Glute focus');
  await expect(page.locator('#tab-log')).not.toContainText('optional');
  expect(errors).toEqual([]);
});
