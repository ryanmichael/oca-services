#!/usr/bin/env node
'use strict';

// Captures a reference snapshot of buildRubrics() output for every parish,
// applying the pre-refactor (typed-column-only) logic by hand. The new
// registry-driven path must produce deep-equal results — enforced by
// test/contracts/rubric-registry.test.js (INV-D).

const fs   = require('fs');
const path = require('path');
const { openDb } = require('../server-lib/cache/sqlite');
const { resolvePatronByNaturalKey } = require('../server-lib/parishes/patron-resolver');

function legacyBuildRubrics(row) {
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
  return r;
}

function main() {
  const db = openDb();
  if (!db) { console.error('No DB'); process.exit(1); }
  try {
    const rows = db.prepare('SELECT * FROM parish_settings').all();
    const out = {};
    for (const row of rows) out[row.parish_id] = legacyBuildRubrics(row);
    const outPath = path.resolve(__dirname, '..', 'test', 'contracts', '__snapshots__', 'rubrics-pre-refactor.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
    console.log(`wrote ${Object.keys(out).length} parish snapshot(s) → ${outPath}`);
  } finally {
    db.close();
  }
}

if (require.main === module) main();

module.exports = { legacyBuildRubrics };
