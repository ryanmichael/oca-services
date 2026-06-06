'use strict';

const { test, expect } = require('@playwright/test');

test('date picker opens a service from a week-strip day', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.svc-row:not(.dimmed)').first()).toBeVisible({ timeout: 15_000 });

  await page.locator('#date-btn').click();
  await expect(page.locator('#view-cal')).toHaveClass(/visible/);

  // Pick the first available service from the week's feast list (most reliable —
  // these rows are pre-rendered and always have a data-svc.)
  const firstRow = page.locator('.css-row:not(.unavail)').first();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });
  await firstRow.click();

  // Calendar view should close and the service panel should open with content.
  await expect(page.locator('#view-cal')).not.toHaveClass(/visible/, { timeout: 5_000 });
  await expect(page.locator('#panel')).toHaveClass(/open/, { timeout: 10_000 });
  await expect(page.locator('#p-body')).not.toHaveText(/^Loading/i, { timeout: 15_000 });
});
