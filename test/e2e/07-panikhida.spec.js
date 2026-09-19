'use strict';

const { test, expect } = require('@playwright/test');

// The Panikhida is the one service reached by a form, not a date row. It is
// found through SEARCH ("memorial"). Covers: search → SERVICES row → form →
// panel; singular/feminine inflection; brief canon; deep link restores both.

/** Open the Panikhida form the way a user does: search, click the service row. */
async function openPanikhidaViaSearch(page) {
  await page.goto('/');
  await expect(page.locator('.svc-row:not(.dimmed)').first()).toBeVisible({ timeout: 15_000 });
  await page.click('#search-btn');
  await page.fill('#search-input', 'memorial');
  const row = page.locator('.result-row--service', { hasText: 'Panikhida' });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.locator('.result-tag')).toHaveText(/SET UP/);
  await row.click();
  await expect(page.locator('#view-panikhida')).toHaveClass(/visible/, { timeout: 5_000 });
}

test('search → Panikhida form renders into the panel', async ({ page }) => {
  await openPanikhidaViaSearch(page);

  await page.fill('#pk-names', 'Anna');
  await expect(page.locator('#pk-gender-group')).not.toHaveClass(/disabled/);
  await page.click('#pk-gender .seg-btn[data-gender="f"]');
  await page.click('#pk-canon .seg-btn[data-canon="brief"]');
  await page.click('#pk-submit');

  await expect(page.locator('#panel')).toHaveClass(/open/);
  await expect(page.locator('#p-svc')).toHaveText('PANIKHIDA');
  await expect(page.locator('#p-date')).toHaveText('For Anna');

  const body = page.locator('#p-body');
  await expect(body).toContainText('Memory eternal!', { timeout: 15_000 });
  await expect(body).toContainText('Her soul shall dwell with the blessed.');
  await expect(body).not.toContainText('When Israel passed on foot');   // brief: no Ode I
  await expect(body).toContainText('Beholding the sea of life');         // brief: Ode VI kept

  await expect(page).toHaveURL(/svc=panikhida&names=Anna&gender=f&canon=brief/);
});

test('two names disable the gender picker and read in the plural', async ({ page }) => {
  await openPanikhidaViaSearch(page);
  await page.fill('#pk-names', 'John, Mary');
  await expect(page.locator('#pk-gender-group')).toHaveClass(/disabled/);
  await expect(page.locator('#pk-names-hint')).toHaveText(/2 names/);
  await page.click('#pk-submit');
  await expect(page.locator('#p-body')).toContainText('Their souls shall dwell with the blessed.', { timeout: 15_000 });
  await expect(page.locator('#p-body')).toContainText('servants of God, John, Mary,');
});

test('deep link restores the form and opens the panel', async ({ page }) => {
  await page.goto('/?svc=panikhida&names=Peter&canon=brief&psalm90=0');
  await expect(page.locator('#p-body')).toContainText('His soul shall dwell with the blessed.', { timeout: 20_000 });
  await expect(page.locator('#p-body')).not.toContainText('He that dwells in the help of the Highest'); // Psalm 90 omitted
  await expect(page.locator('#pk-names')).toHaveValue('Peter');
  await expect(page.locator('#pk-canon .seg-btn[data-canon="brief"]')).toHaveClass(/active/);
  await expect(page.locator('#pk-ps90 .seg-btn[data-ps90="0"]')).toHaveClass(/active/);
});
