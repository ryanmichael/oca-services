'use strict';

// Vesperal Liturgy (Holy Saturday + Christmas/Theophany eves) opens with the
// Vespers opening "Blessed is our God always", not the Liturgy opening
// "Blessed is the Kingdom" — the service starts as Vespers and transitions
// to full Liturgy after the OT readings.

module.exports = {
  id:             'V1-vesperal-liturgy-opening',
  family:         'structure',
  severity:       'high',
  description:    'Vesperal Liturgy Opening contains "Blessed is our God always" (Vespers shape).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vesperal-liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Opening');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/blessed is our god always/.test(joined)) return [];
    return [{
      message: 'Vesperal Liturgy Opening section has no "Blessed is our God always" priestly exclamation.',
      hint:    'Vesperal Liturgy opens with the Vespers form, not the Liturgy form ("Blessed is the Kingdom").',
    }];
  },
};
