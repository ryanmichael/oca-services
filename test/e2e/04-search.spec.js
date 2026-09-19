'use strict';

const { test, expect } = require('@playwright/test');

test('search opens, accepts a query, and renders results', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.svc-row:not(.dimmed)').first()).toBeVisible({ timeout: 15_000 });

  await page.locator('#search-btn').click();
  await expect(page.locator('#view-search')).toHaveClass(/visible/);

  // Idle state: hint suggestions visible.
  await expect(page.locator('#search-hint .hint-tag').first()).toBeVisible();

  // Type a query that should match calendar entries (e.g. St John feasts).
  await page.locator('#search-input').fill('John');

  // Debounce + spinner + results — wait for the results area to populate.
  const results = page.locator('#search-results');
  await expect(results).not.toBeEmpty({ timeout: 10_000 });
});

test('search finds services by name and reports the next date they are served', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.svc-row:not(.dimmed)').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('#search-btn').click();

  // A seasonal one-off: the row carries the next date and opens it.
  await page.locator('#search-input').fill('presanctified');
  const row = page.locator('.result-row--service', { hasText: 'Presanctified Liturgy' });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.locator('.result-date')).toHaveText(/^Next: /);
  await expect(row.locator('.result-tag')).toHaveText(/VIEW/);
  await row.click();
  await expect(page.locator('#panel')).toHaveClass(/open/, { timeout: 15_000 });
  await expect(page.locator('#p-svc')).toHaveText(/PRESANCTIFIED/);

  // Saints still come back, under their own heading, for a saint query.
  await page.locator('#btn-close').click();
  await page.locator('#search-btn').click();
  await page.locator('#search-input').fill('nicholas');
  await expect(page.locator('.results-eyebrow', { hasText: 'SAINTS & FEASTS' })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.result-row--service')).toHaveCount(0);
});
