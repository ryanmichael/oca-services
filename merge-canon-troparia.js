#!/usr/bin/env node
/**
 * merge-canon-troparia.js
 *
 * Merges scraped canon troparia into octoechos.json.
 * Adds a `canonTroparia` key alongside the existing `canonIrmoi` in each
 * tone's sunday.matins section.
 *
 * Usage:
 *   node merge-canon-troparia.js           — merge and write
 *   node merge-canon-troparia.js --dry-run — show what would change
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OCT_PATH    = path.join(__dirname, 'variable-sources/octoechos.json');
const SCRAPED_PATH = path.join(__dirname, 'canon-troparia-scraped.json');

const dryRun = process.argv.includes('--dry-run');

const octoechos = JSON.parse(fs.readFileSync(OCT_PATH, 'utf8'));
const scraped   = JSON.parse(fs.readFileSync(SCRAPED_PATH, 'utf8'));

let totalAdded = 0;

for (let tone = 1; tone <= 8; tone++) {
  const key = `tone${tone}`;
  const scrapedTone = scraped[key];
  if (!scrapedTone || !scrapedTone.canonTroparia) {
    console.log(`Tone ${tone}: SKIPPED (no scraped data)`);
    continue;
  }

  const matins = octoechos[key]?.sunday?.matins;
  if (!matins) {
    console.log(`Tone ${tone}: SKIPPED (no matins section in octoechos.json)`);
    continue;
  }

  const troparia = scrapedTone.canonTroparia;
  const odes = Object.keys(troparia).sort((a, b) => Number(a) - Number(b));
  let toneCount = 0;
  for (const ode of odes) {
    toneCount += troparia[ode].length;
  }

  matins.canonTroparia = troparia;
  console.log(`Tone ${tone}: ${toneCount} troparia across ${odes.length} odes`);
  totalAdded += toneCount;
}

console.log(`\nTotal: ${totalAdded} troparia across all tones`);

if (dryRun) {
  console.log('\n(dry run — no files written)');
} else {
  fs.writeFileSync(OCT_PATH, JSON.stringify(octoechos, null, 2) + '\n');
  console.log(`\nWritten to ${OCT_PATH}`);
}
