// Monthly check-in: measurements, "due" dot, previous values, Progress chips.
const { test } = require('@playwright/test');
const { openApp, seed, readStore, day, expect } = require('./helpers');

test('check-in: due dot, save, previous shown, replace, chart', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.click('.tabbar [data-tab=body]');
  const tab = page.locator('#tab-body .segmented button:has-text("Check-in")');
  await expect(tab.locator('.due-dot')).toHaveCount(1); // none yet → due

  // Made-up previous check-in 35 days ago.
  await seed(page, { checkins: [{ date: day(-35), waist: 80, hips: 100, glutes: 102, thighs: 60, savedAt: 1 }] });
  await page.click('.tabbar [data-tab=body]');
  await expect(tab.locator('.due-dot')).toHaveCount(1); // over 30 days → due
  await tab.click();
  const steppers = page.locator('#tab-body .checkin-view .stepper');
  await expect(steppers).toHaveCount(4);
  await expect(steppers.nth(0)).toContainText('Waist · last 80.0 cm');
  await expect(steppers.nth(3)).toContainText('Thighs');
  await expect(steppers.nth(0).locator('input')).toHaveValue('80'); // starts from last time

  await page.click('[aria-label="Waist minus 0.5"]');
  await steppers.nth(2).locator('input').fill('103,5');
  await page.click('#tab-body .checkin-view .primary');
  await expect(page.locator('#tab-body .checkin-list li')).toHaveCount(2);
  await expect(tab.locator('.due-dot')).toHaveCount(0); // done this month
  await expect(page.locator('#tab-body .checkin-view .primary')).toHaveText('Update check-in');
  const saved = (await readStore(page, 'checkins')).find((c) => c.date === day(0));
  expect(saved).toMatchObject({ waist: 79.5, hips: 100, glutes: 103.5, thighs: 60 });

  await page.click('.tabbar [data-tab=progress]');
  await page.click('#tab-progress .segmented button:has-text("Body")');
  await page.click('#tab-progress .chip:has-text("Glutes")');
  await expect(page.locator('#tab-progress .chart-title')).toHaveText('Glutes (check-ins)');
  await expect(page.locator('#tab-progress .chart-readout')).toContainText('103.5 cm');
  await page.click('#tab-progress button:has-text("All")');
  await expect(page.locator('#tab-progress .c-dot')).toHaveCount(2);
  expect(errors).toEqual([]);
});
