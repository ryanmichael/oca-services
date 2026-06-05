#!/usr/bin/env node
'use strict';

/**
 * audit/snapshot.js
 *
 * Captures and verifies byte-level snapshots of API responses for canonical
 * dates, used as a safety net during refactors (Phase 2 modularization, etc.).
 *
 *   node audit/snapshot.js --capture    # write baseline.json
 *   node audit/snapshot.js --verify     # compare current to baseline
 *
 * The script hashes the SHA-256 of each response body. Any non-empty diff
 * between baseline and verify run means the underlying behavior changed —
 * investigate before merging the refactor PR.
 *
 * Baseline file (`audit/snapshots/baseline.json`) is committed. When intentional
 * behavior changes ship, refresh the baseline as part of that same commit with a
 * note in the commit message.
 *
 * Requires a server running at HTTP_BASE (default http://localhost:3000).
 */

const fs     = require('node:fs');
const crypto = require('node:crypto');
const path   = require('node:path');

const HTTP_BASE = process.env.SNAPSHOT_HTTP_BASE || 'http://localhost:3000';
const OUT_DIR   = path.join(__dirname, 'snapshots');
const BASELINE  = path.join(OUT_DIR, 'baseline.json');

// Canonical dates picked to exercise diverse code paths across the year:
// Lenten Saturday + Soul Saturday, Pascha + Bright Week, Pentecost, Theophany,
// Nativity, ordinary Sunday, Holy Week services, Forefeast, Afterfeast, etc.
const PROFILE = [
  { endpoint: '/api/service', dates: [
    '2026-03-07',   // Soul Saturday II — Lenten Saturday Great Vespers
    '2026-04-11',   // Holy Saturday eve
    '2026-04-12',   // Pascha
    '2026-04-13',   // Bright Monday Vespers
    '2026-05-31',   // Pentecost
    '2026-01-06',   // Theophany
    '2026-12-25',   // Nativity
    '2026-06-07',   // Ordinary Sunday in June
    '2026-04-08',   // Holy Tuesday eve (Bridegroom + Vespers)
    '2026-02-02',   // Meeting of the Lord
  ]},
  { endpoint: '/api/liturgy', dates: [
    '2026-04-12', '2026-05-31', '2026-01-06', '2026-12-25', '2026-06-07', '2026-04-05', '2026-02-02', '2026-03-15',
  ]},
  { endpoint: '/api/matins', dates: [
    '2026-04-12', '2026-05-31', '2026-01-06', '2026-12-25', '2026-06-07', '2026-02-02', '2026-04-13', '2026-03-09',
  ]},
  { endpoint: '/api/presanctified',     dates: ['2026-02-25', '2026-04-08', '2026-03-11'] },
  { endpoint: '/api/bridegroom-matins', dates: ['2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08'] },
  { endpoint: '/api/passion-gospels',   dates: ['2026-04-09'] },
  { endpoint: '/api/royal-hours',       dates: ['2026-04-10'] },
  { endpoint: '/api/lamentations',      dates: ['2026-04-10'] },
  { endpoint: '/api/vesperal-liturgy',  dates: ['2026-04-11'] },
  { endpoint: '/api/paschal-hours',     dates: ['2026-04-13', '2026-04-15', '2026-04-17'] },
  { endpoint: '/api/pascha-collection', dates: ['2026-04-12'] },
  { endpoint: '/api/kneeling-vespers',  dates: ['2026-05-31'] },
];

async function fetchHash(endpoint, date) {
  const url = `${HTTP_BASE}${endpoint}?date=${date}`;
  let r;
  try { r = await fetch(url); }
  catch (err) { return { status: 'ERR', error: err.message, hash: null, bytes: 0 }; }
  const text = await r.text();
  return {
    status: r.status,
    bytes:  text.length,
    hash:   crypto.createHash('sha256').update(text).digest('hex'),
  };
}

function shortHash(h) { return h ? h.slice(0, 12) : '—'; }

async function capture() {
  console.log(`Capturing snapshot against ${HTTP_BASE} …\n`);
  const out = {};
  let total = 0;
  for (const { endpoint, dates } of PROFILE) {
    out[endpoint] = {};
    for (const d of dates) {
      total++;
      const r = await fetchHash(endpoint, d);
      out[endpoint][d] = r;
      console.log(`  ${endpoint.padEnd(28)} ${d}  ${String(r.status).padStart(3)}  ${shortHash(r.hash)}  ${r.bytes}b`);
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n');
  console.log(`\n${total} entries written to ${path.relative(process.cwd(), BASELINE)}`);
}

async function verify() {
  if (!fs.existsSync(BASELINE)) {
    console.error(`No baseline at ${BASELINE}. Run --capture first.`);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  console.log(`Verifying current behavior against ${path.relative(process.cwd(), BASELINE)} …\n`);

  let diffs = 0;
  let missing = 0;
  let total = 0;

  for (const { endpoint, dates } of PROFILE) {
    for (const d of dates) {
      total++;
      const expected = baseline[endpoint]?.[d];
      const actual   = await fetchHash(endpoint, d);
      const tag = `${endpoint.padEnd(28)} ${d}`;

      if (!expected) {
        missing++;
        console.warn(`  NEW   ${tag}  ${String(actual.status).padStart(3)}  ${shortHash(actual.hash)}  (not in baseline)`);
        continue;
      }
      if (expected.hash !== actual.hash || expected.status !== actual.status) {
        diffs++;
        console.error(
          `  DIFF  ${tag}  ` +
          `baseline ${expected.status} ${shortHash(expected.hash)} ${expected.bytes}b  ` +
          `→ actual ${actual.status} ${shortHash(actual.hash)} ${actual.bytes}b`
        );
      } else {
        console.log(`  OK    ${tag}  ${expected.status}  ${shortHash(expected.hash)}`);
      }
    }
  }

  const ok = total - diffs - missing;
  console.log(`\n${ok}/${total} match  |  ${diffs} diff${diffs === 1 ? '' : 's'}  |  ${missing} new`);
  if (diffs > 0) process.exit(2);
  if (missing > 0) process.exit(3);
}

const mode = process.argv[2];
if (mode === '--capture')      capture().catch(e => { console.error(e); process.exit(1); });
else if (mode === '--verify')  verify().catch(e => { console.error(e); process.exit(1); });
else {
  console.error('usage: node audit/snapshot.js --capture | --verify');
  console.error('  Requires a server running at $SNAPSHOT_HTTP_BASE (default :3000).');
  process.exit(1);
}
