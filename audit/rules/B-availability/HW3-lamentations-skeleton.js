'use strict';

const REQUIRED = [
  'Stasis 1',
  'Stasis 2',
  'Stasis 3',
  'Evlogetaria',
  'Canon — Ode I',
  'Canon — Ode IX',
  'Lauds',
  'Great Doxology',
  'Dismissal',
];

module.exports = {
  id:             'HW3-lamentations-skeleton',
  family:         'availability',
  severity:       'high',
  description:    'Lamentations must include all three stases, Evlogetaria, full canon (Ode I and Ode IX present), Lauds, Great Doxology, and Dismissal.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'lamentations',
  check: (ctx) => {
    const blocks  = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const present = new Set(blocks.map(b => b.section).filter(Boolean));
    const missing = REQUIRED.filter(s => !present.has(s));
    if (!missing.length) return [];
    return [{
      message: `Lamentations missing section(s): ${missing.join(', ')}`,
      hint:    'Check assembleLamentations in assembler.js and SVS Holy Week Vol. 3 source data.',
    }];
  },
};
