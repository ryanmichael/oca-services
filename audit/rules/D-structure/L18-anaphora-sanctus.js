'use strict';

// The Sanctus — "Holy, holy, holy, Lord of Sabaoth! Heaven and earth are full
// of Thy glory!" — is the only universally invariant text inside the
// Anaphora across both John Chrysostom and Basil rites. A regression that
// drops the Sanctus block (variant path returning the priest's prayers only)
// would still render an Anaphora section but lose the choir's response,
// breaking the eucharistic prayer structure.

module.exports = {
  id:             'L18-anaphora-sanctus',
  family:         'structure',
  severity:       'high',
  description:    'Anaphora section contains the Sanctus ("Holy, holy, holy, Lord of Sabaoth").',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Anaphora');
    if (!blocks.length) return [];   // L5 reports missing section
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/holy, holy, holy[, ]+lord of sabaoth/.test(joined)) return [];
    return [{
      message: 'Anaphora section has no Sanctus ("Holy, holy, holy, Lord of Sabaoth!").',
      hint:    'Check Anaphora builder for this date — a variant path (Basil / paschal) may have dropped the Sanctus block.',
    }];
  },
};
