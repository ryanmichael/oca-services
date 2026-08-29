#!/usr/bin/env node
'use strict';

// Captures a reference snapshot of buildRubrics() output for every parish,
// applying the pre-refactor (typed-column-only) logic by hand. The new
// registry-driven path must produce deep-equal results — enforced by
// test/contracts/rubric-registry.test.js (INV-D).
//
// ⚠ THIS SCRIPT IS STALE — DO NOT RUN IT BLIND. It reproduces typed-column
// logic only, but several rubrics are now REGISTRY-ONLY with no dbColumn
// (gloryAfterLittleLitany, hoursPrecedeService, licNoLeadingRepeat as of
// 2026-08-29). Those can only come from `parish_rubrics`, so a plain re-run
// DROPS them from the snapshot — silently weakening INV-D, which then passes
// against the weakened expectation. The committed snapshot is hand-maintained
// for those keys.
//
// The --force guard below refuses to write when any parish would lose keys.
// If you need to regenerate, teach legacyBuildRubrics the registry-only
// rubrics first. Found 2026-08-29 while fixing N5.

const fs   = require('fs');
const path = require('path');
const { openDb } = require('../server-lib/cache/sqlite');
const { resolvePatronByNaturalKey } = require('../server-lib/parishes/patron-resolver');
const { loadRegistry, coerce, getRubricPicks } = require('../server-lib/parishes/rubric-registry');

// `picks` is the parish's parish_rubrics map. Pre-refactor logic did not read it
// — it is threaded in solely for tristate rubrics, see the clause at the end.
function legacyBuildRubrics(row, picks = {}) {
  const r = {};
  if (row.rubric_confess_first) r.preCommunion = { confessFirst: true };
  if (row.rubric_omit_pre_trisagion_litany) r.omitPreTrisagionLitany = true;
  if (row.rubric_include_lesser_saints) r.troparia = { ...(r.troparia || {}), includeLesserSaints: true };
  if (row.rubric_include_second_gospel)
    r.readings = { ...(r.readings || {}), includeSecondGospel: true };
  if (row.rubric_include_second_koinonikon)
    r.readings = { ...(r.readings || {}), includeSecondKoinonikon: true };
  if (row.rubric_beatitudes_reader_led)
    r.antiphons = { ...(r.antiphons || {}), beatitudesTropariaReaderLed: true };
  if (row.rubric_faithful_litany_2_long)
    r.litanies = { ...(r.litanies || {}), faithful2Long: true };
  if (row.rubric_omit_catechumens_seasons) {
    const list = row.rubric_omit_catechumens_seasons.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length) r.omitCatechumensSeasons = list;
  }
  if (row.patron_natural_key && row.patron_title) {
    const resolved = resolvePatronByNaturalKey(row.patron_natural_key);
    r.temple = {
      naturalKey: row.patron_natural_key,
      title:      row.patron_title,
      commemorationId: resolved ? resolved.id : null,
    };
  }
  if (row.rubrics_extra_json) {
    try {
      const extra = JSON.parse(row.rubrics_extra_json);
      Object.assign(r, extra);
    } catch (_) {}
  }

  // DELIBERATE DEPARTURE from pre-refactor behavior, 2026-08-29.
  //
  // Every clause above omits a rubric whose value is falsy. For a boolean read
  // with `!!` that is harmless. For a TRISTATE rubric — one whose consumer reads
  // `undefined` differently from `false` — it inverts the parish's setting.
  // `includeSecondKoinonikon` is the live case: liturgy-from-orthocal.js treats
  // absent as ALLOWED, so dropping Tyler's explicit 0 printed a second
  // koinonikon they had turned off.
  //
  // The old behavior was a bug, so this snapshot deliberately encodes the FIXED
  // expectation for tristate rubrics rather than reproducing the old output.
  // INV-D stays a strict deep-equal for everything else.
  // See docs/backlog-2026-08-29-vespers-liturgy-review.md N5.
  const registry = loadRegistry();
  for (const [id, def] of Object.entries(registry.rubrics)) {
    if (def.tristate !== true) continue;
    if (!Object.prototype.hasOwnProperty.call(picks, id)) continue;
    setDottedKey(r, def.namespace, coerce(picks[id], def.type));
  }
  return r;
}

// Minimal local copy — the production helper lives in server-lib/parishes/index.js
// and is not exported.
function setDottedKey(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/** All leaf paths in an object, as dotted strings. */
function flatKeys(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatKeys(v, p));
    else out.push(p);
  }
  return out;
}

function main() {
  const db = openDb();
  if (!db) { console.error('No DB'); process.exit(1); }
  try {
    const rows = db.prepare('SELECT * FROM parish_settings').all();
    const out = {};
    for (const row of rows) out[row.parish_id] = legacyBuildRubrics(row, getRubricPicks(db, row.parish_id));
    const outPath = path.resolve(__dirname, '..', 'test', 'contracts', '__snapshots__', 'rubrics-pre-refactor.json');

    // Refuse to silently drop keys the current snapshot asserts. See header.
    if (!process.argv.includes('--force') && fs.existsSync(outPath)) {
      const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      const lost = [];
      for (const [pid, before] of Object.entries(prev)) {
        for (const k of flatKeys(before)) {
          if (!flatKeys(out[pid] || {}).includes(k)) lost.push(`${pid}: ${k}`);
        }
      }
      if (lost.length) {
        console.error('REFUSING TO WRITE — regenerating would drop keys the snapshot asserts:');
        for (const l of lost) console.error(`  - ${l}`);
        console.error('\nThese are almost certainly registry-only rubrics this script cannot\nreproduce (see header). Teach legacyBuildRubrics about them, or pass\n--force if you genuinely mean to drop them.');
        process.exit(1);
      }
    }

    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
    console.log(`wrote ${Object.keys(out).length} parish snapshot(s) → ${outPath}`);
  } finally {
    db.close();
  }
}

if (require.main === module) main();

module.exports = { legacyBuildRubrics };
