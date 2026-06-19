'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// Vendored orthocal responses live in data/orthocal/YYYY-MM-DD.json.
// Track B (2026-06-19) vendored 2025–2029, so every in-window date hits a
// committed file — no external dependency at runtime for the canonical
// window. For dates outside the window, fall through to the live API; cache
// the response in-process only (no DB write) so the canonical DB stays
// byte-stable across boots and requests.
const VENDOR_DIR = path.resolve(__dirname, '..', '..', 'data', 'orthocal');

// In-process cache — survives within a single Node process, discarded on
// restart. Out-of-window orthocal hits are rare in normal operation; this
// covers audit sweeps and prevents repeat fetches of the same date.
const inProcessCache = new Map();

function getVendored(dateStr) {
  try {
    const p = path.join(VENDOR_DIR, `${dateStr}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}

// Kept as a no-op for backwards compatibility with the boot-time call site
// (server-lib/boot/load-fixed.js) and the routes that destructure it from
// the context bag. Track E (2026-06-19) retired the orthocal_cache DB
// table; this stub stays so the call sites don't have to change in lockstep.
function ensureOrthocalCacheTable() { /* no-op */ }

async function fetchOrthocalDay(dateStr) {
  const vendored = getVendored(dateStr);
  if (vendored) return vendored;

  const cached = inProcessCache.get(dateStr);
  if (cached) return cached;

  const [year, month, day] = dateStr.split('-').map(Number);
  const url = `https://orthocal.info/api/gregorian/${year}/${month}/${day}/`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Orthocal API ${res.status} for ${dateStr}`);
  const data = await res.json();

  inProcessCache.set(dateStr, data);
  return data;
}

module.exports = { ensureOrthocalCacheTable, fetchOrthocalDay };
