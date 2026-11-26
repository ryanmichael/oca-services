'use strict';

/**
 * Feature contract (browser): a pointer to the appendix names the page the
 * appendix is actually printed on.
 * Spec: features/silent-communion-prayers.md § "In print, at the back"
 *
 * With `liturgy.silentCommunionPrayersInAppendix` the silent pre-Communion
 * prayer prints at the back of the book and the Communion Hymn prints
 * "…found at the back of this book (page N)." N is filled in after
 * pagination, so only laid-out pages can check it: the node suites render
 * no geometry. The Parish Book prints folios; the weekly booklet prints
 * none, so its pointer carries no number.
 *
 * Run: npm run test:e2e
 */

const { test, expect } = require('@playwright/test');

test('Parish Book: the pointer names the folio the appendix starts on', async ({ page }) => {
  await page.goto('/parish-book?parish=st-john-damascus-tyler');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const halves = [...document.querySelectorAll('#pb-pages .bk-half')];
    const at = halves.findIndex(h => h.querySelector('.appendix-head'));
    const ptr = document.querySelector('#pb-pages .print-pointer');
    return {
      at,
      headFirst: at >= 0 && halves[at].firstElementChild.classList.contains('appendix-head'),
      folio: at >= 0 ? (halves[at].querySelector('.pb-folio') || {}).textContent : null,
      pointer: ptr ? ptr.textContent : null,
      pointerPage: halves.findIndex(h => h.contains(ptr)),
      prayers: halves.filter(h => h.textContent.includes('O Lord my God, I know that I am not worthy')).length,
    };
  });
  expect(r.at, 'an appendix exists').toBeGreaterThan(0);
  expect(r.headFirst, 'it starts a fresh page').toBe(true);
  expect(r.pointerPage, 'the pointer is before the appendix').toBeLessThan(r.at);
  expect(r.pointer).toContain(`(page ${r.folio}).`);
  expect(r.pointer).not.toContain('00');
  expect(r.prayers, 'the prayer is printed once').toBe(1);
});

test('booklet: the prayer prints once, at the back, after a page break', async ({ page }) => {
  const src = encodeURIComponent(
    '/api/liturgy?date=2026-10-11&parish=st-john-damascus-tyler&translation=st-john-damascus-tyler');
  await page.goto(`/booklet?src=${src}&title=DIVINE+LITURGY&sub=test`);
  await page.waitForFunction(() => document.querySelectorAll('#bk-root .bk-spread').length > 0,
    null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const src = document.getElementById('bk-source').innerHTML;
    const head = document.querySelector('#bk-sheets .appendix-head');
    return {
      prayers: src.split('O Lord my God, I know that I am not worthy').length - 1,
      appendixLast: src.lastIndexOf('svc-sec print-appendix') > src.lastIndexOf('<div class="svc-sec">'),
      headFirst: !!head && head.parentElement.firstElementChild === head,
      pointer: (document.querySelector('#bk-source .print-pointer') || {}).textContent,
    };
  });
  expect(r.prayers).toBe(1);
  expect(r.appendixLast).toBe(true);
  expect(r.headFirst).toBe(true);
  expect(r.pointer).toMatch(/back of this book\.$/);
});
