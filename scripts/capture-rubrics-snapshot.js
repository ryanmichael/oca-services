#!/usr/bin/env node
'use strict';

// Captures a reference snapshot of buildRubrics() output for every parish,
// applying the pre-refactor (typed-column-only) logic by hand. The new
// registry-driven path must produce deep-equal results — enforced by
// test/contracts/rubric-registry.test.js (INV-D).
//
// This script WAS stale: it reproduced typed-column logic only, so the
// REGISTRY-ONLY rubrics (no dbColumn — hoursPrecedeService, licNoLeadingRepeat,
// gloryAfterLittleLitany, servesLitya) vanished on a plain re-run, silently
// weakening INV-D so it then passed against its own weakened expectation.
// Found 2026-08-29 while fixing N5; fixed the same day (backlog N9).
//
// legacyBuildRubrics now covers every rubric the production path emits. The
// --force guard below stays as a backstop: it refuses to write when any parish
// would lose a key the committed snapshot asserts, which is what a future
// registry addition would look like.
//
// ⚠ Keep the clauses below HAND-WRITTEN, one per rubric. Looping over the
// registry would turn this file into a second copy of production
// buildRubrics(), and INV-D would then compare the registry path against
// itself — a tautology that asserts nothing. The independence IS the point.

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
  // Registry-only rubrics. No typed column exists for these, so `parish_rubrics`
  // is the only source. Each mirrors production's rule — emit only when the
  // value differs from the registry default — but is written out by hand; see
  // the header on why this must not become a registry loop.
  const picked = (id) => Object.prototype.hasOwnProperty.call(picks, id);
  if (picked('hoursPrecedeService') && coerce(picks.hoursPrecedeService, 'boolean') === true)
    r.opening = { ...(r.opening || {}), hoursPrecede: true };
  if (picked('licNoLeadingRepeat') && coerce(picks.licNoLeadingRepeat, 'boolean') === true)
    r.lordICall = { ...(r.lordICall || {}), noLeadingRepeat: true };
  if (picked('gloryAfterLittleLitany') && coerce(picks.gloryAfterLittleLitany, 'boolean') === true)
    r.antiphons = { ...(r.antiphons || {}), gloryAfterLittleLitany: true };
  // enum, default 'always' — a parish that never serves a Litya, or serves one
  // only on the Great Feasts, is the non-default case worth recording.
  if (picked('servesLitya') && picks.servesLitya && picks.servesLitya !== 'always')
    r.vespers = { ...(r.vespers || {}), servesLitya: picks.servesLitya };

  // Typed column, enum, default 'tt'. Emitted only when the parish differs.
  // (paschalCommunionYearRound is deliberately NOT here: production skips every
  // rubric marked `consumer: 'orphan-unused'`, and that is the only one.)
  {
    const pronoun = picked('defaultPronoun') ? picks.defaultPronoun : row.rubric_default_pronoun;
    if (pronoun && pronoun !== 'tt') r.defaultPronoun = pronoun;
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
