// Backup: export everything, import older backups, refuse bad files.
const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { openApp, seed, readStore, makeSets, day, expect } = require('./helpers');

async function exportBackup(page, testInfo) {
  await page.click('#settings-btn');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Export backup')]);
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

async function importFile(page, file) {
  await page.click('#settings-btn');
  const nav = page.waitForEvent('framenavigated');
  await page.setInputFiles('.settings input[type=file]', file);
  return nav;
}

test('export contains every store; an older backup imports with upgrades', async ({ page }, testInfo) => {
  const { errors } = await openApp(page);
  await seed(page, {
    sets: makeSets([[1, 'leg-press', 'lower', [[80, 10]]]]),
    weights: [{ date: day(-1), weight: 70, savedAt: 1 }],
  });
  const { data: backup } = await exportBackup(page, testInfo);
  expect(backup.app).toBe('gym-tracker');
  for (const store of ['exercises', 'routines', 'sets', 'meta', 'weights', 'macros', 'checkins', 'photos']) {
    expect(Array.isArray(backup.data[store])).toBe(true);
  }
  expect(backup.data.meta.find((m) => m.key === 'lastBackup')).toBeUndefined();
  await page.goBack();

  // Pretend it was made by the very first version.
  const old = structuredClone(backup);
  old.schemaVersion = 1;
  delete old.data.weights;
  delete old.data.macros;
  delete old.data.checkins;
  delete old.data.photos;
  old.data.exercises.find((e) => e.id === 'leg-press').note = 'Feet high';
  old.data.exercises.find((e) => e.id === 'hip-thrust').name = 'Hip thrust / glute bridge';
  const lower = old.data.routines.find((r) => r.id === 'lower');
  lower.subtitle = 'Glute focus';
  lower.items[0].reps = { min: 8, max: 12 };
  const oldFile = testInfo.outputPath('old.json');
  fs.writeFileSync(oldFile, JSON.stringify(old));
  await importFile(page, oldFile);
  await page.waitForSelector('#tab-log .exercise');

  const exercises = await readStore(page, 'exercises');
  expect(exercises.some((e) => 'note' in e)).toBe(false);
  expect(exercises.find((e) => e.id === 'hip-thrust').name).toBe('Hip thrust');
  const routines = await readStore(page, 'routines');
  expect(routines.every((r) => r.subtitle === undefined && r.items.every((i) => i.reps.max === 10))).toBe(true);
  expect(await readStore(page, 'sets')).toHaveLength(1);
  expect(await readStore(page, 'weights')).toEqual([]);
  expect(await readStore(page, 'checkins')).toEqual([]);
  expect(errors).toEqual([]);
});

test('bad files are refused and nothing changes', async ({ page }, testInfo) => {
  const { dialogs } = await openApp(page);
  await seed(page, { sets: makeSets([[1, 'leg-curl', 'lower', [[20, 10]]]]) });
  const cases = [
    ['not-json.json', 'hello', "isn't a Gym Tracker backup"],
    ['newer.json', JSON.stringify({ app: 'gym-tracker', schemaVersion: 999, data: {} }), 'newer version'],
  ];
  for (const [name, content, message] of cases) {
    const file = testInfo.outputPath(name);
    fs.writeFileSync(file, content);
    await page.click('#settings-btn');
    await page.setInputFiles('.settings input[type=file]', file);
    await expect.poll(() => dialogs.at(-1)).toContain(message);
    await page.goBack();
  }
  expect(await readStore(page, 'sets')).toHaveLength(1);
});

test('gentle backup reminder: shows when due, opens Backup, goes away after exporting', async ({ page }) => {
  const { errors } = await openApp(page);
  const reminder = page.locator('#backup-reminder');
  await expect(reminder).toBeHidden(); // no data yet

  // Made-up data saved long ago, never backed up.
  await seed(page, { sets: makeSets([[30, 'calf-raise', 'lower', [[30, 10]]]]) });
  await expect(reminder).toContainText('No backup yet');

  // Backed up 20 days ago.
  await seed(page, { meta: [{ key: 'lastBackup', value: Date.now() - 20 * 86400000 }] });
  await expect(reminder).toContainText('Last backup 20 days ago');

  // Backed up 5 days ago → quiet.
  await seed(page, { meta: [{ key: 'lastBackup', value: Date.now() - 5 * 86400000 }] });
  await expect(reminder).toBeHidden();

  await seed(page, { meta: [{ key: 'lastBackup', value: Date.now() - 20 * 86400000 }] });
  await reminder.click();
  await expect(page.locator('#title')).toHaveText('Settings');
  await Promise.all([page.waitForEvent('download'), page.click('text=Export backup')]);
  await page.goBack();
  await expect(page.locator('#title')).toHaveText('Log');
  await expect(reminder).toBeHidden();
  expect(errors).toEqual([]);
});

test('an older backup with hips and "optional" imports without them', async ({ page }, testInfo) => {
  await openApp(page);
  const { data: backup } = await exportBackup(page, testInfo);
  await page.goBack();
  const old = structuredClone(backup);
  old.schemaVersion = 9;
  old.data.checkins = [{ date: day(-5), waist: 80, hips: 99, savedAt: 1 }];
  old.data.routines.forEach((r) => r.items.forEach((it) => { it.optional = false; }));
  const file = testInfo.outputPath('v9.json');
  fs.writeFileSync(file, JSON.stringify(old));
  await importFile(page, file);
  await page.waitForSelector('#tab-log .exercise');
  const [checkin] = await readStore(page, 'checkins');
  expect(checkin.waist).toBe(80);
  expect('hips' in checkin).toBe(false);
  expect((await readStore(page, 'routines')).every((r) => r.items.every((it) => !('optional' in it)))).toBe(true);
});
