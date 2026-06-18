'use strict';

// Matins Peace Litany opens with the deacon's "In peace, let us pray to the
// Lord." Anchors the start of the ektenia after Psalm 50 (on Sunday/festal
// Matins) or after the Kathismata (on weekday Matins). Section self-scopes
// via presence — some shortened-Matins variants may omit the Peace Litany.

module.exports = {
  id:             'M12-matins-peace-litany',
  family:         'structure',
  severity:       'high',
  description:    'Matins Peace Litany opens with "In peace, let us pray to the Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'The Peace Litany');
    if (!blocks.length) return [];
    const first = blocks.find(b => b.type === 'prayer');
    if (!first) return [];
    if (/in peace[, ]+let us pray to the lord/i.test(first.text || '')) return [];
    return [{
      message: `Matins Peace Litany opens with "${(first.text || '').slice(0, 80)}" — expected "In peace, let us pray to the Lord".`,
      hint:    'First petition is wrong — check the Matins Peace Litany builder.',
    }];
  },
};
