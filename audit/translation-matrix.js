#!/usr/bin/env node
'use strict';

/**
 * audit/translation-matrix.js
 *
 * Sweeps the full {listed-overlay × canonical-date × core-endpoint} matrix
 * and asserts every cell responds 200. Catches regressions that a single-
 * overlay hit at PR time wouldn't surface:
 *   - overlay manifest typos breaking one endpoint
 *   - missing parent in extends chain breaking one season
 *   - key references that throw on a specific date
 *   - route-level errors visible only with a specific overlay applied
 *
 *   node audit/translation-matrix.js
 *   SNAPSHOT_HTTP_BASE=http://localhost:3001 node audit/translation-matrix.js
 *
 * Requires a server running at SNAPSHOT_HTTP_BASE (default :3000).
 *
 * Exit code:
 *   0 — every (overlay, date, endpoint) returned 200
 *   2 — at least one cell errored
 *   1 — fetch / setup failure
 *
 * Wired into:
 *   - npm run translation-matrix
 *   - .github/workflows/nightly-translation-matrix.yml (cron)
 *
 * Complements Track G (determinism). G proves base-endpoint output is stable
 * across in-process repeats; H proves the overlay cascade machinery works
 * for every listed jurisdiction/parish/tradition variant against the dates
 * most likely to exercise edge cases.
 */

const fs   = require('node:fs');
const path = require('node:path');

const HTTP_BASE = process.env.SNAPSHOT_HTTP_BASE || 'http://localhost:3000';
const OVERLAYS_DIR = path.join(__dirname, '..', 'fixed-texts', 'translations');

// Canonical dates picked to cover the main service shapes overlays touch:
//   - Ordinary Sunday (Octoechos resurrectional)
//   - Pascha Sunday (Bright Week structure)
//   - Pentecost Sunday (Pentecostarion peak)
//   - Theophany (Great Feast with baptismal Trisagion)
const DATES = [
  '2026-06-07',  // Ordinary Sunday
  '2026-04-12',  // Pascha
  '2026-05-31',  // Pentecost
  '2026-01-06',  // Theophany
];

// Translation-aware endpoints. Other endpoints (presanctified, paschal-hours,
// etc.) accept ?translation= but the overlay surface they exercise is a
// subset of these three — keep the matrix focused.
const ENDPOINTS = ['/api/service', '/api/liturgy', '/api/matins'];

function listOverlays() {
  const out = [];
  for (const dirent of fs.readdirSync(OVERLAYS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    if (dirent.name.startsWith('_')) continue;       // skip _test-* fixtures
    const manifestPath = path.join(OVERLAYS_DIR, dirent.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    let m;
    try { m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { continue; }
    if (m.listed === false) continue;                // skip building-block layers
    out.push({ id: dirent.name, name: m.name, kind: m.kind });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchStatus(endpoint, date, translation) {
  const url = `${HTTP_BASE}${endpoint}?date=${date}&translation=${translation}`;
  try {
    const r = await fetch(url);
    return { url, status: r.status, bytes: (await r.text()).length };
  } catch (err) {
    return { url, status: 'ERR', error: err.message };
  }
}

async function run() {
  const overlays = listOverlays();
  console.log(`Translation matrix: ${overlays.length} overlays × ${DATES.length} dates × ${ENDPOINTS.length} endpoints = ${overlays.length * DATES.length * ENDPOINTS.length} cells\n`);
  console.log(`Against ${HTTP_BASE}\n`);

  let total = 0;
  let ok = 0;
  const failures = [];

  for (const overlay of overlays) {
    let overlayOk = 0;
    let overlayFail = 0;
    for (const endpoint of ENDPOINTS) {
      for (const date of DATES) {
        total++;
        const r = await fetchStatus(endpoint, date, overlay.id);
        if (r.status === 200) {
          ok++;
          overlayOk++;
        } else {
          overlayFail++;
          failures.push({ overlay: overlay.id, endpoint, date, ...r });
        }
      }
    }
    const tag = `${overlay.id.padEnd(28)} (${overlay.kind})`;
    if (overlayFail === 0) console.log(`  ✓ ${tag}  ${overlayOk}/${overlayOk}`);
    else                   console.error(`  ✗ ${tag}  ${overlayOk}/${overlayOk + overlayFail}  (${overlayFail} fail)`);
  }

  console.log(`\n${ok}/${total} cells OK`);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const f of failures.slice(0, 20)) {
      console.error(`  [${f.overlay}] ${f.endpoint}?date=${f.date} → ${f.status}${f.error ? ' ' + f.error : ''}`);
    }
    if (failures.length > 20) console.error(`  … and ${failures.length - 20} more.`);

    const outDir = path.join(__dirname, 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const reportPath = path.join(outDir, 'translation-matrix-failures.json');
    fs.writeFileSync(reportPath, JSON.stringify(failures, null, 2));
    console.error(`\nFull list: ${path.relative(process.cwd(), reportPath)}`);
    process.exit(2);
  }
  console.log('All cells OK.');
}

run().catch(e => { console.error(e); process.exit(1); });
