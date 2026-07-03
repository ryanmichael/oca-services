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

const ROOT       = path.resolve(__dirname, '..');
const CACHE_DIR  = path.join(ROOT, 'reference', 'scrape');
const MANIFEST   = path.join(CACHE_DIR, '_fetch-manifest.json');

const RATE_LIMIT_MS = 500;   // politeness gap between network fetches
const MAX_RETRIES   = 3;
const BACKOFF_MS    = 1000;  // base; doubles each retry

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
function fileDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${y}-${m}${d}`;
}

function ocaUrl(isoDate, register) {
  return `https://files.oca.org/service-texts/${fileDate(isoDate)}-texts-${register}.docx`;
}

function waybackUrl(url) {
  // Latest snapshot; id_ suffix returns the raw original bytes, not the toolbar-wrapped page.
  return `https://web.archive.org/web/2id_/${url}`;
}

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

async function fetchOnce(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'oca-services-rescrape/1.0 (liturgical text QA; contact via repo)' },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // A DOCX is a ZIP; first two bytes are "PK". Guard against HTML error pages
  // served with a 200 (OCA occasionally does this for missing files).
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    const err = new Error('Response is not a DOCX (missing PK zip signature)');
    err.status = 'not-docx';
    throw err;
  }
  return buf;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(isoDate, register) {
  const primary = ocaUrl(isoDate, register);
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return { buf: await fetchOnce(primary), source: 'oca', url: primary };
    } catch (e) {
      lastErr = e;
      // 404 is terminal for the primary URL — go straight to Wayback.
      if (e.status === 404) break;
      if (attempt < MAX_RETRIES) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
    }
  }
  // Wayback fallback (moved/removed source files).
  try {
    const wb = waybackUrl(primary);
    return { buf: await fetchOnce(wb), source: 'wayback', url: wb };
  } catch (e) {
    lastErr.wayback = e.message;
  }
  throw lastErr;
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

main().catch(e => { console.error(e); process.exit(2); });
