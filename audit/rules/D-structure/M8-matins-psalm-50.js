'use strict';

// Psalm 50 ("Have mercy upon me, O God, according to thy great mercy…") is
// read after the Matins Gospel on Sundays and festal days, and forms the
// hinge between the Gospel reading + post-Gospel stichera and the Canon.
// On weekday Matins it's read after the Kathismata. Either placement is
// captured by section-name match.

module.exports = {
  id:             'M8-matins-psalm-50',
  family:         'structure',
  severity:       'high',
  description:    'Matins Psalm 50 section contains "Have mercy upon me, O God, according to thy great mercy".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Psalm 50');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/have mercy upon me[, ]+o god[, ]+according to thy great mercy/.test(joined)) return [];
    return [{
      message: 'Matins Psalm 50 section has no "Have mercy upon me, O God, according to thy great mercy" psalm body.',
      hint:    'Check the Psalm 50 builder — section frame rendered without the canonical psalm.',
    }];
  },
};
