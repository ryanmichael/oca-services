'use strict';

const { test, expect } = require('@playwright/test');

test('settings calendar-style toggle drives the response style', async ({ page }) => {
  await page.goto('/');

  // Open a service panel so subsequent style changes have something to reload.
  const firstRow = page.locator('.svc-row:not(.dimmed)').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  await firstRow.click();
  await expect(page.locator('#panel')).toHaveClass(/open/);
  await expect(page.locator('#p-body .rubric, #p-body .prayer').first()).toBeVisible({ timeout: 15_000 });

  // Open settings; #style-toggle should be present.
  await page.locator('#settings-btn').click();
  await expect(page.locator('#view-settings')).toHaveClass(/visible/);
  const styleToggle = page.locator('#style-toggle');
  await expect(styleToggle).toBeVisible();

  // Default chip is active on first open.
  await expect(styleToggle.locator('.seg-btn[data-style=""]')).toHaveClass(/active/);

  // Pick Old. setStyle() fires a /api/days reload plus a panel reload —
  // both should carry &style=old. Wait on the panel-reload request as the
  // proof that the toggle reached the server.
  const reqPromise = page.waitForRequest(
    req => /\/api\/(service|matins|liturgy)\?/.test(req.url()) && req.url().includes('style=old'),
    { timeout: 10_000 },
  );
  await styleToggle.locator('.seg-btn[data-style="old"]').click();
  await reqPromise;

  // localStorage persistence so the choice survives reloads.
  const stored = await page.evaluate(() => localStorage.getItem('style'));
  expect(stored).toBe('old');

  // The Old chip is the active one now.
  await expect(styleToggle.locator('.seg-btn[data-style="old"]')).toHaveClass(/active/);
});

test('opening settings shows the calendar-style group with the three chips', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.svc-row:not(.dimmed)').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('#settings-btn').click();
  await expect(page.locator('#view-settings')).toHaveClass(/visible/);

  const chips = page.locator('#style-toggle .seg-btn');
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toHaveText('Default');
  await expect(chips.nth(1)).toHaveText('New');
  await expect(chips.nth(2)).toHaveText('Old');
});
