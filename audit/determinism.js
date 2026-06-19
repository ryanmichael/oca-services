#!/usr/bin/env node
'use strict';

/**
 * audit/determinism.js
 *
 * Asserts that hitting each canonical (endpoint, date) N times in one process
 * produces byte-identical responses. Catches in-process non-determinism that
 * the byte-stable baseline (`audit/snapshot.js`) cannot — random IDs, Date.now()
 * stamps leaking into output, Map-iteration-order drift, etc.
 *
 *   node audit/determinism.js              # 3 reps (default)
 *   node audit/determinism.js --reps 5
 *   SNAPSHOT_HTTP_BASE=http://localhost:3001 node audit/determinism.js
 *
 * Requires a server running at SNAPSHOT_HTTP_BASE (default http://localhost:3000).
 *
 * Exit code:
 *   0 — every (endpoint, date) had identical hashes across all reps
 *   2 — at least one (endpoint, date) produced different hashes between reps
 *   1 — fetch failure (server down, network error, etc.)
 *
 * Wired into:
 *   - npm run snapshot:determinism
 *   - .github/workflows/nightly-determinism.yml (cron)
 *
 * Uses the same canonical PROFILE as audit/snapshot.js so the two harnesses
 * cover the same surface area for two distinct properties:
 *   audit/snapshot.js     — current output matches the committed baseline
 *   audit/determinism.js  — current output is stable across in-process repeats
 */

const fs     = require('node:fs');
const crypto = require('node:crypto');
const path   = require('node:path');

const HTTP_BASE = process.env.SNAPSHOT_HTTP_BASE || 'http://localhost:3000';

// Reuse the same canonical date × endpoint surface as audit/snapshot.js.
// Inlined rather than imported because audit/snapshot.js doesn't currently
// export the PROFILE constant. Keep these two lists in sync by hand; the
// baseline harness is the source of truth.
const PROFILE = [
  { endpoint: '/api/service', dates: [
    '2026-03-07', '2026-04-11', '2026-04-12', '2026-04-13', '2026-05-31',
    '2026-01-06', '2026-12-25', '2026-06-07', '2026-04-08', '2026-02-02',
  ]},
  { endpoint: '/api/liturgy', dates: [
    '2026-04-12', '2026-05-31', '2026-01-06', '2026-12-25', '2026-06-07',
    '2026-04-05', '2026-02-02', '2026-03-15',
  ]},
  { endpoint: '/api/matins', dates: [
    '2026-04-12', '2026-05-31', '2026-01-06', '2026-12-25', '2026-06-07',
    '2026-02-02', '2026-04-13', '2026-03-09',
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

function parseArgs(argv) {
  const out = { reps: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reps') out.reps = parseInt(argv[++i], 10);
  }
  if (!Number.isInteger(out.reps) || out.reps < 2) {
    console.error(`--reps must be an integer >= 2 (got ${out.reps})`);
    process.exit(1);
  }
  return out;
}

async function fetchHash(endpoint, date) {
  const url = `${HTTP_BASE}${endpoint}?date=${date}`;
  const r = await fetch(url);
  const text = await r.text();
  return {
    status: r.status,
    bytes:  text.length,
    hash:   crypto.createHash('sha256').update(text).digest('hex'),
    text,
  };
}

function shortHash(h) { return h.slice(0, 12); }

async function run() {
  const { reps } = parseArgs(process.argv.slice(2));
  console.log(`Determinism check: ${reps} reps against ${HTTP_BASE}\n`);

  let total = 0;
  let stable = 0;
  let drift  = 0;
  const drifts = [];

  for (const { endpoint, dates } of PROFILE) {
    for (const date of dates) {
      total++;
      const tag = `${endpoint.padEnd(28)} ${date}`;
      const reads = [];
      for (let i = 0; i < reps; i++) {
        try { reads.push(await fetchHash(endpoint, date)); }
        catch (err) {
          console.error(`  FETCH-FAIL  ${tag}  ${err.message}`);
          process.exit(1);
        }
      }
      const hashes = reads.map(r => r.hash);
      const uniq = new Set(hashes);
      if (uniq.size === 1) {
        stable++;
        console.log(`  stable  ${tag}  ${shortHash(hashes[0])}`);
      } else {
        drift++;
        drifts.push({ endpoint, date, hashes, reads });
        console.error(`  DRIFT   ${tag}  ${[...uniq].map(shortHash).join(' / ')}`);
      }
    }
  }

  console.log(`\n${stable}/${total} stable across ${reps} reps  |  ${drift} drift`);
  if (drift) {
    console.error(`\nDrift detected. First drift detail:`);
    const d = drifts[0];
    console.error(`  ${d.endpoint} ${d.date}`);
    console.error(`  hashes: ${d.hashes.map(shortHash).join(', ')}`);
    console.error(`  sizes:  ${d.reads.map(r => r.bytes).join(', ')} bytes`);
    // Write a diff helper file so the engineer can investigate.
    const outDir = path.join(__dirname, 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    for (let i = 0; i < d.reads.length; i++) {
      const f = path.join(outDir, `determinism-drift-${d.date}-${d.endpoint.replace(/\//g, '_')}-rep${i + 1}.txt`);
      fs.writeFileSync(f, d.reads[i].text);
    }
    console.error(`  Wrote ${d.reads.length} rep files to ${path.relative(process.cwd(), outDir)}/ for diff inspection.`);
    process.exit(2);
  }
  console.log('All endpoints stable.');
}

run().catch(e => { console.error(e); process.exit(1); });
