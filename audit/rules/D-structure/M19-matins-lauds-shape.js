'use strict';

// Lauds (Psalms 148-150) at Sunday and festal Matins blend with stichera —
// the canonical Sunday shape produces 8 stichera (resurrection + saint),
// each preceded by its psalm verse, then a Glory + Theotokion. A regression
// that collapses the Lauds to a single block is invisible without a count
// check.
//
// Scope: sung-Lauds shape only — signalled by interleaved psalm-verse blocks.
// Simple-rank weekday and Saturday Matins use read-Lauds (no stichera blend,
// just a doxastikon at most); firing on those is a false positive (the
// Lauds-blend assumption doesn't apply).

const MIN_LAUDS_HYMNS = 4;

module.exports = {
  id:             'M19-matins-lauds-shape',
  family:         'structure',
  severity:       'high',
  description:    `Matins Lauds section has at least ${MIN_LAUDS_HYMNS} hymn blocks when rendered in sung-Lauds shape (psalm-verse blocks present).`,
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const lauds = (ctx.assembled?.blocks || []).filter(b => b.section === 'Lauds');
    if (!lauds.length) return [];
    // Self-scope to sung-Lauds shape: require an interleaved verse block
    // before asserting hymn count. Read-Lauds (weekday/Saturday simple-rank)
    // has no verse blocks and is intentionally a single doxastikon at most.
    const hasVerses = lauds.some(b => b.type === 'verse');
    if (!hasVerses) return [];
    const hymns = lauds.filter(b => b.type === 'hymn');
    if (hymns.length >= MIN_LAUDS_HYMNS) return [];
    return [{
      message: `Matins Lauds has ${hymns.length} hymn block(s); expected ≥${MIN_LAUDS_HYMNS} (stichera blend).`,
      hint:    'Check the Lauds stichera builder — the blend may have collapsed to a single hymn.',
    }];
  },
};
