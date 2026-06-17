'use strict';

const fs   = require('fs');
const path = require('path');

// Inlined intentionally — the rule references the *canonical* mapping so it
// keeps catching regressions even if VESPERS_SUNG_EVE is removed or mutated
// in calendar-rules.js. Source: project_pent_weekday_fixes.md + the project's
// sung-evening convention documented in octoechos.json._meta.
const VESPERS_SUNG_EVE = {
  monday:    'sunday',
  tuesday:   'monday',
  wednesday: 'tuesday',
  thursday:  'wednesday',
  friday:    'thursday',
  saturday:  'friday',
  sunday:    'saturday',
};

// Strengthens the prior keyword-heuristic version. Catches the off-by-one bug
// directly: for each (tone, liturgical-day) the assembled "octoechos"-tagged
// LIC hymns must come from the source data at
// `octoechos.json` → tone{N}.{VESPERS_SUNG_EVE[dow]}.vespers.lordICall.hymns.
// Menaion injection can displace some hymns, but every Octoechos block that
// IS rendered must be findable in the expected source set. A consumer reading
// the wrong day's data flags here, regardless of how much Menaion took.

const octoechos = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'variable-sources', 'octoechos.json'),
  'utf8'
));

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

module.exports = {
  id:             'F-weekday-vespers-octoechos-source',
  family:         'theme',
  severity:       'high',
  description:    'Assembled "octoechos"-source Lord I Call hymns must come from the source data at the (tone, sung-evening-day) key — catches weekday lookup-axis regressions.',
  needsAssembled: true,
  appliesTo: (ctx) =>
    ctx.service === 'vespers' &&
    ctx.season === 'ordinaryTime' &&
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(ctx.dow),
  check: (ctx) => {
    const sungEve = VESPERS_SUNG_EVE[ctx.dow];
    if (!sungEve) return [];
    const tk = `tone${ctx.tone}`;
    const licNode = octoechos?.[tk]?.[sungEve]?.vespers?.lordICall;
    const sourceHymns = licNode?.hymns || [];
    if (!sourceHymns.length) return [];

    // Include `.glory` and `.theotokion` siblings as valid source text — the
    // a3b0e8c LIC Theotokion injection (and the Sat-eve Sunday Great Vespers
    // dogmatikon path) emit blocks tagged `source: 'octoechos'` whose text
    // comes from those keys, not from `.hymns`.
    const expected = new Set([
      ...sourceHymns.map(h => norm(h.text)),
      licNode.glory?.text      && norm(licNode.glory.text),
      licNode.theotokion?.text && norm(licNode.theotokion.text),
    ].filter(Boolean));
    const assembledOcto = (ctx.assembled?.blocks || []).filter(b =>
      /^Lord, I/.test(b.section || '') && b.type === 'hymn' && b.source === 'octoechos'
    );
    if (!assembledOcto.length) return [];

    const stray = assembledOcto.filter(b => !expected.has(norm(b.text)));
    if (!stray.length) return [];
    return [{
      message: `${stray.length}/${assembledOcto.length} Octoechos LIC hymn(s) not found in source ${tk}.${sungEve}.vespers.lordICall — lookup axis may be wrong`,
      hint:    'Check VESPERS_SUNG_EVE mapping in calendar-rules.js and the consumer that reads octoechos.json weekday keys.',
    }];
  },
};
