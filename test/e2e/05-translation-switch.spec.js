'use strict';

const { test, expect } = require('@playwright/test');

test('switching translation overlay re-renders the open service panel', async ({ page }) => {
  await page.goto('/');

  // Open a service panel first so the translation switch has something to re-render.
  const firstRow = page.locator('.svc-row:not(.dimmed)').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  await firstRow.click();
  await expect(page.locator('#panel')).toHaveClass(/open/);
  await expect(page.locator('#p-body .rubric, #p-body .prayer').first()).toBeVisible({ timeout: 15_000 });

  // Open settings; #view-settings becomes visible, hides #view-main.
  await page.locator('#settings-btn').click();
  await expect(page.locator('#view-settings')).toHaveClass(/visible/);

  // /api/translations loads asynchronously. Wait for the select to have ≥2 options
  // (Default + at least one overlay).
  const select = page.locator('#translation-select');
  await expect.poll(
    async () => await select.locator('option').count(),
    { timeout: 10_000 }
  ).toBeGreaterThan(1);

  // Pick the first non-default option and assert the value sticks.
  const firstOptionValue = await select.locator('option').nth(1).getAttribute('value');
  expect(firstOptionValue).toBeTruthy();

  // Selecting fires setTranslation() → loadPanelContent() → /api/service?...&translation=<id>.
  // Wait on the network call as proof the switch reached the server.
  const reqPromise = page.waitForRequest(
    req => req.url().includes('translation=') && req.url().includes(encodeURIComponent(firstOptionValue)),
    { timeout: 10_000 },
  );
  await select.selectOption(firstOptionValue);
  await reqPromise;

  // localStorage records the choice so it survives reloads.
  const stored = await page.evaluate(() => localStorage.getItem('translation'));
  expect(stored).toBe(firstOptionValue);

  // Close settings and confirm the panel-head indicator surfaces the translation
  // (api-service now echoes back `translation: <id>` in the response JSON).
  await page.locator('#settings-done').click();
  await expect(page.locator('#view-settings')).not.toHaveClass(/visible/);
  // The indicator is the button wrapper `#p-meta-overlay-btn` — there is no bare
  // `#p-meta-overlay`. This assertion referenced one until 2026-08-08, so the
  // spec had been failing on a selector that never existed while the behaviour
  // it guards worked fine. e2e was not in the pre-push gate, so nothing surfaced it.
  await expect(page.locator('#p-meta-overlay-btn')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#p-meta-overlay-name')).not.toHaveText('');
});
