'use strict';

// The Magnificat ("My soul magnifies the Lord, and my spirit rejoices in
// God my Savior…") is sung at Matins between the 8th and 9th odes of the
// canon on Sundays and most festal days, interleaved with the refrain
// "More honorable than the Cherubim". Section is only present on days
// where it's sung — the rule self-scopes via section presence.

module.exports = {
  id:             'M6-matins-magnificat',
  family:         'structure',
  severity:       'high',
  description:    'Matins Magnificat section contains "My soul magnifies the Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Magnificat');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/my soul magnifies the lord/.test(joined)) return [];
    return [{
      message: 'Matins Magnificat section has no "My soul magnifies the Lord" canticle verse.',
      hint:    'Check the Magnificat builder — section frame rendered without the Luke 1:46 verses.',
    }];
  },
};
