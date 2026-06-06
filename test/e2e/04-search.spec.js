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
