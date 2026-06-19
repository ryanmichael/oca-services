/**
 * Snapshot the public surface of calendar-rules.js across a 4-year window
 * (2024–2027) for both new + old style. Output: canonical, sorted-key JSON
 * baselines that serve as the bit-for-bit oracle for the Track D module split.
 *
 * Usage:
 *   node scripts/snapshot-calendar-rules.js          # write baselines
 *   node scripts/snapshot-calendar-rules.js --check  # compare without writing
 *
 * The clock seam is pinned via CAL_FREEZE_TIME so `_meta.generatedAt` stays
 * deterministic.
 */

'use strict';

process.env.CAL_FREEZE_TIME = '2026-01-01T00:00:00.000Z';

const fs = require('fs');
const path = require('path');
const cal = require('../calendar-rules');

const YEARS = [2024, 2025, 2026, 2027];
const STYLES = ['new', 'old'];
const SNAP_DIR = path.join(__dirname, '..', 'test', 'snapshots');

// Scalar predicates — single value per (date, style). Listed alphabetically so
// the per-export baselines stay stable across refactors.
const SCALAR_EXPORTS = [
  'getDayOfWeek',
  'getEothinon',
  'getFeastRank',
  'getGreatFeastKey',
  'getLentenSaturdayNumber',
  'getLiturgicalKey',
  'getLiturgicalSeason',
  'getLiturgyVariant',
  'getTone',
  'getTrisagionSubstitution',
  'getWeekOfLent',
  'isBridegroomMatins',
  'isBurialVespersDay',
  'isLamentationsDay',
  'isLiturgyServed',
  'isPassionGospelsDay',
  'isPresanctifiedDay',
  'isRoyalHoursDay',
  'isSoulSaturday',
  'isVesperalLiturgyDay',
  'isVigilServed',
];

// canonical JSON: stable key order, no trailing newline differences
function canonical(obj) {
  return JSON.stringify(obj, sortKeys, 2) + '\n';
}
function sortKeys(_, v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = v[k]; return acc; }, {});
  }
  return v;
}

function* enumerateDates() {
  for (const year of YEARS) {
    const d = new Date(Date.UTC(year, 0, 1));
    while (d.getUTCFullYear() === year) {
      yield d.toISOString().slice(0, 10);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
}

function buildEntrySnapshot(style) {
  const out = {};
  for (const iso of enumerateDates()) {
    out[iso] = cal.generateCalendarEntry(iso, style) ?? null;
  }
  return out;
}

function buildScalarSnapshot(name, style) {
  const fn = cal[name];
  const out = {};
  for (const iso of enumerateDates()) {
    const d = new Date(iso + 'T00:00:00Z');
    // most scalar exports take (date) or (date, style); pass both — JS ignores extras
    let v;
    try { v = fn(d, style); } catch (e) { v = { __error: e.message }; }
    out[iso] = v === undefined ? null : v;
  }
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  fs.mkdirSync(SNAP_DIR, { recursive: true });

  const targets = [];
  for (const style of STYLES) {
    targets.push({
      file: path.join(SNAP_DIR, `calendar-entries-${style}.json`),
      content: canonical(buildEntrySnapshot(style)),
    });
    for (const name of SCALAR_EXPORTS) {
      targets.push({
        file: path.join(SNAP_DIR, `scalar-${name}-${style}.json`),
        content: canonical(buildScalarSnapshot(name, style)),
      });
    }
  }

  let drift = 0;
  for (const { file, content } of targets) {
    if (check) {
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (existing !== content) {
        console.error(`DRIFT: ${path.relative(process.cwd(), file)}`);
        drift++;
      }
    } else {
      fs.writeFileSync(file, content);
      console.log(`wrote ${path.relative(process.cwd(), file)} (${content.length.toLocaleString()} bytes)`);
    }
  }

  if (check) {
    if (drift) {
      console.error(`\n${drift} snapshot file(s) drifted. Run without --check to update.`);
      process.exit(1);
    } else {
      console.log(`OK: all ${targets.length} snapshot files match.`);
    }
  } else {
    console.log(`\nWrote ${targets.length} snapshot files to ${path.relative(process.cwd(), SNAP_DIR)}/`);
  }
}

main();
