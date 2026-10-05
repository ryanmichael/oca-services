#!/usr/bin/env node
'use strict';

// Rescrape harness — Phase 2 fetcher.
//
// Downloads the OCA service-text DOCX for every `source_date` that fed an
// `oca-menaion` / `oca-feast` stichera row, so a later deterministic diff can
// cross-check our DB against a fresh re-parse of the same source.
//
// Pure fetch stage: writes only to reference/scrape/ and a JSON manifest.
// Never touches storage/oca.db (opened read-only for the inventory).
//
//   node scripts/rescrape-fetch.js               # fetch all missing dates
//   node scripts/rescrape-fetch.js --date 2026-05-24
//   node scripts/rescrape-fetch.js --limit 5     # first N missing (smoke test)
//   node scripts/rescrape-fetch.js --force       # re-fetch even if cached
//   node scripts/rescrape-fetch.js --register tt # 'tt' (default) or 'yy'
//
// Design: docs/rescrape-harness-design.md

const fs   = require('fs');
const path = require('path');

// The fetcher itself lives in server-lib/sources/oca-service-texts.js so this
// harness and scripts/oca-coverage.js share one implementation (extracted
// 2026-10-04; behaviour unchanged).
const {
  ROOT, CACHE_DIR, RATE_LIMIT_MS, sleep, fetchWithRetry,
} = require('../server-lib/sources/oca-service-texts');

const MANIFEST = path.join(CACHE_DIR, '_fetch-manifest.json');

function parseArgs(argv) {
  const args = { register: 'tt', force: false, limit: null, date: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') args.force = true;
    else if (a === '--register') args.register = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--date') args.date = argv[++i];
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

// "2024-07-05" -> "2024-0705" (OCA filename convention).
function inventory() {
  const { openDb } = require('../server-lib/cache/sqlite');
  const db = openDb();
  if (!db) throw new Error('storage/oca.db not found');
  try {
    const rows = db.prepare(
      `SELECT DISTINCT source_date
         FROM stichera
        WHERE source LIKE 'oca%' AND source_date IS NOT NULL
        ORDER BY source_date`
    ).all();
    return rows.map(r => r.source_date);
  } finally {
    db.close();
  }
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST)) return { results: {} };
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
  catch { return { results: {} }; }
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  let dates = args.date ? [args.date] : inventory();
  if (args.limit) dates = dates.slice(0, args.limit);

  const manifest = loadManifest();
  let fetched = 0, cached = 0, failed = 0;

  for (const isoDate of dates) {
    const outPath = path.join(CACHE_DIR, `${isoDate}.docx`);
    if (!args.force && fs.existsSync(outPath)) {
      cached++;
      continue;
    }
    try {
      const { buf, source, url } = await fetchWithRetry(isoDate, args.register);
      fs.writeFileSync(outPath, buf);
      manifest.results[isoDate] = { ok: true, source, url, bytes: buf.length, register: args.register };
      fetched++;
      console.log(`  ✓ ${isoDate}  ${buf.length} bytes  (${source})`);
      await sleep(RATE_LIMIT_MS);
    } catch (e) {
      manifest.results[isoDate] = { ok: false, error: e.message, wayback: e.wayback, register: args.register };
      failed++;
      console.warn(`  ✗ ${isoDate}  ${e.message}${e.wayback ? ` | wayback: ${e.wayback}` : ''}`);
    }
    saveManifest(manifest);  // incremental — kill-safe / resumable
  }

  console.log(`\nDone. fetched=${fetched} cached=${cached} failed=${failed} total=${dates.length}`);
  console.log(`Manifest: ${path.relative(ROOT, MANIFEST)}`);
  if (failed > 0) process.exitCode = 1;
}

// Guarded: requiring this file used to RUN a full fetch pass as a side effect.
if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(2); });
}

module.exports = { inventory };
