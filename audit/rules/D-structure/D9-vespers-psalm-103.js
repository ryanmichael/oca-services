'use strict';

// Psalm 103 ("Bless the Lord, O my soul…") is the proemial psalm of Vespers,
// sung or read after the opening. A regression dropping the psalm body
// leaves the section header followed only by the "Come, let us worship"
// preliminary verses.

module.exports = {
  id:             'D9-vespers-psalm-103',
  family:         'structure',
  severity:       'high',
  description:    'Vespers Psalm 103 section contains "Bless the Lord, O my soul".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Psalm 103');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/bless the lord[, ]+o my soul/.test(joined)) return [];
    return [{
      message: 'Vespers Psalm 103 section has no "Bless the Lord, O my soul" psalm body.',
      hint:    'Check the proemial psalm builder — section frame rendered without the canonical psalm.',
    }];
  },
};
