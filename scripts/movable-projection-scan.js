#!/usr/bin/env node
'use strict';

// Movable-service projection scan — a movable day's propers sitting on a
// FIXED-date commemoration.
//
// OCA publishes service texts by CALENDAR DATE. When a movable commemoration
// occupies a date (the Sunday of the Holy Fathers, a Lenten Sunday, a memorial
// Saturday), a scrape of that date captures the movable propers — and if it is
// then keyed by month-day, those texts land on whichever fixed saint our
// calendar holds there. The saint's own hymns are replaced wholesale and the
// render credits him with them, so the defect is audible but invisible to the
// structural audit: the rows are correctly LABELLED for the commemoration they
// sit on. `audit:date` was 0/0/0 on every instance found so far.
//
// The signal this scan uses is structural rather than textual. The same
// scrapes also populated the `blocks` table, and there they are keyed
// MOVABLY — `liturgical_key = pentecostarion.week.7.sunday`, `triodion.…`.
// So a `stichera` row whose text is already held in `blocks` under a movable
// key is a second, fixed-date projection of a movable service. The movable
// copy is the one the assembler serves for the real date; the fixed-date copy
// only corrupts whatever saint it landed on.
//
// Worked example (2026-10-29): comms 1090 (6-1, Day of the Holy Spirit) and
// 1216 (6-16, St Tikhon of Amathus) each held the complete 7th-Sunday-of-
// Pascha set — 3 Ascension idiomela, 4 of the Fathers and the Fathers' Glory,
// exactly as reference/orders/2026-0524 appoints — scraped from 2025-06-01 and
// 2024-06-16, the day that Sunday fell in each year. 2026-06-15 eve sang "The
// Lord has ascended into heaven" under St Tikhon's name in mid-June. Deleting
// both left 2026-05-23 eve byte-identical, because `blocks` serves it.
//
// Two buckets, reported separately:
//
//   projection — movable propers on a commemoration that is a FIXED saint.
//                A defect. Remediate by deleting the fixed-date rows once the
//                movable copy is confirmed to serve the real date.
//   movable-keyed — movable propers on a commemoration that is ITSELF a
//                movable day stored under a fixed month-day. Not this bug;
//                it is the known "Vespers is not movable" modelling gap, where
//                the record is only correct in the year it was keyed from.
//
//   node scripts/movable-projection-scan.js
//   node scripts/movable-projection-scan.js --check audit/movable-projection-baseline.json
//   node scripts/movable-projection-scan.js --capture-baseline audit/movable-projection-baseline.json
//
// --check exits 2 on a commemoration the baseline does not list, and does not
// fail on the known ones — a drift guard over a burn-down, the same shape as
// glory-theotokion, plural-address and rescrape-baseline. Remediation needs
// the OCA order read first (confirm the movable copy serves the real date
// before deleting anything), so the list shrinks a commemoration at a time.

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Commemorations that are themselves movable days stored under a fixed
// month-day. Their movable-book content is expected; the fixed key is the
// modelling gap, not a mis-key.
const MOVABLE_TITLE = new RegExp([
  '^Great and Holy ',
  '^HOLY PASCHA',
  '^Bright ',
  '^Antipascha',
  '^Postfeast of Pentecost',
  '^The Ascension of our Lord',
  '^Holy Pentecost',
  '^\\d+(?:st|nd|rd|th) (?:Sunday|Saturday) of Great Lent',
  '^Sunday of ',
  '^Saturday of ',
  '^Memorial Saturday',
  '^The Raising of Lazarus',
  '^Sunday after ',
  '^Sunday before ',
  // The Ecumenical-Council Fathers are movable too — the Sunday before
  // Pentecost, the Sunday nearest July 16 and the Sunday on or after Oct 11 —
  // so their own propers are expected on them. Same three commemorations
  // exempted in drift.js's rank-saint_type rule, for the same reason.
  'Fathers of the .*Council',
].join('|'), 'i');

// Normalise for comparison: `blocks` stores a hymn split across rows and
// carries the "//" musical break marker, so neither equality nor a shared
// prefix is reliable. Shingles over normalised text survive both.
function norm(s) {
  return String(s || '')
    .replace(/\/\//g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A 120-character window, not a shorter one. Liturgical formulae are shared
// across books legitimately — "What shall we call thee, O…", "We bless thee, O
// Virgin Theotokos" — and at 40 chars they match three commemorations that
// hold no movable content at all (comms 5, 49, 145). Swept against the ten
// commemorations already known to carry this defect: 40 and 80 keep all ten
// but admit formulae, 120 keeps all ten with none, and 160 starts dropping
// true positives. A copied hymn shares its body; a formula shares an incipit.
const SHINGLE = 120;
const STRIDE  = 10;

function shingles(text) {
  const out = [];
  for (let i = 0; i + SHINGLE <= text.length; i += STRIDE) out.push(text.slice(i, i + SHINGLE));
  return out;
}

function scan() {
  const { openDb } = require(path.join(ROOT, 'server-lib', 'cache', 'sqlite'));
  const db = openDb();
  if (!db) return null;                                 // DB absent → skip
  try {
    for (const t of ['stichera', 'blocks']) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(t);
      if (!exists) return null;
    }

    // Index every movable-keyed hymn in `blocks` by shingle.
    const movable = db.prepare(`
      SELECT DISTINCT liturgical_key AS lk, text
      FROM blocks
      WHERE type = 'hymn' AND text IS NOT NULL
        AND (liturgical_key LIKE 'triodion.%' OR liturgical_key LIKE 'pentecostarion.%')
    `).all();

    const index = new Map();
    for (const m of movable) {
      const n = norm(m.text);
      if (n.length < SHINGLE) continue;
      for (const sh of shingles(n)) if (!index.has(sh)) index.set(sh, m.lk);
    }

    const rows = db.prepare(`
      SELECT s.id, s.section, s."order" AS ord, s.text, s.source_date,
             c.id AS cid, c.title, c.month, c.day
      FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id
    `).all();

    const byComm = new Map();
    for (const r of rows) {
      const n = norm(r.text);
      if (n.length < SHINGLE) continue;
      let lk = null;
      for (const sh of shingles(n)) { lk = index.get(sh); if (lk) break; }
      if (!lk) continue;

      const bucket = MOVABLE_TITLE.test(r.title) ? 'movable-keyed' : 'projection';
      const key    = `${r.cid}:${bucket}`;
      if (!byComm.has(key)) {
        byComm.set(key, {
          key, bucket, cid: r.cid, title: r.title,
          where: `${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
          movableKey: lk, sourceDates: new Set(), rows: 0,
        });
      }
      const hit = byComm.get(key);
      hit.rows += 1;
      if (r.source_date) hit.sourceDates.add(r.source_date);
    }
    return [...byComm.values()];
  } finally {
    db.close();
  }
}

function describe(h) {
  const src = h.sourceDates.size ? ` scraped ${[...h.sourceDates].sort().join(',')}` : '';
  return `${h.where}  #${h.cid}  ${h.rows} row(s)  ${h.title.slice(0, 44)}`
    + `  [${h.movableKey}]${src}`;
}

function main() {
  const argv        = process.argv.slice(2);
  const checkPath   = argv.includes('--check') ? argv[argv.indexOf('--check') + 1] : null;
  const capturePath = argv.includes('--capture-baseline')
    ? argv[argv.indexOf('--capture-baseline') + 1] : null;

  const hits = scan();
  if (hits === null) {
    console.log('[movable-projection] no stichera/blocks table — skipped.');
    return;
  }
  const projections = hits.filter(h => h.bucket === 'projection');
  const keys        = projections.map(h => h.key).sort();

  if (capturePath) {
    fs.writeFileSync(path.join(ROOT, capturePath),
      JSON.stringify({ captured: new Date().toISOString(), keys }, null, 2) + '\n');
    console.log(`[movable-projection] baseline captured — ${keys.length} key(s) -> ${capturePath}`);
    return;
  }

  if (checkPath) {
    const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, checkPath), 'utf8'));
    const known    = new Set(baseline.keys || []);
    const added    = keys.filter(k => !known.has(k));
    const fixed    = [...known].filter(k => !keys.includes(k));

    if (added.length) {
      console.error(`[movable-projection] ${added.length} NEW movable-service projection(s):`);
      for (const k of added) console.error(`  ${describe(projections.find(h => h.key === k))}`);
      console.error('\nA movable day\'s propers are sitting on a fixed saint, who will be');
      console.error('credited with them in the render. Confirm the movable copy in `blocks`');
      console.error('serves the real date, then delete the fixed-date rows.');
      process.exit(2);
    }
    console.log(`[movable-projection] OK — ${keys.length} known, 0 new.`
      + (fixed.length ? ` (${fixed.length} fixed since baseline: ${fixed.join(', ')})` : ''));
    return;
  }

  const movableKeyed = hits.filter(h => h.bucket === 'movable-keyed');
  console.log(`[movable-projection] ${projections.length} fixed saint(s) holding movable propers:\n`);
  for (const h of projections.sort((a, b) => a.where.localeCompare(b.where))) console.log(`  ${describe(h)}`);
  console.log(`\n  — and ${movableKeyed.length} movable commemoration(s) stored under a fixed`);
  console.log('    month-day, which is the "Vespers is not movable" gap, not this bug.');
}

main();
