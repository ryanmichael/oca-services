'use strict';

// The Divine Liturgy's service-type picker.
//
// These four options were hardcoded in index.html, and their labels again in
// two ternary chains in app.js, and their endpoints in a third — four copies,
// already drifted ("+ DEACON" on the chip vs "WITH DEACON" in the panel) with
// nothing to say which was intended. They are now generated from
// LITURGY_SERVICE_TYPES, the one home for the axis.
//
// Generating them moved the markup out of the HTML, so nothing static proves
// the picker is populated any more. That is what this spec is for: it fails if
// the registry stops rendering, if a key stops routing to its endpoint, or if
// the chip and the panel heading disagree about the same type.

const { test, expect } = require('@playwright/test');

/** Opens a Divine Liturgy panel and returns its row. */
async function openLiturgy(page) {
  await page.goto('/');
  const row = page.locator('.svc-row[data-svc="liturgy"]:not(.dimmed)').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.locator('#panel')).toHaveClass(/open/);
  await expect(page.locator('#p-body .rubric, #p-body .prayer').first())
    .toBeVisible({ timeout: 15_000 });
  return row;
}

test('the service-type picker renders every registered type', async ({ page }) => {
  await openLiturgy(page);

  await page.locator('#p-meta-type-btn').click();
  await expect(page.locator('#view-liturgy-variant')).toHaveClass(/visible/);

  const opts = page.locator('#lv-options .pd-option');
  await expect(opts).toHaveCount(4);
  await expect(opts.locator('.pd-option-name')).toHaveText([
    'Standard',
    "Reader's Typika",
    "Reader's Typika + Deacon",
    'Typika + Communion of Reserved Gifts',
  ]);
  // Every option carries a description; an empty one means a registry entry
  // shipped without its `desc`.
  for (let i = 0; i < 4; i++) {
    await expect(opts.nth(i).locator('.pd-option-desc')).not.toBeEmpty();
  }

  // The type showing is marked. Before the registry the list gave no sign of
  // which one was active while the panel chip read "TYPE: STANDARD".
  await expect(opts.nth(0)).toHaveClass(/active/);
});

test('choosing a type switches the service and the panel heading follows', async ({ page }) => {
  await openLiturgy(page);
  await expect(page.locator('#pd-type-val')).toHaveText('Standard');

  await page.locator('#p-meta-type-btn').click();
  await page.locator('#lv-options .pd-option[data-svc="typikaCrg"]').click();

  // Panel heading comes from the registry's `panel`, which is deliberately
  // longer than the chip's `chip` — the two differ by design, not by drift.
  await expect(page.locator('#panel')).toHaveClass(/open/);
  await expect(page.locator('#p-svc'))
    .toHaveText(/READER'S TYPIKA WITH COMMUNION OF THE RESERVED GIFTS/i, { timeout: 15_000 });

  // …and the compact chip shows the short form for the same type, title-cased
  // (toTitleCase keeps "of" lowercase, so this is not a plain capitalisation).
  await expect(page.locator('#pd-type-val')).toHaveText('Typika + Communion of Reserved Gifts');

  // The body really is the Typika service, not the Liturgy relabelled.
  await expect(page.locator('#p-body')).toContainText(/Typika|In Thy Kingdom/i);

  // Reopening the picker marks the new type, not the old one.
  await page.locator('#p-meta-type-btn').click();
  await expect(page.locator('#lv-options .pd-option[data-svc="typikaCrg"]')).toHaveClass(/active/);
  await expect(page.locator('#lv-options .pd-option[data-svc="liturgy"]')).not.toHaveClass(/active/);
});
