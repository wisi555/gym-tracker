// Progress photos: add, view, delete, compare, shrink, backup round-trip.
// The "photo" used here is the app's own icon (made-up content).
const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { openApp, readStore, day, expect } = require('./helpers');

const IMAGE = path.join(__dirname, '..', 'icons', 'icon-512.png');

async function openCheckin(page) {
  await page.click('.tabbar [data-tab=body]');
  await page.click('#tab-body .segmented button:has-text("Check-in")');
  await page.waitForSelector('.photo-slots');
}

async function addPhoto(page, pose) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click(`[aria-label="Add ${pose} photo"]`),
  ]);
  await chooser.setFiles(IMAGE);
  await expect(page.locator(`[aria-label^="${pose[0].toUpperCase() + pose.slice(1)} photo"] img`)).toHaveCount(1);
}

const photoCount = (page) => page.evaluate(() => new Promise((res) => {
  const q = indexedDB.open('gym-tracker');
  q.onsuccess = () => {
    const c = q.result.transaction('photos').objectStore('photos').count();
    c.onsuccess = () => { res(c.result); q.result.close(); };
  };
}));

test('add, view (back gesture closes), replace-safe delete', async ({ page }) => {
  const { errors, dialogs } = await openApp(page);
  await openCheckin(page);
  await expect(page.locator('.photo-panel')).toContainText('Relaxed, not flexed');
  await addPhoto(page, 'front');
  await addPhoto(page, 'back');
  expect(await photoCount(page)).toBe(2);
  const stored = await page.evaluate(() => new Promise((res) => {
    const q = indexedDB.open('gym-tracker');
    q.onsuccess = () => {
      const g = q.result.transaction('photos').objectStore('photos').get(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}|front`);
      g.onsuccess = () => { res({ type: g.result.blob.type, size: g.result.blob.size }); q.result.close(); };
    };
  }));
  expect(stored.type).toBe('image/jpeg');
  expect(stored.size).toBeGreaterThan(1000);
  await expect(page.locator('#tab-body .checkin-list')).toContainText('2 photos');

  await page.click('[aria-label="Front photo: view"]');
  await expect(page.locator('.photo-viewer')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.photo-viewer')).toHaveCount(0);

  await page.click('[aria-label="Back photo: view"]');
  await page.click('.photo-viewer button:has-text("Delete")');
  expect(dialogs.at(-1)).toContain('Delete the back photo');
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(page.locator('[aria-label="Add back photo"]')).toHaveCount(1);
  expect(await photoCount(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('big photos are shrunk to 1280 px on the long side', async ({ page }) => {
  await openApp(page);
  const size = await page.evaluate(async () => {
    const { shrinkPhoto } = await import('./checkin.js');
    const c = document.createElement('canvas');
    c.width = 3000; c.height = 2000;
    c.getContext('2d').fillRect(0, 0, 3000, 2000);
    const big = await new Promise((r) => c.toBlob(r, 'image/png'));
    const small = await shrinkPhoto(big);
    const bmp = await createImageBitmap(small);
    return [bmp.width, bmp.height, small.type];
  });
  expect(size).toEqual([1280, 853, 'image/jpeg']);
});

test('compare two check-ins; deleting a check-in removes its photos', async ({ page }) => {
  const { errors } = await openApp(page);
  await openCheckin(page);
  await page.fill('#checkin-date', day(-30));
  await addPhoto(page, 'front');
  await page.fill('#checkin-date', day(0));
  await addPhoto(page, 'front');
  await addPhoto(page, 'side');
  await page.click('text=Compare photos');
  await expect(page.locator('.compare-row')).toHaveCount(3);
  await expect(page.locator('.compare-row').nth(0).locator('img')).toHaveCount(2); // front: both dates
  await expect(page.locator('.compare-row').nth(1).locator('img')).toHaveCount(1); // side: only today
  await expect(page.locator('.compare-row').nth(1)).toContainText('No photo');
  await page.goBack();
  await expect(page.locator('.photo-slots')).toBeVisible();

  await page.click(`[aria-label^="Delete check-in of"] >> nth=1`); // the older one
  await expect(page.locator('#tab-body .checkin-list li')).toHaveCount(1);
  expect(await photoCount(page)).toBe(2);
  expect(errors).toEqual([]);
});

test('photos go into the backup file and come back on import', async ({ page }, testInfo) => {
  const { errors } = await openApp(page);
  await openCheckin(page);
  await addPhoto(page, 'side');
  await page.click('#settings-btn');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Export backup')]);
  const file = testInfo.outputPath('with-photos.json');
  await download.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(backup.data.photos).toHaveLength(1);
  expect(backup.data.photos[0].dataUrl.startsWith('data:image/jpeg')).toBe(true);
  expect(backup.data.photos[0].blob).toBeUndefined();

  // Wipe the photo, then restore the backup.
  await page.goBack();
  await page.click('[aria-label="Side photo: view"]');
  await page.click('.photo-viewer button:has-text("Delete")');
  expect(await photoCount(page)).toBe(0);
  await page.click('#settings-btn');
  const nav = page.waitForEvent('framenavigated');
  await page.setInputFiles('.settings input[type=file]', file);
  await nav;
  await page.waitForSelector('#tab-log .exercise');
  expect(await photoCount(page)).toBe(1);
  await openCheckin(page);
  await expect(page.locator('[aria-label="Side photo: view"] img')).toHaveCount(1);
  expect(errors).toEqual([]);
});
