// Appearance: Light (default), Dark, Auto.
const { test } = require('@playwright/test');
const { openApp, expect } = require('./helpers');

const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme);

test('dark mode is remembered; Auto follows the phone', async ({ page }) => {
  const { errors } = await openApp(page);
  expect(await theme(page)).toBe('light');
  await page.click('#settings-btn');
  await page.click('.settings button:has-text("Dark")');
  expect(await theme(page)).toBe('dark');
  await page.reload();
  await page.waitForSelector('#tab-log .exercise');
  expect(await theme(page)).toBe('dark');
  await page.click('#settings-btn');
  await page.click('.settings button:has-text("Auto")');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(page)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => theme(page)).toBe('light');
  expect(errors).toEqual([]);
});
