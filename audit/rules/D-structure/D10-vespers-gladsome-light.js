'use strict';

// "Gladsome Light of the Holy Glory of the Immortal Father, Heavenly, Holy,
// Blessed: O Jesus Christ…" (Phos Hilaron) is the ancient evening hymn,
// sung at every Vespers. A regression dropping the body would leave a
// section header with no content.

module.exports = {
  id:             'D10-vespers-gladsome-light',
  family:         'structure',
  severity:       'high',
  description:    'Vespers Gladsome Light section contains "Gladsome Light of the Holy Glory of the Immortal Father".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Gladsome Light');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/gladsome light of the holy glory/.test(joined)) return [];
    return [{
      message: 'Vespers Gladsome Light section has no "Gladsome Light of the Holy Glory" hymn body.',
      hint:    'Check the Phos Hilaron builder — section frame rendered without the canonical hymn.',
    }];
  },
};
