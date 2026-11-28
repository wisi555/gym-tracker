// Body tab: morning weight + 7-day average, macros paste reader.
const { test } = require('@playwright/test');
const { openApp, day, expect } = require('./helpers');

test('weigh-ins: 7-day average, replace, ignore older than a week', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.click('.tabbar [data-tab=body]');
  const avg = page.locator('#tab-body .avg-value');
  await expect(avg).toHaveText('–');
  const input = page.locator('#tab-body .stepper input');
  const save = page.locator('#tab-body .editor .primary');
  await input.fill('70,4');
  await save.click();
  await expect(avg).toContainText('70.4');
  await expect(save).toHaveText('Update weight');
  await page.fill('#body-date', day(-1));
  await expect(save).toHaveText('Save weight');
  await expect(input).toHaveValue('70.4'); // starts from the nearest weigh-in
  for (let i = 0; i < 4; i++) await page.click('[aria-label="Morning weight plus 0.1"]');
  await save.click();
  await expect(avg).toContainText('70.6');
  await page.fill('#body-date', day(-8));
  await input.fill('90');
  await save.click();
  await expect(page.locator('#tab-body .weight-list li')).toHaveCount(3);
  await expect(avg).toContainText('70.6'); // 8 days ago doesn't count
  expect(errors).toEqual([]);
});

test('macros reader understands both formats and ignores food lines', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const { parseMacros } = await import('./macros.js');
    return [
      parseMacros('- low fat yogurt 200 g\nCalories: ~1,800 of 2,000 (−200)\nProtein: ~95 g of 110 g\nCarbs: ~200 g of 240 g\nFat: ~70 g of 60 g\nFiber: ~28 g of 30+ g'),
      parseMacros('Notes...\n`MACROS kcal 1800/2000 · protein 95/110 · carbs 200/240 · fat 70/60 · fiber 28/30`'),
      parseMacros('MACROS kcal 1700/2000 · protein 82,5/110'),
      parseMacros('nothing useful here'),
    ];
  });
  const want = { eaten: { kcal: 1800, protein: 95, carbs: 200, fat: 70, fiber: 28 }, target: { kcal: 2000, protein: 110, carbs: 240, fat: 60, fiber: 30 } };
  expect(r[0]).toEqual(want);
  expect(r[1]).toEqual(want);
  expect(r[2].eaten.protein).toBe(82.5);
  expect(r[3].eaten).toEqual({});
});

test('macros: paste from clipboard, save, type a number by hand', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors } = await openApp(page, { promptAnswer: '100' });
  await page.click('.tabbar [data-tab=body]');
  await page.click('#tab-body .segmented button:has-text("Macros")');
  await page.evaluate(() => navigator.clipboard.writeText('MACROS kcal 1800/2000 · protein 95/110 · carbs 200/240 · fat 70/60 · fiber 28/30'));
  await page.click('text=Paste from Claude');
  await expect(page.locator('.preview-list')).toContainText('1,800 / 2,000 kcal');
  await page.click('.hint .primary');
  const rows = page.locator('.macro-rows');
  await expect(rows).toContainText('95 / 110 g');
  await expect(page.locator('.macro-fill.over')).toHaveCount(1); // fat over target
  await page.click('.macro-row:has-text("Protein")');
  await expect(rows).toContainText('100 / 110 g');
  expect(errors).toEqual([]);
});
