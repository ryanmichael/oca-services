'use strict';

// The Litany of Supplication (the litany after the Anaphora, before the
// Lord's Prayer) opens with "Let us complete our prayer unto the Lord."
// L5 enforces section presence; this rule anchors its first petition.

module.exports = {
  id:             'L33-supplication-litany-opening',
  family:         'structure',
  severity:       'high',
  description:    'Litany of Supplication opens with "Let us complete our prayer unto the Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Litany of Supplication');
    if (!blocks.length) return [];
    const first = blocks.find(b => b.type === 'prayer');
    if (!first) return [];
    if (/let us complete our prayer unto the lord/i.test(first.text || '')) return [];
    return [{
      message: `Litany of Supplication opens with "${(first.text || '').slice(0, 80)}" — expected "Let us complete our prayer unto the Lord".`,
      hint:    'First petition is wrong — check the supplication litany builder.',
    }];
  },
};
