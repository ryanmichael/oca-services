'use strict';

// Every Vespers (Daily, Great, all-night-vigil) opens with "Blessed is our
// God always, now and ever and unto ages of ages." This is the priest's
// universal opening across all Vespers variants. A regression dropping the
// exclamation leaves the Opening section header followed by only the
// Heavenly King / Trisagion preliminary prayers.

module.exports = {
  id:             'D8-vespers-opening',
  family:         'structure',
  severity:       'high',
  description:    'Vespers Opening section contains "Blessed is our God always".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Opening');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/blessed is our god always/.test(joined)) return [];
    return [{
      message: 'Vespers Opening section has no "Blessed is our God always" priestly exclamation.',
      hint:    'Check the Vespers opening builder — section frame rendered without the canonical opening.',
    }];
  },
};
