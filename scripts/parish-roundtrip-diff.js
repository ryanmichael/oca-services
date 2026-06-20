#!/usr/bin/env node
'use strict';

// Forward-looking smoke check for the parish self-service architecture.
//
// PHASE 1: this script proved byte-identity between Tyler's legacy file
// overlay and the new DB+in-memory path. It was the load-bearing
// architecture proof that in-memory overlay injection produces the same
// content as direct file overlays.
//
// PHASE 2 (leftover): Tyler's legacy file no longer carries the 5
// hierarch-commemoration keys — derivation fully covers them. The two
// paths intentionally diverge now (legacy falls back to the base
// "Metropolitan N." placeholder; in-memory produces Tyler's specific
// hierarchs).
//
// New role: this is now a "Tyler's in-memory content includes her
// specific hierarchs" smoke check. Any future Phase X migration that
// shrinks the legacy overlay further keeps these assertions valid as
// long as derivation/library coverage tracks the deletions.

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
    // _overlay is a provenance tag. Strip both the key+value and the
    // preceding comma so blocks that have it match blocks that don't.
    .replace(/,"_overlay":"[^"]*"/g, '')
    .replace(/"_overlay":"[^"]*",/g, '');
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

const REQUIRED_PRESENCE = {
  // service → array of substrings that must appear in Tyler's rendered output.
  // Any failure means the DB→in-memory pipeline is dropping a Tyler-specific
  // override that legacy + library + derivation are supposed to provide.
  liturgy: [
    'Metropolitan Tikhon',     // litany short form (derivation)
    'Archbishop Alexander',    // litany short form (derivation)
    'Most Blessed Tikhon, Archbishop of Washington', // anaphora full title (derivation)
    'of whom I am chief',      // pre-Communion HTM (variant pick)
    'mystically, mystically represent the Cherubim', // cherubic tyler-1 (variant pick)
    'Svyatyi Bozhe',           // trilingual Trisagion — Slavonic (variant pick)
    'Ágios o Theós',           // trilingual Trisagion — Greek (variant pick)
  ],
  vespers: [
    'Metropolitan Tikhon',
    'Archbishop Alexander',
    'Blessed is the man who hath not walked in the counsel of the impious', // HTM "Blessed is the Man"
  ],
};

(async () => {
  let failures = 0;
  for (const service of SERVICES) {
    const dateForService = service === 'vespers'
      ? new Date(new Date(DATE).getTime() - 86400000).toISOString().slice(0, 10)
      : DATE;
    const url = service === 'vespers'
      ? `${HOST}/api/service?service=vespers&date=${dateForService}&translation=st-john-damascus-tyler`
      : `${HOST}/api/${service}?date=${dateForService}&translation=st-john-damascus-tyler`;

    let body;
    try { body = await fetchJson(url); }
    catch (err) {
      console.error(`  ERROR fetching ${service}: ${err.message}`);
      failures += 1;
      continue;
    }

    const required = REQUIRED_PRESENCE[service] || [];
    const missing = required.filter(s => body.indexOf(s) === -1);
    if (missing.length === 0) {
      console.log(`  ✓ ${service}: all ${required.length} Tyler-specific overrides present (${body.length} bytes)`);
    } else {
      failures += 1;
      console.log(`  ✗ ${service}: missing ${missing.length} expected substring(s):`);
      for (const m of missing) console.log(`      • ${JSON.stringify(m)}`);
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} service(s) missing Tyler-specific content — architecture regression`);
    process.exit(1);
  }
  console.log(`\nALL GREEN — Tyler's DB+in-memory path renders every required parish override.`);
  process.exit(0);
})();
