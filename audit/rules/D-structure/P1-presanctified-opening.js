'use strict';

// Presanctified Liturgy opens with "Blessed is our God always" (the Vespers
// opening; Presanctified is a Vespers shape with Communion of pre-sanctified
// Gifts grafted in). Parallels D8 / M9.

module.exports = {
  id:             'P1-presanctified-opening',
  family:         'structure',
  severity:       'high',
  description:    'Presanctified Opening section contains "Blessed is our God always".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'presanctified',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Opening');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/blessed is our god always/.test(joined)) return [];
    return [{
      message: 'Presanctified Opening section has no "Blessed is our God always" priestly exclamation.',
      hint:    'Check the Presanctified opening builder — section frame rendered without the canonical opening.',
    }];
  },
};
