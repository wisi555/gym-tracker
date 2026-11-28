// Monthly check-in: measurements, body fat (US Navy), "due" dot, charts.
const { test } = require('@playwright/test');
const { openApp, seed, readStore, day, expect } = require('./helpers');

test('US Navy body fat formula', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const { navyBodyFat } = await import('./checkin.js');
    return [navyBodyFat(80, 37, 175), navyBodyFat(90, 40, 180), navyBodyFat(80, 37, null), navyBodyFat(35, 40, 170)];
  });
  expect(r[0]).toBeCloseTo(13.7, 1);   // made-up example
  expect(r[1]).toBeCloseTo(18.37, 1); // 495/(1.0324-0.19077·log10(50)+0.15456·log10(180))-450
  expect(r[2]).toBeNull();             // no height yet
  expect(r[3]).toBeNull();             // neck bigger than waist: impossible
});

test('check-in: due dot, five measurements, body fat, previous values, chart', async ({ page }) => {
  const { errors } = await openApp(page, { promptAnswer: '175' });
  await page.click('.tabbar [data-tab=body]');
  const tab = page.locator('#tab-body .segmented button:has-text("Check-in")');
  await expect(tab.locator('.due-dot')).toHaveCount(1); // none yet → due

  // Made-up previous check-in 35 days ago.
  await seed(page, { checkins: [{ date: day(-35), waist: 80, neck: 37, glutes: 100, thighs: 58, arm: 30, savedAt: 1 }] });
  await page.click('.tabbar [data-tab=body]');
  await expect(tab.locator('.due-dot')).toHaveCount(1); // over 30 days → due
  await tab.click();
  const view = page.locator('#tab-body .checkin-view');
  const steppers = view.locator('.stepper');
  await expect(steppers).toHaveCount(5);
  for (const [i, name] of ['Waist', 'Neck', 'Glutes', 'Thighs', 'Upper arm'].entries()) {
    await expect(steppers.nth(i).locator('.stepper-label')).toContainText(name);
  }
  await expect(view).not.toContainText('Hips');
  await expect(steppers.nth(0)).toContainText('last 80.0 cm');
  await expect(steppers.nth(0).locator('input')).toHaveValue('80');

  // Body fat needs a height first.
  await expect(view.locator('.bf-value')).toHaveText('–');
  await view.locator('button:has-text("Set height")').click();
  await expect(view.locator('.bf-height')).toHaveText('175 cm');
  await expect(view.locator('.bf-value')).toHaveText('13.7%');
  await page.click('[aria-label="Waist plus 0.5"]'); // updates live
  await expect(view.locator('.bf-value')).not.toHaveText('13.7%');

  await steppers.nth(2).locator('input').fill('101,5');
  await view.locator('.primary').click();
  await expect(page.locator('#tab-body .checkin-list li')).toHaveCount(2);
  await expect(tab.locator('.due-dot')).toHaveCount(0);
  const saved = (await readStore(page, 'checkins')).find((c) => c.date === day(0));
  expect(saved).toMatchObject({ waist: 80.5, neck: 37, glutes: 101.5, thighs: 58, arm: 30 });

  await page.click('.tabbar [data-tab=progress]');
  await page.click('#tab-progress .segmented button:has-text("Body")');
  await page.click('#tab-progress button:has-text("All")');
  await page.click('#tab-progress .chip:has-text("Body fat")');
  await expect(page.locator('#tab-progress .chart-title')).toHaveText('Body fat (US Navy estimate)');
  await expect(page.locator('#tab-progress .c-dot')).toHaveCount(2);
  await page.click('#tab-progress .chip:has-text("Upper arm")');
  await expect(page.locator('#tab-progress .chart-readout')).toContainText('30.0 cm');
  expect(errors).toEqual([]);
});
