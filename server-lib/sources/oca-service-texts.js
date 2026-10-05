'use strict';

// Fetching the OCA published service-text DOCX for a date.
//
// Extracted from scripts/rescrape-fetch.js on 2026-10-04 so the rescrape harness
// and the coverage probe share one fetcher. Behaviour is unchanged: retries with
// exponential backoff, a Wayback fallback, and a PK-signature guard because OCA
// occasionally serves an HTML error page with a 200.
//
// ⚠️ `files.oca.org/service-texts/` is PARTIAL, not dead. Project memory recorded
// it as dead on 2026-08-09 and that belief cost real work — on 2026-10-04 it led
// to transcribing St Hierotheus from a scan while `2026-1004-texts-tt.docx` was
// fetchable the whole time. Re-probed 2026-10-04: it serves the roughly a third
// of dates that are liturgically significant and 404s ordinary weekdays across
// every filename variant. A 404 on the dates you happen to test is not proof a
// host is gone.
//
// URL shape is `YYYY-MMDD-texts-{tt,yy}.docx` — note the single hyphen after the
// year, not a full ISO date.

const fs   = require('fs');
const path = require('path');

const ROOT          = path.resolve(__dirname, '..', '..');
const CACHE_DIR     = path.join(ROOT, 'reference', 'scrape');
const RATE_LIMIT_MS = 500;    // politeness gap between network fetches
const MAX_RETRIES   = 3;
const BACKOFF_MS    = 1000;   // base; doubles each retry

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** `2026-10-04` → `2026-1004`, the publisher's own filename shape. */
function fileDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${y}-${m}${d}`;
}

function ocaUrl(isoDate, register = 'tt') {
  return `https://files.oca.org/service-texts/${fileDate(isoDate)}-texts-${register}.docx`;
}

/** Latest snapshot; the `id_` suffix returns raw bytes, not the toolbar page. */
function waybackUrl(url) {
  return `https://web.archive.org/web/2id_/${url}`;
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
  // A DOCX is a ZIP; first two bytes are "PK".
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    const err = new Error('Response is not a DOCX (missing PK zip signature)');
    err.status = 'not-docx';
    throw err;
  }
  return buf;
}

async function fetchWithRetry(isoDate, register = 'tt') {
  const primary = ocaUrl(isoDate, register);
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return { buf: await fetchOnce(primary), source: 'oca', url: primary };
    } catch (e) {
      lastErr = e;
      if (e.status === 404) break;   // terminal for the primary — go to Wayback
      if (attempt < MAX_RETRIES) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
    }
  }
  try {
    const wb = waybackUrl(primary);
    return { buf: await fetchOnce(wb), source: 'wayback', url: wb };
  } catch (e) {
    lastErr.wayback = e.message;
  }
  throw lastErr;
}

/**
 * Every `files.oca.org/service-texts/` path the Wayback CDX index knows, as a
 * Set of `YYYY-MM-DD`. ONE request instead of probing date by date.
 *
 * Some archived filenames carry the publisher's own typo — `20025-0724` for
 * 2025 — which is normalised here rather than dropped.
 */
async function waybackIndex(register = 'tt') {
  const url = 'https://web.archive.org/cdx/search/cdx'
            + '?url=files.oca.org/service-texts*&output=text&fl=original'
            + '&limit=5000&collapse=urlkey';
  const res = await fetch(url, { headers: { 'User-Agent': 'oca-services-rescrape/1.0' } });
  if (!res.ok) throw new Error(`CDX HTTP ${res.status}`);
  const out = new Set();
  for (const line of (await res.text()).split('\n')) {
    const m = new RegExp(`/(\\d{4,5})-(\\d{2})(\\d{2})-texts-${register}\\.docx`).exec(line);
    if (!m) continue;
    let y = m[1];
    if (y.length === 5 && y.startsWith('200')) y = '2' + y.slice(2);   // 20025 -> 2025
    if (y.length !== 4) continue;
    out.add(`${y}-${m[2]}-${m[3]}`);
  }
  return out;
}

/** The locally cached DOCX path for a date, whether or not it exists. */
const cachePath = (isoDate) => path.join(CACHE_DIR, `${isoDate}.docx`);
const isCached  = (isoDate) => fs.existsSync(cachePath(isoDate));

module.exports = {
  ROOT, CACHE_DIR, RATE_LIMIT_MS, MAX_RETRIES, BACKOFF_MS,
  sleep, fileDate, ocaUrl, waybackUrl, fetchOnce, fetchWithRetry,
  waybackIndex, cachePath, isCached,
};
