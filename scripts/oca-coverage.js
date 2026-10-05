#!/usr/bin/env node
'use strict';

// CLI: node scripts/oca-coverage.js [--year 2026] [--download] [--limit N]
//
// Chunk 2 of the OCA-standardisation plan: find out how much of the corpus can
// ACTUALLY be sourced from OCA, and cache what can.
//
// The question this answers. 380 commemorations carry stichera in a translation
// that is not OCA (lambertsen 1,052 rows, st-sergius.org 867, raphaela 433), and
// 225 of 365 Vespers mix translations as a result (D23). Converting them is only
// possible where OCA publishes the day at all — and `files.oca.org` serves only
// the roughly one third of dates that are liturgically significant. Replacing a
// row we cannot replace would drop that saint to the generic General Menaion,
// which is a worse outcome than a translation seam.
//
// Why this is not scripts/rescrape-fetch.js. That harness re-fetches dates which
// ALREADY fed an `oca-menaion` row, so it can diff our rows against a fresh
// parse. It never goes looking for dates we do not yet have — which is exactly
// what is needed here. Both now share the fetcher in
// server-lib/sources/oca-service-texts.js.
//
// FETCH-ONLY. Never writes storage/oca.db; it opens it read-only to list
// targets, and writes only to reference/scrape/ and the report.
//
// Request budget is kept deliberately small:
//   * the Wayback CDX index is ONE request for every archived date
//   * the local cache is consulted before any network call
//   * a live probe happens only for targets neither cached nor archived
//
// Saints are fixed-calendar, so a 2024 text serves a 2026 date: availability is
// tracked by MONTH-DAY, not by full date.

const fs   = require('fs');
const path = require('path');
const {
  ROOT, CACHE_DIR, RATE_LIMIT_MS, sleep, ocaUrl, fetchOnce, fetchWithRetry,
  waybackIndex, cachePath,
} = require('../server-lib/sources/oca-service-texts');

const REPORT = path.join(ROOT, 'audit', 'reports', 'oca-coverage.json');

function parseArgs(argv) {
  const a = { year: new Date().getUTCFullYear(), download: false, limit: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--year') a.year = Number(argv[++i]);
    else if (argv[i] === '--download') a.download = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[++i]);
  }
  return a;
}

const md = (m, d) => `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Commemorations whose stichera are not OCA, grouped by month-day. */
function targets() {
  const { openDb } = require('../server-lib/cache/sqlite');
  const db = openDb();
  if (!db) throw new Error('storage/oca.db not found');
  try {
    const rows = db.prepare(`
      SELECT c.id, c.month, c.day, c.title, s.source, COUNT(*) AS n
        FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id
       WHERE s.source IN ('lambertsen','stSergius','raphaela')
         AND c.month IS NOT NULL AND c.day IS NOT NULL
       GROUP BY c.id, s.source
    `).all();
    const byMd = new Map();
    for (const r of rows) {
      const k = md(r.month, r.day);
      if (!byMd.has(k)) byMd.set(k, { md: k, comms: new Map(), rows: 0 });
      const e = byMd.get(k);
      e.rows += r.n;
      if (!e.comms.has(r.id)) e.comms.set(r.id, { id: r.id, title: r.title, sources: [] });
      e.comms.get(r.id).sources.push(`${r.source}×${r.n}`);
    }
    return [...byMd.values()].sort((a, b) => a.md.localeCompare(b.md));
  } finally { db.close(); }
}

/** Month-days we already hold a DOCX for, in any year. */
function cachedMonthDays() {
  const out = new Map();
  for (const f of fs.readdirSync(CACHE_DIR)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})\.docx$/.exec(f);
    if (m) out.set(`${m[2]}-${m[3]}`, `${m[1]}-${m[2]}-${m[3]}`);
  }
  return out;
}

async function main() {
  const args   = parseArgs(process.argv.slice(2));
  const tgts   = targets();
  const cached = cachedMonthDays();

  console.log(`OCA coverage probe — ${tgts.length} month-days carry non-OCA stichera`);
  console.log(`  local cache covers ${cached.size} month-days\n`);

  let wb = new Set();
  try {
    wb = await waybackIndex('tt');
    console.log(`  Wayback CDX knows ${wb.size} archived dates (1 request)\n`);
  } catch (e) {
    console.warn(`  ! Wayback index unavailable (${e.message}) — live probe only\n`);
  }
  const wbByMd = new Map();
  for (const iso of wb) {
    const [, m, d] = iso.split('-');
    if (!wbByMd.has(`${m}-${d}`)) wbByMd.set(`${m}-${d}`, iso);
  }

  const todo = args.limit ? tgts.slice(0, args.limit) : tgts;
  const result = { generatedAt: new Date().toISOString(), probeYear: args.year, monthDays: {} };
  let have = 0, viaWb = 0, viaLive = 0, none = 0, downloaded = 0;

  for (const t of todo) {
    const entry = {
      rows: t.rows,
      commemorations: [...t.comms.values()].map(c => ({ id: c.id, title: c.title, sources: c.sources })),
    };

    if (cached.has(t.md)) {
      entry.status = 'cached'; entry.date = cached.get(t.md); have++;
    } else if (wbByMd.has(t.md)) {
      entry.status = 'wayback'; entry.date = wbByMd.get(t.md); viaWb++;
    } else {
      const iso = `${args.year}-${t.md}`;
      try {
        await fetchOnce(ocaUrl(iso, 'tt'));
        entry.status = 'live'; entry.date = iso; viaLive++;
      } catch (e) {
        entry.status = 'none'; entry.error = e.message; none++;
      }
      await sleep(RATE_LIMIT_MS);
    }

    if (args.download && (entry.status === 'wayback' || entry.status === 'live')) {
      try {
        const { buf, source } = await fetchWithRetry(entry.date, 'tt');
        fs.writeFileSync(cachePath(entry.date), buf);
        entry.downloaded = { bytes: buf.length, source };
        downloaded++;
        await sleep(RATE_LIMIT_MS);
      } catch (e) { entry.downloadError = e.message; }
    }

    result.monthDays[t.md] = entry;
  }

  const obtainable = have + viaWb + viaLive;
  const rowsOf = (st) => Object.values(result.monthDays)
    .filter(e => st.includes(e.status)).reduce((s, e) => s + e.rows, 0);

  result.summary = {
    monthDaysProbed: todo.length,
    cached: have, wayback: viaWb, live: viaLive, unavailable: none,
    obtainable, obtainablePct: Math.round(100 * obtainable / todo.length),
    rowsObtainable: rowsOf(['cached', 'wayback', 'live']),
    rowsUnavailable: rowsOf(['none']),
    downloaded,
  };

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(result, null, 2));

  console.log('── coverage ──');
  console.log(`  already cached : ${have}`);
  console.log(`  on Wayback     : ${viaWb}`);
  console.log(`  live on OCA    : ${viaLive}`);
  console.log(`  UNAVAILABLE    : ${none}`);
  console.log(`\n  obtainable: ${obtainable}/${todo.length} month-days (${result.summary.obtainablePct}%)`);
  console.log(`  rows behind them: ${result.summary.rowsObtainable} obtainable / ${result.summary.rowsUnavailable} not`);
  if (args.download) console.log(`  downloaded: ${downloaded}`);
  console.log(`\nReport: ${path.relative(ROOT, REPORT)}`);
  console.log('NOTE: "obtainable" means OCA publishes that DAY. Whether the file actually');
  console.log('      carries that saint\'s stichera is chunk 3\'s per-commemoration check.');
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(2); });
}

module.exports = { targets, cachedMonthDays };
