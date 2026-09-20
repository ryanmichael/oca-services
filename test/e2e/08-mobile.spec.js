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
  await expect(page.locator('#p-body .prayer').first()).toHaveCSS('font-size', '22px');

  // No horizontal overflow anywhere in the open panel.
  const overflow = await page.evaluate(() => {
    const b = document.querySelector('.panel-scroll');
    return b.scrollWidth - b.clientWidth;
  });
  expect(overflow).toBe(0);
});

test('phone: nothing is pinned — the head scrolls away, only the close button stays', async ({ page }) => {
  await page.goto('/');
  const firstRow = page.locator('.svc-row:not(.dimmed)').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  await firstRow.click();
  await expect(page.locator('#p-body .prayer').first()).toBeVisible({ timeout: 15_000 });

  const title = page.locator('#p-svc');
  await expect(title).toBeInViewport();

  await page.evaluate(() => { document.querySelector('.panel-scroll').scrollTop = 1200; });

  // The title (and with it the whole head) has left the screen…
  await expect(title).not.toBeInViewport();
  // …but the close button is still there, full size, and still closes.
  const close = page.locator('#btn-close');
  await expect(close).toBeInViewport();
  const box = await close.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(page.locator('#panel')).not.toHaveClass(/open/);

  // Reopening a service starts back at the top, not at the old scroll offset.
  await firstRow.click();
  await expect(page.locator('#p-body .prayer').first()).toBeVisible({ timeout: 15_000 });
  await expect(title).toBeInViewport();
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
