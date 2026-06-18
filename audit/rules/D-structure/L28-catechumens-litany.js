'use strict';

// Litany for the Catechumens is always rendered in the default (no-parish-
// overlay) view of the Liturgy. Some parishes omit it during the paschal
// period via the `omitCatechumensSeasons` rubric flag — that suppression
// only fires when a parish overlay is active. The audit runs without a
// parish overlay, so the litany should be present every day.
//
// A regression that drops the litany unconditionally — or moves it to a
// season-specific path that fails to fire outside ordinary time — is
// invisible without an annual sweep.

module.exports = {
  id:             'L28-catechumens-litany',
  family:         'structure',
  severity:       'high',
  description:    'Litany for the Catechumens renders in the default Liturgy view.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Litany for the Catechumens');
    if (blocks.length) return [];
    return [{
      message: 'Litany for the Catechumens section is missing from the default Liturgy view.',
      hint:    'Section is omitted only via parish overlay rubric (omitCatechumensSeasons); base view should always include it.',
    }];
  },
};
