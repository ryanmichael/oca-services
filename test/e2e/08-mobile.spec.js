'use strict';

const { test, expect } = require('@playwright/test');

// Phone-width contract. The ≤767px block in main.css was dead for months
// (a stray `}` made the parser swallow it), so these assert the *computed*
// result on a phone viewport, not just that the rules exist in the file.
// iPhone 13 viewport on the project's chromium (devices['iPhone 13'] would
// demand WebKit, which is not installed here).
test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });

test('phone: mobile rules apply, close is a 44px target, print is hidden', async ({ page }) => {
  await page.goto('/');

  const firstRow = page.locator('.svc-row:not(.dimmed)').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  await firstRow.click();
  await expect(page.locator('#panel')).toHaveClass(/open/, { timeout: 5_000 });
  await expect(page.locator('#p-body .prayer').first()).toBeVisible({ timeout: 15_000 });

  // Header padding is the canary for the whole ≤767px block being parsed.
  await expect(page.locator('header')).toHaveCSS('padding-left', '16px');
  await expect(page.locator('#btn-print')).toBeHidden();

  const close = await page.locator('#btn-close').boundingBox();
  expect(close.width).toBeGreaterThanOrEqual(44);
  expect(close.height).toBeGreaterThanOrEqual(44);

  // Reading text is scaled up for the phone, with a tighter leading than desktop.
  await expect(page.locator('#p-body .prayer').first()).toHaveCSS('font-size', '19px');

  // No horizontal overflow anywhere in the open panel.
  const overflow = await page.evaluate(() => {
    const b = document.getElementById('p-body');
    return b.scrollWidth - b.clientWidth;
  });
  expect(overflow).toBe(0);
});

test('phone: scrolling into the text folds the panel head; scrolling up restores it', async ({ page }) => {
  await page.goto('/');
  const firstRow = page.locator('.svc-row:not(.dimmed)').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  await firstRow.click();
  await expect(page.locator('#p-body .prayer').first()).toBeVisible({ timeout: 15_000 });

  const panel = page.locator('#panel');
  const head  = page.locator('.panel-head');
  const tall  = (await head.boundingBox()).height;

  // Scroll down in steps so each scroll event carries a positive delta.
  await page.evaluate(async () => {
    const b = document.getElementById('p-body');
    for (let i = 0; i < 10; i++) { b.scrollTop += 120; await new Promise(r => setTimeout(r, 30)); }
  });
  await expect(panel).toHaveClass(/reading/);
  await expect(page.locator('#p-date')).toBeHidden();
  const folded = (await head.boundingBox()).height;
  expect(folded).toBeLessThan(tall / 2);

  await page.evaluate(async () => {
    const b = document.getElementById('p-body');
    for (let i = 0; i < 3; i++) { b.scrollTop -= 40; await new Promise(r => setTimeout(r, 30)); }
  });
  await expect(panel).not.toHaveClass(/reading/);
  await expect(page.locator('#p-date')).toBeVisible();
});

test('phone: calendar close bar stays on screen below a full week list', async ({ page }) => {
  await page.goto('/');
  await page.locator('#date-btn').click();
  await expect(page.locator('#view-cal')).toHaveClass(/visible/);
  await expect(page.locator('.css-row').first()).toBeVisible({ timeout: 15_000 });

  // The view rises in over ~.4s; poll until it settles rather than measuring mid-flight.
  await expect.poll(() => page.evaluate(() => {
    const r = document.getElementById('cal-close-mobile').getBoundingClientRect();
    return r.bottom <= window.innerHeight && r.top >= 0;
  }), { timeout: 5_000 }).toBe(true);
});
