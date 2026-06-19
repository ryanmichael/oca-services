'use strict';

// Lauds (Psalms 148-150) at Sunday and festal Matins blend with stichera —
// the canonical Sunday shape produces 8 stichera (resurrection + saint),
// each preceded by its psalm verse, then a Glory + Theotokion. A regression
// that collapses the Lauds to a single block is invisible without a count
// check.
//
// Self-scopes via section presence: simple-rank weekday/Saturday Matins use
// read-Lauds (rendered as an empty section, since today's commit 4c36ee3
// re-routed the menaion doxastikon to Aposticha where it actually belongs).
// The empty-Lauds short-circuit below covers that case.

const MIN_LAUDS_HYMNS = 4;

module.exports = {
  id:             'M19-matins-lauds-shape',
  family:         'structure',
  severity:       'high',
  description:    `Matins Lauds section has at least ${MIN_LAUDS_HYMNS} hymn blocks (sung stichera blend).`,
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const lauds = (ctx.assembled?.blocks || []).filter(b => b.section === 'Lauds');
    if (!lauds.length) return [];
    const hymns = lauds.filter(b => b.type === 'hymn');
    if (hymns.length >= MIN_LAUDS_HYMNS) return [];
    return [{
      message: `Matins Lauds has ${hymns.length} hymn block(s); expected ≥${MIN_LAUDS_HYMNS} (stichera blend).`,
      hint:    'Check the Lauds stichera builder — the blend may have collapsed to a single hymn.',
    }];
  },
};
