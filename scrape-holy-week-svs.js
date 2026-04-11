#!/usr/bin/env node
/**
 * scrape-holy-week-svs.js
 *
 * Parses the OCA Holy Week Vol. 3 (SVS Press, 2005) text extraction
 * and updates lamentations-fixed.json with the official OCA translation.
 *
 * Prerequisites:
 *   python3 extraction of text pages from holy_week_vol3.pdf into /tmp/svs_stases_raw.json
 *
 * Usage:
 *   node scrape-holy-week-svs.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Load raw extraction ─────────────────────────────────────────────────────

const rawPath = '/tmp/svs_stases_raw.json';
if (!fs.existsSync(rawPath)) {
  console.error('Missing /tmp/svs_stases_raw.json — run the Python extraction first.');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a stasis text into an array of { troparion, psalm } pairs.
 *
 * The text alternates between:
 *   - Numbered troparia: "1. In a tomb they laid Thee, ..."
 *   - Psalm verses in ALL CAPS: "BLESSED ARE THOSE WHOSE WAY IS ..."
 *
 * The opening psalm verse comes before troparion #1.
 * Each troparion is followed by its psalm verse.
 */
function parseStasis(text, stasisNum) {
  // Trim at music notation boundary (sheet music pages follow text pages)
  const musicIdx = text.indexOf('&\n?');
  const cleanText = musicIdx > 0 ? text.slice(0, musicIdx) : text;

  // Clean up: remove page numbers (bare numbers on their own line), page breaks
  const lines = cleanText
    .replace(/--- PAGE BREAK ---/g, '')
    // Remove rubric lines like "And then, the first troparion is repeated:"
    .replace(/And then,.*repeated:/gi, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    // Remove bare page numbers (1-3 digit number alone on a line)
    .filter(l => !/^\d{1,3}$/.test(l));

  const entries = [];
  let currentType = null; // 'psalm' or 'troparion'
  let currentText = [];
  let currentNum = null;

  function flush() {
    if (currentText.length === 0) return;
    const text = currentText.join('\n');
    if (currentType === 'psalm') {
      entries.push({ type: 'psalm', text });
    } else if (currentType === 'troparion') {
      entries.push({ type: 'troparion', num: currentNum, text });
    }
    currentText = [];
  }

  for (const line of lines) {
    // Detect numbered troparion start: "1. In a tomb..."
    const tropMatch = line.match(/^(\d+)\.\s+(.+)$/);
    // Detect psalm verse: ALL CAPS line (at least 20 chars, >80% uppercase)
    const upperRatio = line.replace(/[^a-zA-Z]/g, '').length > 0
      ? (line.replace(/[^A-Z]/g, '').length / line.replace(/[^a-zA-Z]/g, '').length)
      : 0;
    const isPsalm = upperRatio > 0.8 && line.length > 10;

    if (tropMatch) {
      flush();
      currentType = 'troparion';
      currentNum = parseInt(tropMatch[1]);
      currentText = [tropMatch[2]];
    } else if (isPsalm && currentType !== 'psalm') {
      flush();
      currentType = 'psalm';
      currentText = [line];
    } else {
      // Continuation of current block
      currentText.push(line);
    }
  }
  flush();

  // Now pair them: psalm verse followed by troparion, or troparion followed by psalm
  // The structure is: [opening psalm] [trop 1] [psalm] [trop 2] [psalm] ...
  // But sometimes the opening line is a refrain, not a psalm verse
  const result = [];
  let i = 0;

  // Opening refrain/psalm (before troparion 1)
  if (entries[0]?.type === 'psalm') {
    // This is the opening refrain — skip it, it's part of the structure
    i = 1;
  }

  // Pair troparia with their following psalm verses
  while (i < entries.length) {
    const entry = entries[i];
    if (entry.type === 'troparion') {
      const pair = { num: entry.num, troparion: entry.text };
      // Look ahead for psalm verse
      if (i + 1 < entries.length && entries[i + 1].type === 'psalm') {
        pair.psalm = entries[i + 1].text;
        i += 2;
      } else {
        i++;
      }
      result.push(pair);
    } else {
      // Standalone psalm verse (shouldn't happen after pairing, but handle gracefully)
      i++;
    }
  }

  // Remove repeated troparion #1 at the end (rubric: "the first troparion is repeated")
  if (result.length > 1 && result[result.length - 1].num === 1) {
    result.pop();
  }

  return result;
}

// ─── Parse all three stases ──────────────────────────────────────────────────

const stasis1 = parseStasis(raw.stasis1, 1);
const stasis2 = parseStasis(raw.stasis2, 2);
const stasis3 = parseStasis(raw.stasis3, 3);

console.log(`Stasis 1: ${stasis1.length} troparia`);
console.log(`Stasis 2: ${stasis2.length} troparia`);
console.log(`Stasis 3: ${stasis3.length} troparia`);

// Show a sample
console.log('\n--- Sample (Stasis 1, #1) ---');
console.log('Troparion:', stasis1[0]?.troparion?.slice(0, 80));
console.log('Psalm:', stasis1[0]?.psalm?.slice(0, 80));

if (DRY_RUN) {
  console.log('\n--- Dry run: not writing files ---');

  // Show all troparia counts and last entries
  for (const [name, stasis] of [['Stasis 1', stasis1], ['Stasis 2', stasis2], ['Stasis 3', stasis3]]) {
    console.log(`\n${name}: ${stasis.length} troparia (nums: ${stasis[0]?.num}..${stasis[stasis.length-1]?.num})`);
    // Check for any without psalm
    const noPsalm = stasis.filter(s => !s.psalm);
    if (noPsalm.length) {
      console.log(`  WARNING: ${noPsalm.length} troparia without psalm verse:`, noPsalm.map(s => s.num));
    }
  }
  process.exit(0);
}

// ─── Update lamentations-fixed.json ──────────────────────────────────────────

const fixedPath = path.join(__dirname, 'fixed-texts', 'lamentations-fixed.json');
const fixed = JSON.parse(fs.readFileSync(fixedPath, 'utf8'));

function buildStasisData(parsed, tone, refrain) {
  return {
    tone,
    refrain,
    _source: 'svs-holyWeek-vol3-2005',
    verses: parsed.map(entry => ({
      psalm: entry.psalm || '',
      troparion: entry.troparion,
    })),
  };
}

// Stasis 1: Tone 5, "Blessed art Thou, O Lord..."
fixed.stasis1 = buildStasisData(stasis1, 5,
  'Blessed art Thou, O Lord! Teach me Thy statutes.');

// Stasis 2: Tone 5, "Worthy is it to magnify Thee..."
fixed.stasis2 = buildStasisData(stasis2, 5,
  'It is right to magnify Thee, O Life-giving Lord.');

// Stasis 3: Tone 3, "Every generation..."
fixed.stasis3 = buildStasisData(stasis3, 3,
  'Every generation offers Thee its hymn of praise at Thy burial, O my Christ.');

// Write back
fs.writeFileSync(fixedPath, JSON.stringify(fixed, null, 2) + '\n', 'utf8');
console.log(`\nUpdated ${fixedPath}`);
console.log(`  Stasis 1: ${stasis1.length} verses`);
console.log(`  Stasis 2: ${stasis2.length} verses`);
console.log(`  Stasis 3: ${stasis3.length} verses`);
