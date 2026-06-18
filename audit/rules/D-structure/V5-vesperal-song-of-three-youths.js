'use strict';

// The Song of the Three Holy Youths (Daniel 3:57-88, sometimes called the
// Benedicite) is sung during the seventh OT reading of Holy Saturday's
// Vesperal Liturgy — "O all ye works of the Lord, bless ye the Lord:
// praise and exalt Him above all forever!" The youths' deliverance from
// the fiery furnace is the great paschal type. Section self-scopes via
// presence.

module.exports = {
  id:             'V5-vesperal-song-of-three-youths',
  family:         'structure',
  severity:       'high',
  description:    'Vesperal Liturgy "Song of the Three Youths" contains "O all ye works of the Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vesperal-liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Song of the Three Youths');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/o all ye works of the lord[, ]+bless ye the lord/.test(joined)) return [];
    return [{
      message: 'Vesperal Liturgy "Song of the Three Youths" has no canonical hymn body.',
      hint:    'Check the Holy Saturday OT reading 7 / Benedicite builder.',
    }];
  },
};
