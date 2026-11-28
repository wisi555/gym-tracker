// Progress tab: streak rules, excused weeks, strength and body charts.
const { test } = require('@playwright/test');
const { openApp, seed, makeSets, day, expect } = require('./helpers');

test('streak rules', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const { streakStats } = await import('./progress.js');
    const today = '2026-11-27'; // a Friday; that week starts Mon Nov 23
    const run = (dates, excused = []) => {
      const s = streakStats(dates, new Set(excused), today);
      return [s.current, s.best];
    };
    return {
      none: run([]),
      thisWeekOne: run(['2026-11-24']),
      thisWeekTwo: run(['2026-11-24', '2026-11-26']),
      gap: run(['2026-11-03', '2026-11-05', '2026-11-17', '2026-11-19']),
      gapExcused: run(['2026-11-03', '2026-11-05', '2026-11-17', '2026-11-19'], ['2026-11-09']),
    };
  });
  expect(r.none).toEqual([0, 0]);
  expect(r.thisWeekOne).toEqual([0, 0]);   // in progress: not broken, not counted
  expect(r.thisWeekTwo).toEqual([1, 1]);
  expect(r.gap).toEqual([1, 1]);           // a missed week breaks it
  expect(r.gapExcused).toEqual([2, 2]);    // an excused week doesn't
});

test('streak screen, excusing a week, strength and body charts', async ({ page }) => {
  const { errors, dialogs } = await openApp(page);
  // Made-up history: 3 gym days a week for weeks 4..1 ago, except 2 weeks ago (1 day).
  const sessions = [];
  const mondayAgo = (w) => { const d = new Date(); const dow = (d.getDay() + 6) % 7; return dow + 7 * w; };
  for (let w = 4; w >= 1; w--) {
    const offsets = w === 2 ? [2] : [0, 2, 4];
    offsets.forEach((o, i) => sessions.push([mondayAgo(w) - o, 'hip-thrust', 'lower', [[40 + (4 - w) * 2.5 + i, 10], [40 + (4 - w) * 2.5 + i, 10]]]));
  }
  const weights = []; const macros = [];
  for (let i = 30; i >= 1; i--) {
    weights.push({ date: day(-i), weight: 70 - i * 0.02, savedAt: 1 });
    macros.push({ date: day(-i), eaten: { kcal: 1900, protein: 100 }, target: { kcal: 2000, protein: 110 }, savedAt: 1 });
  }
  await seed(page, { sets: makeSets(sessions), weights, macros });

  await page.click('.tabbar [data-tab=progress]');
  const value = page.locator('#tab-progress .avg-value');
  await expect(value).toHaveText(/^1\s*week$/); // only last week since the short one
  await expect(page.locator('.stats')).toContainText('gym visits');
  await page.locator('.wb-col').nth(5).click(); // 2 weeks ago (bars: 7 ago … now)
  expect(dialogs.at(-1)).toContain('Excuse the week');
  await expect(page.locator('.wb-bar.excused')).toHaveCount(1);
  await expect(value).toHaveText(/^3\s*weeks$/);

  await page.click('#tab-progress .segmented button:has-text("Strength")');
  await page.locator('#tab-progress .exercise', { hasText: 'Hip thrust' }).click();
  await expect(page.locator('.chart-readout')).toContainText('kg');
  const box = await page.locator('.chart-svg').boundingBox();
  await page.mouse.click(box.x + 50, box.y + box.height / 2);
  await expect(page.locator('.c-focus')).toHaveAttribute('visibility', 'visible');
  await expect(page.locator('#tab-progress .weight-list li')).toHaveCount(10);
  await page.goBack();

  await page.click('#tab-progress .segmented button:has-text("Body")');
  await expect(page.locator('#tab-progress .chart-title')).toHaveText('Weekly average weight');
  await page.click('#tab-progress button:has-text("Calories")');
  await expect(page.locator('#tab-progress .c-target')).toHaveCount(1);
  await expect(page.locator('#tab-progress .chart-readout')).toContainText('kcal');
  expect(errors).toEqual([]);
});
