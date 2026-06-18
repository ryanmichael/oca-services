'use strict';

// On Sundays the Post-Gospel Stichera section follows the Matins Gospel
// and "Having Beheld the Resurrection" (M13). Contains the Sunday penitential
// hymn "Through the prayers of the Apostles…" + the Sunday Resurrection
// sticheron after Psalm 50. Stub guard: at least one substantive hymn.

module.exports = {
  id:             'M27-matins-post-gospel-stichera',
  family:         'structure',
  severity:       'high',
  description:    'Matins Post-Gospel Stichera section contains at least one substantive hymn block.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Post-Gospel Stichera');
    if (!blocks.length) return [];
    const hymns = blocks.filter(b => b.type === 'hymn' && (b.text || '').trim().length >= 30);
    if (hymns.length) return [];
    return [{
      message: 'Matins Post-Gospel Stichera section has no substantive hymn block (≥30 chars).',
      hint:    'Section frame rendered without the post-Gospel sticheron — check the Sunday Matins builder.',
    }];
  },
};
