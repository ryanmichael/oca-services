'use strict';

const { test, expect } = require('@playwright/test');

test('clicking a service row opens the detail panel with rendered blocks', async ({ page }) => {
  await page.goto('/');

  const firstRow = page.locator('.svc-row:not(.dimmed)').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  await firstRow.click();

  // Panel slides open and #p-svc shows the service label (uppercased).
  await expect(page.locator('#panel')).toHaveClass(/open/, { timeout: 5_000 });
  await expect(page.locator('#p-svc')).not.toHaveText('', { timeout: 5_000 });

  // The loading placeholder should be replaced by real block content.
  const body = page.locator('#p-body');
  await expect(body).not.toHaveText(/^Loading/i, { timeout: 15_000 });

  // Rendered blocks carry classes from renderer.js. At least one rubric/prayer
  // block-row should be present once the response lands.
  await expect(body.locator('.rubric, .prayer').first()).toBeVisible({ timeout: 15_000 });
});
