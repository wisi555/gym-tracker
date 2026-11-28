// The app shell: loads cleanly, installable, offline, updates, navigation.
const { test } = require('@playwright/test');
const { openApp, expect } = require('./helpers');

test('loads without errors; icon tabs switch sections', async ({ page }) => {
  const { errors } = await openApp(page);
  await expect(page.locator('.tabbar button svg')).toHaveCount(3);
  for (const [tab, title] of [['body', 'Body'], ['progress', 'Progress'], ['log', 'Log']]) {
    await page.click(`.tabbar [data-tab=${tab}]`);
    await expect(page.locator('#title')).toHaveText(title);
  }
  expect(errors).toEqual([]);
});

test('Chrome sees it as installable', async ({ page, context }) => {
  await openApp(page);
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
});

test('works offline after the first visit', async ({ page, context }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#tab-log .exercise');
  await page.click('.tabbar [data-tab=progress]');
  await page.waitForSelector('.week-bars');
  expect(errors).toEqual([]);
});

test('a new version replaces the old one and the app reloads itself', async ({ page, request }) => {
  await request.post('/__test/reset');
  await openApp(page);
  await page.reload(); // now controlled by the service worker
  await page.waitForSelector('#tab-log .exercise');
  const before = (await page.textContent('#version')).trim();
  await request.post('/__test/bump');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await expect(page.locator('#version')).toHaveText(`${before}-test1`, { timeout: 15_000 });
  const caches = await page.evaluate(() => caches.keys());
  expect(caches).toHaveLength(1); // the old copy was deleted
  await request.post('/__test/reset');
});

test('settings opens from the header and closes with the back gesture', async ({ page }) => {
  await openApp(page);
  await page.click('#settings-btn');
  await expect(page.locator('#title')).toHaveText('Settings');
  await page.goBack();
  await expect(page.locator('#title')).toHaveText('Log');
});
