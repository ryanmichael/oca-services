'use strict';

// The Nunc Dimittis ("Lord, now lettest Thou Thy servant depart in peace,
// according to Thy word…") is sung at every Vespers between the Aposticha
// and the Troparia. A regression that drops the canticle body leaves the
// section header followed by only the trailing Trisagion + Lord's Prayer.

module.exports = {
  id:             'D11-vespers-nunc-dimittis',
  family:         'structure',
  severity:       'high',
  description:    'Vespers Nunc Dimittis section contains "Lord, now lettest Thou Thy servant depart in peace".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Nunc Dimittis');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/lord[, ]+now lettest thou thy servant depart in peace/.test(joined)) return [];
    return [{
      message: 'Vespers Nunc Dimittis section has no "Lord, now lettest Thou Thy servant depart in peace" canticle body.',
      hint:    'Check the Nunc Dimittis builder — section frame rendered without the canonical canticle.',
    }];
  },
};
