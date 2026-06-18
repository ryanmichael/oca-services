'use strict';

// The Great Litany (litany of peace) opens with the deacon's "In peace, let
// us pray to the Lord." Anchors the start of the entire ektenia sequence.

module.exports = {
  id:             'L32-great-litany-opening',
  family:         'structure',
  severity:       'high',
  description:    'Great Litany opens with "In peace, let us pray to the Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Great Litany');
    if (!blocks.length) return [];
    const first = blocks.find(b => b.type === 'prayer');
    if (!first) return [];
    if (/in peace[, ]+let us pray to the lord/i.test(first.text || '')) return [];
    return [{
      message: `Great Litany opens with "${(first.text || '').slice(0, 80)}" — expected "In peace, let us pray to the Lord".`,
      hint:    'First petition is wrong — check the Great Litany builder.',
    }];
  },
};
