'use strict';

// The Communion Hymn (koinonikon) is the section sung while clergy commune.
// L5 ensures the *section header* renders; this rule ensures the section has
// at least one hymn-type block with non-trivial text, catching the case where
// the section frame renders but the koinonikon body is empty (e.g., a
// feast-day variant path returned undefined and the framework rendered just
// the rubric + cycling labels). Cycling Troparia + Kontakia labels in this
// section are reference-only and not hymns.

module.exports = {
  id:             'L14-communion-hymn-has-content',
  family:         'structure',
  severity:       'high',
  description:    'Communion Hymn section contains at least one hymn block with substantive text.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Communion Hymn');
    if (!blocks.length) return [];   // L5 reports missing-section
    const hymns = blocks.filter(b => b.type === 'hymn' && (b.text || '').trim().length >= 20);
    if (hymns.length) return [];
    return [{
      message: 'Communion Hymn section has no hymn-type block with substantive text — koinonikon body is empty.',
      hint:    'Variant path (great-feast / paschal) likely returned an empty hymn list; check the koinonikon selector for this date.',
    }];
  },
};
