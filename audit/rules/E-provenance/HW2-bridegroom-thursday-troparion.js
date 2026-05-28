'use strict';

// Bridegroom Matins for Holy Mon/Tue/Wed nights use the "Behold, the Bridegroom
// comes at midnight" troparion. The Great-and-Holy-Thursday service uses a
// distinct troparion ("When the glorious Disciples were enlightened…"). If
// Thursday's troparion still matches the Bridegroom one, the night-override
// has regressed.
module.exports = {
  id:             'HW2-bridegroom-thursday-troparion-unique',
  family:         'provenance',
  severity:       'high',
  description:    'Great-and-Holy-Thursday Bridegroom Matins uses a unique troparion, not "Behold, the Bridegroom comes at midnight".',
  needsAssembled: true,
  appliesTo: (ctx) =>
    ctx.service === 'bridegroom-matins' &&
    // Civil Wednesday evening = Holy Thursday liturgically (date-shifted).
    ctx.dow === 'thursday',
  check: (ctx) => {
    const trop = (ctx.assembled?.blocks || []).find(b => b.section === 'Troparion' && b.type !== 'rubric');
    if (!trop) return [];
    if (/Behold,? the Bridegroom/i.test(trop.text || '')) {
      return [{
        message: 'Holy Thursday Bridegroom Matins is rendering the Mon/Tue/Wed "Behold the Bridegroom" troparion — expected "When the glorious Disciples were enlightened…"',
        hint:    'Check the night-specific troparion override in assembleBridegroomMatins.',
      }];
    }
    return [];
  },
};
