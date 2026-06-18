'use strict';

// "Blessed be the name of the Lord, henceforth and forevermore" — Psalm
// 112:2, sung thrice between the Prayer behind the Ambon and Psalm 33. A
// regression that drops the hymn block leaves the section header with only
// the priest's blessing prayer, breaking the response pattern.

module.exports = {
  id:             'L21-blessed-be-the-name',
  family:         'structure',
  severity:       'high',
  description:    'Blessed be the Name section contains "Blessed be the name of the Lord, henceforth and forevermore".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Blessed be the Name');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/blessed be the name of the lord/.test(joined)) return [];
    return [{
      message: 'Blessed be the Name section has no "Blessed be the name of the Lord" hymn.',
      hint:    'Section frame rendered without the canonical Psalm 112:2 hymn — check the post-Communion builder.',
    }];
  },
};
