'use strict';

// "Now the powers of heaven do serve invisibly with us; for behold, the King
// of Glory enters" — the Cherubic substitution at Presanctified Liturgy.
// Followed by "Behold, the mystical sacrifice, all accomplished, is ushered
// in" during the Great Entrance with the Presanctified Gifts.

module.exports = {
  id:             'P3-presanctified-now-the-powers',
  family:         'structure',
  severity:       'high',
  description:    'Presanctified "Now the Powers of Heaven" section contains "Now the powers of heaven do serve invisibly".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'presanctified',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Now the Powers of Heaven');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/now the powers of heaven do serve invisibly/.test(joined)) return [];
    return [{
      message: 'Presanctified "Now the Powers of Heaven" section has no canonical hymn body.',
      hint:    'Check the Presanctified pre-Communion builder — Cherubic substitution may have collapsed.',
    }];
  },
};
