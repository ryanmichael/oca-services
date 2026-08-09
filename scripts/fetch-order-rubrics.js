#!/usr/bin/env node
'use strict';

// OCA "Order of Services" rubric fetcher.
//
// WHY. There are two OCA publications and they answer different questions. The
// service texts give the WORDS; the order of services gives the SHAPE — how many
// stichera and in what split, whether a Litya is served, which prokeimenon.
// Nearly every structural defect this project has fixed came from the order, and
// until now all 22 of them were downloaded by hand.
//
// WHAT'S AVAILABLE (measured 2026-08-09, not assumed):
//   URL      https://www.oca.org/PDF/Music/Rubrics/YYYY-MMDD-order-services.docx
//   scope    SUNDAYS ONLY — Transfiguration, Nativity, Dormition, Peter and
//            Paul and the Elevation all 404. No weekday feast has one.
//   history  back to roughly 2022; 2022-01-09 resolves, 2020-01-05 does not.
//   index    the rubrics page lists six weeks ahead.
//   404s     honest: text/html ~11KB, versus ~28KB of real DOCX.
//
// TWO SOURCES OF URLS, deliberately. For the six weeks the index page lists we
// SCRAPE it, because filenames are not perfectly regular — 2026-08-23 exists as
// both `-order-services.docx` and `-order-services-.docx`, twenty bytes apart,
// and the page links the latter. For history we CONSTRUCT, since there is no
// index to scrape; construction is validated per-response rather than trusted.
//
//   node scripts/fetch-order-rubrics.js              # index page + backfill
//   node scripts/fetch-order-rubrics.js --page-only  # just the listed weeks (cron)
//   node scripts/fetch-order-rubrics.js --since 2024-01-01
//   node scripts/fetch-order-rubrics.js --limit 5    # smoke test
//   node scripts/fetch-order-rubrics.js --check      # report gaps, fetch nothing
//
// Writes .docx plus a paragraph-extracted .txt into reference/orders/, using the
// judge's own extractText so a fetched week is byte-for-byte as good a reference
// as the hand-prepared ones (verified: 179 lines either way for 2026-08-09).

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const ORDERS_DIR = path.join(ROOT, 'reference', 'orders');
const MANIFEST   = path.join(ORDERS_DIR, '_manifest.json');
const INDEX_URL  = 'https://www.oca.org/liturgics/rubrics/order-of-upcoming-services';
const BASE       = 'https://www.oca.org/PDF/Music/Rubrics/';

const RATE_LIMIT_MS = 500;   // politeness gap, same as rescrape-fetch
const MAX_RETRIES   = 3;
const BACKOFF_MS    = 1000;

// The archive does not reach further back than this; probing earlier just
// generates 404 traffic. Re-measure before lowering it.
const EARLIEST = '2022-01-01';

const { extractText } = require(path.join(ROOT, 'audit', 'llm-judge.js'));

function parseArgs(argv) {
  const a = { pageOnly: false, since: EARLIEST, limit: null, check: false, force: false };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--page-only') a.pageOnly = true;
    else if (t === '--check') a.check = true;
    else if (t === '--force') a.force = true;
    else if (t === '--since') a.since = argv[++i];
    else if (t === '--limit') a.limit = parseInt(argv[++i], 10);
    else throw new Error(`Unknown arg: ${t}`);
  }
  return a;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** '2026-08-09' → '2026-0809', the OCA filename convention. */
function fileDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${y}-${m}${d}`;
}

function sha256(buf) {
  return require('crypto').createHash('sha256').update(buf).digest('hex');
}

/** A DOCX is a zip, so it starts with the 'PK' local-file-header magic. oca.org
 *  answers a missing rubric with HTML; checking the body as well as the content
 *  type means an error page can never land on disk named .docx. */
function looksLikeDocx(buf, contentType) {
  if (!buf || buf.length < 4) return false;
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return false;
  if (contentType && /html/i.test(contentType)) return false;
  return true;
}

async function getBuffer(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return { status: 404 };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      return { status: 200, buf, contentType: r.headers.get('content-type') };
    } catch (err) {
      if (attempt === MAX_RETRIES) return { status: 0, error: err.message };
      await sleep(BACKOFF_MS * Math.pow(2, attempt));
    }
  }
  return { status: 0 };
}

/** Scrape the index page for the weeks OCA is currently publishing. Returns
 *  absolute URLs. Throws when it finds none — a silent zero here would look
 *  exactly like "nothing new this week", which is the failure mode most likely
 *  to go unnoticed if the page is ever restructured. */
async function scrapeIndex() {
  const r = await fetch(INDEX_URL);
  if (!r.ok) throw new Error(`index page returned HTTP ${r.status}`);
  const html = await r.text();
  const hrefs = [...html.matchAll(/href="([^"]*Rubrics\/[^"]*order-services[^"]*\.docx)"/gi)]
    .map(m => m[1]);
  const urls = [...new Set(hrefs)].map(h =>
    h.startsWith('http') ? h : `https://www.oca.org${h.startsWith('/') ? '' : '/'}${h}`);
  if (!urls.length) {
    throw new Error(
      'index page listed no order-services links — the page structure has probably ' +
      'changed. Refusing to report success, because "no links" and "no new weeks" ' +
      'look identical downstream.');
  }
  return urls;
}

/** Every Sunday from `since` through today + 8 weeks. */
function sundaysThrough(sinceIso) {
  const out = [];
  const d = new Date(sinceIso + 'T00:00:00Z');
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  const end = new Date(Date.now() + 56 * 86400000);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
  catch (_) { return { _note: 'Provenance for reference/orders/. Regenerate with scripts/fetch-order-rubrics.js', files: {} }; }
}

function docxPathFor(iso) { return path.join(ORDERS_DIR, `${fileDate(iso)}-order-services.docx`); }
function txtPathFor(iso)  { return path.join(ORDERS_DIR, `${fileDate(iso)}-order-services.txt`); }

/** Write the .txt companion using the judge's extractor, so a fetched week and a
 *  hand-prepared one are equivalent references. */
function writeText(iso, docxPath) {
  const text = extractText(docxPath).replace(/^\n+/, '');
  fs.writeFileSync(txtPathFor(iso), text.endsWith('\n') ? text : text + '\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(ORDERS_DIR)) fs.mkdirSync(ORDERS_DIR, { recursive: true });

  const manifest = loadManifest();

  // Candidate URLs, indexed by ISO date. Page-scraped entries win, because they
  // carry OCA's own filename including any irregularity.
  const candidates = new Map();

  let indexUrls = [];
  try {
    indexUrls = await scrapeIndex();
    for (const u of indexUrls) {
      const m = /(\d{4})-(\d{2})(\d{2})-order-services/.exec(u);
      if (!m) continue;
      candidates.set(`${m[1]}-${m[2]}-${m[3]}`, { url: u, via: 'index' });
    }
    console.log(`Index page: ${indexUrls.length} link(s), ${candidates.size} dated.`);
  } catch (err) {
    console.error(`Index scrape failed: ${err.message}`);
    if (args.pageOnly) process.exit(1);
    console.error('Continuing with constructed URLs only.');
  }

  if (!args.pageOnly) {
    for (const iso of sundaysThrough(args.since)) {
      if (!candidates.has(iso)) {
        candidates.set(iso, { url: `${BASE}${fileDate(iso)}-order-services.docx`, via: 'constructed' });
      }
    }
  }

  const missing = [...candidates.entries()]
    .filter(([iso]) => args.force || !fs.existsSync(docxPathFor(iso)))
    .sort((a, b) => a[0].localeCompare(b[0]));

  console.log(`On disk: ${fs.readdirSync(ORDERS_DIR).filter(f => f.endsWith('.docx')).length} · candidates: ${candidates.size} · to fetch: ${missing.length}`);

  if (args.check) {
    missing.slice(0, 40).forEach(([iso, c]) => console.log(`  missing ${iso}  (${c.via})`));
    if (missing.length > 40) console.log(`  … and ${missing.length - 40} more`);
    return;
  }

  const todo = args.limit ? missing.slice(0, args.limit) : missing;
  let added = 0, absent = 0, failed = 0, revised = 0;

  for (const [iso, cand] of todo) {
    await sleep(RATE_LIMIT_MS);
    const res = await getBuffer(cand.url);

    if (res.status === 404) {
      absent++;
      continue;  // expected: not every Sunday in range was published
    }
    if (res.status !== 200 || !looksLikeDocx(res.buf, res.contentType)) {
      console.warn(`  ! ${iso} ${res.error || 'non-DOCX response'} (${cand.url})`);
      failed++;
      continue;
    }

    const hash = sha256(res.buf);
    const prior = manifest.files[`${fileDate(iso)}-order-services.docx`];
    if (prior && prior.sha256 && prior.sha256 !== hash) {
      // OCA revised a document we already hold. Surface it — silently
      // overwriting would erase the evidence a past decision was based on.
      console.warn(`  ~ ${iso} UPSTREAM REVISED (was ${prior.sha256.slice(0, 12)}, now ${hash.slice(0, 12)})`);
      revised++;
    }

    fs.writeFileSync(docxPathFor(iso), res.buf);
    writeText(iso, docxPathFor(iso));
    manifest.files[`${fileDate(iso)}-order-services.docx`] = {
      url: cand.url, via: cand.via, sha256: hash, bytes: res.buf.length,
    };
    added++;
    if (added % 25 === 0) console.log(`  … ${added} fetched`);
  }

  manifest.files = Object.fromEntries(Object.entries(manifest.files).sort());
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\nfetched ${added} · not published ${absent} · failed ${failed} · upstream-revised ${revised}`);
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
