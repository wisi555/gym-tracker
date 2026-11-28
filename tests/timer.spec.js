// Rest timer, with a fake clock so 2 minutes pass instantly.
const { test } = require('@playwright/test');
const { openApp, expect } = require('./helpers');

test('starts after a saved set, +30s, buzzes once at zero, then hides', async ({ page }) => {
  await page.addInitScript(() => {
    window.__buzz = [];
    Object.defineProperty(navigator, 'vibrate', { value: (p) => { window.__buzz.push(p); return true; } });
  });
  await page.clock.install();
  const { errors } = await openApp(page);
  const bar = page.locator('#rest-bar');
  await expect(bar).toBeHidden();
  await page.locator('#tab-log .exercise').first().click();
  await page.locator('#tab-log .editor .stepper').nth(0).locator('input').fill('20');
  await page.click('#tab-log .editor .primary');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('2:00');
  await page.clock.runFor(30_000);
  await expect(bar).toContainText('1:30');
  await page.click('.rest-btn:has-text("30s")');
  await expect(bar).toContainText('2:00');
  await page.clock.runFor(121_000);
  await expect(bar).toContainText('Rest over');
  expect(await page.evaluate(() => window.__buzz)).toContainEqual([200, 100, 200]);
  await page.clock.runFor(6_000);
  await expect(bar).toBeHidden();
  expect(errors).toEqual([]);
});
