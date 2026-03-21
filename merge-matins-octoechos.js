#!/usr/bin/env node
/**
 * merge-matins-octoechos.js
 * Merges scraped Matins data from matins-octoechos-scraped.json
 * into variable-sources/octoechos.json under toneN.sunday.matins.
 *
 * Usage: node merge-matins-octoechos.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const dryRun = process.argv.includes('--dry-run');

const OCTOECHOS_PATH = path.join(__dirname, 'variable-sources', 'octoechos.json');
const SCRAPED_PATH = path.join(__dirname, 'matins-octoechos-scraped.json');

const octoechos = JSON.parse(fs.readFileSync(OCTOECHOS_PATH, 'utf8'));
const scraped = JSON.parse(fs.readFileSync(SCRAPED_PATH, 'utf8'));

let added = 0;

for (let t = 1; t <= 8; t++) {
  const key = `tone${t}`;
  const matinsData = scraped[key]?.sunday?.matins;
  if (!matinsData) {
    console.log(`WARNING: No matins data for ${key}`);
    continue;
  }

  if (octoechos[key].sunday.matins) {
    console.log(`${key}: matins already exists, overwriting`);
  } else {
    console.log(`${key}: adding matins`);
  }

  octoechos[key].sunday.matins = matinsData;
  added++;
}

console.log(`\nMerged matins data for ${added} tones.`);

if (dryRun) {
  console.log('(dry run — no file written)');
} else {
  fs.writeFileSync(OCTOECHOS_PATH, JSON.stringify(octoechos, null, 2) + '\n');
  const size = fs.statSync(OCTOECHOS_PATH).size;
  console.log(`Written to ${OCTOECHOS_PATH} (${(size / 1024).toFixed(0)} KB)`);
}
