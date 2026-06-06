'use strict';

const { test, expect } = require('@playwright/test');

test('home loads and renders the service list', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Orthodox Daily Services/i);
  await expect(page.locator('.header-title')).toHaveText(/ORTHODOX DAILY SERVICES/i);

  // The service list is populated asynchronously from /api/days.
  // Wait for at least one clickable .svc-row to appear.
  const firstRow = page.locator('.svc-row:not(.dimmed)').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });

  // Week label should resolve out of the LOADING… placeholder.
  await expect(page.locator('#week-label')).not.toHaveText(/LOADING/i, { timeout: 15_000 });
});
