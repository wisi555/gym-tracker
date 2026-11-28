// Logging sets: last session, prefill, progression hint, delete, past days.
const { test } = require('@playwright/test');
const { openApp, seed, makeSets, day, expect } = require('./helpers');

const weightInput = (page) => page.locator('#tab-log .editor .stepper').nth(0).locator('input');
const repsInput = (page) => page.locator('#tab-log .editor .stepper').nth(1).locator('input');

test('last session, progression hint, prefill, decimal comma and delete', async ({ page }) => {
  const { errors, dialogs } = await openApp(page);
  await seed(page, { sets: makeSets([[2, 'chest-press', 'upper', [[45, 10], [45, 10], [45, 10]]]]) });
  await page.click('#tab-log .segmented button:has-text("Upper")');
  const card = page.locator('#tab-log .exercise', { hasText: 'Chest press' });
  await expect(card).toContainText('3×10 – 45 kg');
  await expect(card).toContainText('Add weight');

  await card.click();
  await expect(page.locator('.hint')).toContainText('10 reps on every set last time: try 47.5 kg');
  await expect(weightInput(page)).toHaveValue('45');
  await expect(repsInput(page)).toHaveValue('10');
  await page.click('.hint button:has-text("Use 47.5 kg")');
  await expect(weightInput(page)).toHaveValue('47.5');
  await page.click('#tab-log .editor .primary');
  await expect(page.locator('.saved-sets li')).toHaveCount(1);
  await expect(page.locator('.saved-sets')).toContainText('10 reps – 47.5 kg');
  await expect(page.locator('.hint')).toHaveCount(0);
  await expect(weightInput(page)).toHaveValue('47.5'); // carried forward

  await weightInput(page).fill('50,5');
  await repsInput(page).fill('8');
  await page.click('#tab-log .editor .primary');
  await expect(page.locator('.saved-sets')).toContainText('8 reps – 50.5 kg');

  await page.click('[aria-label="Delete set 2"]');
  expect(dialogs.at(-1)).toContain('Delete set 2');
  await expect(page.locator('.saved-sets li')).toHaveCount(1);

  await page.goBack();
  await expect(card).toContainText('1 set today');
  expect(errors).toEqual([]);
});

test('a past day can be logged and becomes "last session"', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.fill('#log-date', day(-1));
  await expect(page.locator('.past-banner')).toBeVisible();
  await page.click('#tab-log .segmented button:has-text("Upper")');
  await page.locator('#tab-log .exercise', { hasText: 'Seated row' }).click();
  await expect(page.locator('#tab-log .editor-head')).toContainText('Set 1 of 3');
  await weightInput(page).fill('30');
  await page.click('#tab-log .editor .primary');
  await expect(page.locator('.saved-sets li')).toHaveCount(1);
  await page.goBack();
  await page.click('.past-banner');
  await expect(page.locator('#tab-log .exercise', { hasText: 'Seated row' })).toContainText('1×8 – 30 kg');
  expect(errors).toEqual([]);
});
