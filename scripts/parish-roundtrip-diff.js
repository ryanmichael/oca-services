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
const fs   = require('fs');
const path = require('path');
const { openDb } = require('../server-lib/cache/sqlite');

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
  //
  // DERIVATION ONLY. Do not add a variant's wording here — see
  // checkVariantPicks below for why.
  liturgy: [
    'Metropolitan Tikhon',     // litany short form (derivation)
    'Archbishop Alexander',    // litany short form (derivation)
    'Most Blessed Tikhon, Archbishop of Washington', // anaphora full title (derivation)
  ],
  vespers: [
    'Metropolitan Tikhon',
    'Archbishop Alexander',
  ],
};

// ── Variant picks: derive the expectation, never hardcode it ────────────────
//
// This list used to carry the *wording of one chosen variant*:
//
//     'of whom I am chief',                            // pre-Communion HTM
//     'mystically, mystically represent the Cherubim', // cherubic tyler-1
//
// Both went stale the moment Tyler re-picked. By 2026-10-31 her picks were
// `royster` ("of whom I am first") and `royster-bortniansky` ("mystically
// representing, mystically representing"), both rendering perfectly — and this
// script had been reporting "architecture regression" against correct output
// for long enough that the failure read as background noise.
//
// A hardcoded string also asserts the wrong thing. The invariant is not "the
// render contains THIS text", it is "the render contains the variant THIS
// PARISH PICKED, and not one of its siblings" — which is exactly the failure
// mode project_variant_replace_not_select describes, where a pick silently
// stops selecting. So: read the pick from `parish_variant_picks`, pull the
// chosen variant out of the library, and assert on that.
//
// Applicability is inferred rather than declared. Some keys only render on
// certain days (fathers-council-* on the Sunday of the Fathers), so if NO
// variant of a key appears, the key simply was not exercised on this date and
// is reported as skipped. The check only bites when some variant of the key IS
// present: then it must be the picked one.

const DISTINCT_WINDOW = 7; // words

// Keys whose slot is sung at every celebration of that service, so absence is
// a real failure rather than "not appointed today". Keys NOT listed here are
// date-dependent (fathers-council-* only on the Sunday of the Fathers) and are
// reported as skipped when no wording of theirs appears.
const ALWAYS_RENDERED = {
  liturgy: ['trisagion', 'psalm-33'],
  vespers: [],
};

function flatten(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => flatten(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => flatten(v, out));
  return out;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * A word-window present in THIS variant and in none of its siblings — the
 * shortest honest evidence that this particular variant reached the page.
 * Returns null when the variants are not textually distinguishable.
 */
/**
 * Variants that carry identical text are one group: no render can tell them
 * apart, so neither can this check. `blessed-is-the-man` ships `htm-boston`
 * and `jordanville` byte-identical — comparing each against *all* siblings
 * left both with zero distinctive windows, and the key reported "not
 * exercised" while the text was plainly on the page. Group first, then
 * distinguish between groups.
 */
function textGroups(variants) {
  const byText = new Map();
  for (const v of variants) {
    const sig = norm(flatten(v.value).join(' \u0000 '));
    if (!byText.has(sig)) byText.set(sig, { sig, ids: [], sample: v });
    byText.get(sig).ids.push(v.id);
  }
  return [...byText.values()];
}

function distinctiveSnippets(variant, siblings) {
  // Two traps, both of which make a variant look ABSENT and so turn a real
  // check into a cheerful "not exercised":
  //
  //  1. Windows must stay INSIDE one string. A `value` is often a list or an
  //     object (the trilingual Trisagion is a list, "Blessed is the Man" a
  //     dict). Joining the parts first yields windows straddling two unrelated
  //     fields, which exist in no render.
  //  2. Collect a window from EVERY part, not just the first. A render often
  //     includes only some of a variant's parts — Tyler sings a short Kathisma
  //     — so the one window we happened to pick first can sit in a part that
  //     was never emitted.
  //
  // A variant counts as present when ANY of its distinctive windows appears.
  const others = siblings.map(v => norm(flatten(v.value).join(' \u0000 ')));
  const out = [];
  for (const part of flatten(variant.value)) {
    const words = norm(part).split(' ');
    if (words.length < DISTINCT_WINDOW) continue;
    for (let i = 0; i + DISTINCT_WINDOW <= words.length; i += 1) {
      const window = words.slice(i, i + DISTINCT_WINDOW).join(' ');
      if (!others.some(o => o.includes(window))) { out.push(window); break; }
    }
  }
  return out;
}

function loadLibrary() {
  const dir = path.join(__dirname, '..', 'fixed-texts', 'variant-library');
  const out = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (_) { continue; }
    if (doc && doc.key && Array.isArray(doc.variants)) out.set(doc.key, doc);
  }
  return out;
}

function parishPicks(parishId) {
  const db = openDb();
  if (!db) return null;
  return db.prepare(
    'SELECT variant_key, variant_id FROM parish_variant_picks WHERE parish_id = ?'
  ).all(parishId);
}

/** → { failures: [string], passes: [string], skipped: [string] } */
function checkVariantPicks(service, body, picks, library) {
  const res = { failures: [], passes: [], skipped: [] };
  if (!picks) {
    res.skipped.push('no database — variant picks not checked');
    return res;
  }
  // A render is JSON with escaped newlines; compare against normalised text.
  const haystack = norm(body.replace(/\\n/g, ' ').replace(/\\"/g, '"'));

  for (const { variant_key: key, variant_id: pickedId } of picks) {
    const doc = library.get(key);
    if (!doc) { res.failures.push(`${key}: picked but no library file`); continue; }
    if ((doc._target || {}).service !== service) continue;

    const picked = doc.variants.find(v => v.id === pickedId);
    if (!picked) { res.failures.push(`${key}: pick "${pickedId}" is not in the library`); continue; }

    const groups = textGroups(doc.variants);
    if (groups.length === 1) {
      // Nothing to select between — but absence still has to be caught for the
      // keys that render on every date, or dropping the trilingual Trisagion
      // would go unnoticed. Presence is asserted; the WORDING still comes from
      // the pick, never from a literal in this file.
      if ((ALWAYS_RENDERED[service] || []).includes(key)) {
        const snips = flatten(picked.value).map(norm).filter(t => t.split(' ').length >= DISTINCT_WINDOW);
        const seen  = snips.filter(t => haystack.includes(t));
        if (seen.length) res.passes.push(`${key} → ${pickedId} (sole wording, ${seen.length}/${snips.length} parts present)`);
        else res.failures.push(`${key}: picked "${pickedId}" renders none of its ${snips.length} text parts`);
      } else {
        res.skipped.push(`${key} → ${pickedId} (only one distinct wording; nothing to select between)`);
      }
      continue;
    }

    const present = groups.filter((g) => {
      const others = groups.filter(o => o.sig !== g.sig).map(o => o.sample);
      const snips  = distinctiveSnippets(g.sample, others);
      return snips.length > 0 && snips.some(s => haystack.includes(s));
    });

    if (present.length === 0) { res.skipped.push(`${key} (not exercised on this date)`); continue; }

    const pickedGroup = groups.find(g => g.ids.includes(pickedId));
    const label = pickedGroup.ids.length > 1
      ? `${pickedId} (wording shared with ${pickedGroup.ids.filter(i => i !== pickedId).join(', ')})`
      : pickedId;

    if (present.some(g => g.sig === pickedGroup.sig)) {
      const strays = present.filter(g => g.sig !== pickedGroup.sig).flatMap(g => g.ids);
      if (strays.length) res.failures.push(`${key}: picked "${pickedId}" rendered, but so did ${strays.join(', ')}`);
      else res.passes.push(`${key} → ${label}`);
    } else {
      res.failures.push(`${key}: picked "${pickedId}" but the render carries ${present.flatMap(g => g.ids).join(', ')}`);
    }
  }
  return res;
}

const PARISH = 'st-john-damascus-tyler';

(async () => {
  let failures = 0;
  const library = loadLibrary();
  const picks   = parishPicks(PARISH);
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
      console.log(`  ✓ ${service}: all ${required.length} derived override(s) present (${body.length} bytes)`);
    } else {
      failures += 1;
      console.log(`  ✗ ${service}: missing ${missing.length} expected substring(s):`);
      for (const m of missing) console.log(`      • ${JSON.stringify(m)}`);
    }

    const picksResult = checkVariantPicks(service, body, picks, library);
    for (const p of picksResult.passes)  console.log(`  ✓ ${service}: ${p}`);
    for (const s of picksResult.skipped) console.log(`  · ${service}: ${s}`);
    for (const f of picksResult.failures) {
      failures += 1;
      console.log(`  ✗ ${service}: ${f}`);
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} service(s) missing Tyler-specific content — architecture regression`);
    process.exit(1);
  }
  console.log(`\nALL GREEN — Tyler's DB+in-memory path renders every required parish override.`);
  process.exit(0);
})();
