'use strict';

// "God is the Lord and has revealed Himself to us. Blessed is He that comes
// in the Name of the Lord." — sung four times after the Six Psalms with
// interleaved psalm verses, at every Matins (Sunday, festal, weekday). On
// Lenten weekdays this is replaced by "Alleluia" but the section header
// differs ("Alleluia of Matins") so the rule self-scopes via section name.

module.exports = {
  id:             'M5-matins-god-is-the-lord',
  family:         'structure',
  severity:       'high',
  description:    'Matins "God is the Lord" section contains "God is the Lord and has revealed Himself".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'God is the Lord');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/god is the lord and has revealed himself/.test(joined)) return [];
    return [{
      message: 'Matins "God is the Lord" section has no "God is the Lord and has revealed Himself" hymn.',
      hint:    'Check the builder — section frame rendered without the canonical hymn.',
    }];
  },
};
