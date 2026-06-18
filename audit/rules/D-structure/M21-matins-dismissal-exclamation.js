'use strict';

// The Matins Dismissal contains the priest's exclamation "Blessed be He Who
// Is, Christ our God, always, now and ever and unto ages of ages." This is
// the canonical closing formula unique to Matins (Vespers and Liturgy use
// different forms). A regression that drops the exclamation leaves the
// Dismissal section with only the "Wisdom" / "Father, bless" frame.

module.exports = {
  id:             'M21-matins-dismissal-exclamation',
  family:         'structure',
  severity:       'high',
  description:    'Matins Dismissal contains "Blessed be He Who Is, Christ our God".',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'matins') return false;
    if (ctx.isBrightWeek) return false;     // paschal dismissal uses a different form
    if (ctx.daysSincePascha === 0) return false;
    return true;
  },
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Dismissal');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/blessed be he who is[, ]+christ our god/.test(joined)) return [];
    return [{
      message: 'Matins Dismissal has no "Blessed be He Who Is, Christ our God" priestly exclamation.',
      hint:    'Check the Matins dismissal builder — section frame rendered without the canonical closing.',
    }];
  },
};
