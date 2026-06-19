#!/usr/bin/env node
'use strict';

// Pre-warm vendored orthocal responses into data/orthocal/YYYY-MM-DD.json.
// Idempotent: skips files that already exist (use --force to refetch).
//
// Usage:
//   node scripts/vendor-orthocal.js --from 2025-01-01 --to 2029-12-31
//   node scripts/vendor-orthocal.js --year 2026
//   node scripts/vendor-orthocal.js --year 2026 --force
//   node scripts/vendor-orthocal.js --from 2026-06-01 --to 2026-06-30 --delay 100
//
// Polite by default (200ms between requests). Tune with --delay <ms>.

const fs   = require('fs');
const path = require('path');

const REPO_ROOT  = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(REPO_ROOT, 'data', 'orthocal');
const API_BASE  = 'https://orthocal.info/api/gregorian';

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = (k, def) => {
    const i = args.indexOf(k);
    return i !== -1 ? args[i + 1] : def;
  };
  const has = (k) => args.includes(k);

  const year = opt('--year');
  let from, to;
  if (year) {
    from = `${year}-01-01`;
    to   = `${year}-12-31`;
  } else {
    from = opt('--from');
    to   = opt('--to');
  }
  if (!from || !to) {
    console.error('Usage: vendor-orthocal.js --from YYYY-MM-DD --to YYYY-MM-DD  (or --year YYYY)');
    process.exit(2);
  }
  return {
    from,
    to,
    delayMs: Number(opt('--delay', '200')),
    force:   has('--force'),
    quiet:   has('--quiet')
  };
}

function* dateRange(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  let d = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (d <= end) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    yield { iso: `${y}-${m}-${day}`, y, m: d.getUTCMonth() + 1, d: d.getUTCDate() };
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function vendoredPathFor(iso) {
  return path.join(VENDOR_DIR, `${iso}.json`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchOne({ y, m, d }) {
  const url = `${API_BASE}/${y}/${m}/${d}/`;
  const res = await fetch(url, {
    headers: {
      'Accept':     'application/json',
      'User-Agent': 'oca-services-vendor/1.0 (+https://oca-services-production.up.railway.app)'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const opts = parseArgs();
  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  let total = 0, skipped = 0, fetched = 0, failed = 0;
  for (const dt of dateRange(opts.from, opts.to)) {
    total++;
    const out = vendoredPathFor(dt.iso);
    if (!opts.force && fs.existsSync(out)) { skipped++; continue; }

    try {
      const data = await fetchOne(dt);
      fs.writeFileSync(out, JSON.stringify(data));
      fetched++;
      if (!opts.quiet && fetched % 50 === 0) {
        console.log(`  ${dt.iso}  fetched=${fetched}  skipped=${skipped}  failed=${failed}`);
      }
    } catch (err) {
      failed++;
      console.error(`  ${dt.iso}  FAIL: ${err.message}`);
    }
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  console.log(`\nDone. total=${total} fetched=${fetched} skipped=${skipped} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
