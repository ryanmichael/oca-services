#!/usr/bin/env node
'use strict';

// Byte-identity round-trip test for the parish self-service architecture.
//
// Compares two rendered services side-by-side:
//   (a) /api/<service>?translation=st-john-damascus-tyler-legacy
//       — Tyler's content sourced ONLY from the file-based overlay (the
//         architecture's "before" state, preserved as the -legacy cascade
//         layer by scripts/migrate-tyler.js).
//   (b) /api/<service>?translation=st-john-damascus-tyler
//       — Tyler's content sourced from the new in-memory overlay (Anaphora
//         keys derived from parish_settings) cascaded ON TOP OF the same
//         legacy layer.
//
// For Phase 1 these MUST be byte-identical, because the in-memory overlay's
// derived Anaphora keys produce byte-identical text to what the legacy file
// already had (verified inline at template authoring; see
// fixed-texts/derivation-templates/hierarch-commemoration-oca.json).
//
// If this script ever reports a diff, either the derivation template drifted
// or the cascade injection broke. Both are architectural regressions.

const http = require('http');

const HOST   = process.env.OCA_HOST || 'http://localhost:3000';
const DATE   = process.argv[2] || '2026-06-21';
const SERVICES = ['liturgy', 'vespers'];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        resolve(body);
      });
    }).on('error', reject);
  });
}

// Normalize the response payload: the `translation` field echoes the URL
// parameter and is not content — strip it before comparing.
function normalize(jsonText) {
  return jsonText
    .replace(/"translation":"[^"]*"/g, '"translation":"<normalized>"')
    .replace(/"_overlay":"[^"]*"/g, '"_overlay":"<normalized>"');
}

function diffStrings(rawA, rawB) {
  const a = normalize(rawA);
  const b = normalize(rawB);
  if (a === b) return null;
  // Find first divergence to report
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const context = 80;
  const start = Math.max(0, i - context);
  return {
    firstDiverge: i,
    aSnippet: a.substring(start, i + context),
    bSnippet: b.substring(start, i + context),
  };
}

(async () => {
  let failures = 0;
  for (const service of SERVICES) {
    // Vespers is served via /api/service?service=vespers (not /api/vespers).
    // The date shift is handled server-side.
    const dateForService = service === 'vespers'
      ? new Date(new Date(DATE).getTime() - 86400000).toISOString().slice(0, 10)
      : DATE;
    const pathBase = service === 'vespers'
      ? `${HOST}/api/service?service=vespers&date=${dateForService}`
      : `${HOST}/api/${service}?date=${dateForService}`;
    const urlA = `${pathBase}&translation=st-john-damascus-tyler-legacy`;
    const urlB = `${pathBase}&translation=st-john-damascus-tyler`;

    let a, b;
    try {
      [a, b] = await Promise.all([fetchJson(urlA), fetchJson(urlB)]);
    } catch (err) {
      console.error(`  ERROR fetching ${service}: ${err.message}`);
      failures += 1;
      continue;
    }

    const d = diffStrings(a, b);
    if (d === null) {
      console.log(`  ✓ ${service}: byte-identical (${a.length} bytes)`);
    } else {
      failures += 1;
      console.log(`  ✗ ${service}: diverges at byte ${d.firstDiverge}`);
      console.log(`    legacy:    ...${JSON.stringify(d.aSnippet)}...`);
      console.log(`    in-memory: ...${JSON.stringify(d.bSnippet)}...`);
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} divergence(s) — architecture regression`);
    process.exit(1);
  }
  console.log(`\nALL GREEN — Tyler round-trip is byte-identical between file-only and DB+in-memory paths.`);
  process.exit(0);
})();
