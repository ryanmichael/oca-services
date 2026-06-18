'use strict';

// Presanctified Dismissal contains the priest's "Christ our true God"
// dismissal formula — same closing pattern as the Divine Liturgy. A
// regression dropping this leaves the section with only the Glory + Lord
// have mercy + Father bless preamble.

module.exports = {
  id:             'P5-presanctified-dismissal',
  family:         'structure',
  severity:       'high',
  description:    'Presanctified Dismissal contains "Christ, our true God" closing formula.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'presanctified',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Dismissal');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/christ[, ]+our true god/.test(joined)) return [];
    return [{
      message: 'Presanctified Dismissal has no "Christ, our true God" closing formula.',
      hint:    'Check the Presanctified dismissal builder — section frame rendered without the canonical close.',
    }];
  },
};
