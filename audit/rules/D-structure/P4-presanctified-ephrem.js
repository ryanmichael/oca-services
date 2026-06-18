'use strict';

// The Prayer of St. Ephrem the Syrian — "O Lord and Master of my life, give
// me not the spirit of sloth, despair, lust of power, and idle talk…" — is
// the universal Lenten penitential prayer, sung at every Presanctified
// (and at Lenten Vespers + Compline). Section self-scopes via presence.

module.exports = {
  id:             'P4-presanctified-ephrem',
  family:         'structure',
  severity:       'high',
  description:    'Presanctified Prayer of St. Ephrem contains "O Lord and Master of my life".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'presanctified',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Prayer of St. Ephrem');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/o lord and master of my life/.test(joined)) return [];
    return [{
      message: 'Presanctified Prayer of St. Ephrem section has no "O Lord and Master of my life" prayer body.',
      hint:    'Check the Ephrem prayer builder — section frame rendered without the canonical prayer text.',
    }];
  },
};
