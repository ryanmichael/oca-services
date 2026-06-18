'use strict';

// The Liturgy begins with the priest's exclamation "Blessed is the Kingdom
// of the Father, and of the Son, and of the Holy Spirit, now and ever, and
// unto ages of ages." This is the universal opening across Chrysostom,
// Basil, and Vesperal Liturgies. A regression that drops the opening leaves
// the Opening Doxology section header followed by only the "Amen" response.

module.exports = {
  id:             'L31-opening-doxology',
  family:         'structure',
  severity:       'high',
  description:    'Opening Doxology contains "Blessed is the Kingdom of the Father, and of the Son, and of the Holy Spirit".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Opening Doxology');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/blessed is the kingdom of the father[, ]+and of the son[, ]+and of the holy spirit/.test(joined)) return [];
    return [{
      message: 'Opening Doxology has no "Blessed is the Kingdom of the Father, and of the Son, and of the Holy Spirit" priestly exclamation.',
      hint:    'Section frame rendered without the priestly opening — check the doxology builder.',
    }];
  },
};
