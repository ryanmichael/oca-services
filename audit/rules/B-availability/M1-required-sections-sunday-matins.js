'use strict';

// Sunday Matins skeleton. If any of these sections is missing from the
// assembled output, the assembler has dropped a load-bearing piece (catches
// generator regressions and missing-builder cases).
const REQUIRED = [
  'Six Psalms',
  'Matins Gospel',
  'Psalm 50',
  'Canon',
  'Lauds',
  'Great Doxology',
  'Dismissal',
];

module.exports = {
  id:             'M1-sunday-matins-sections',
  family:         'availability',
  severity:       'high',
  description:    'Sunday Matins must include the standard skeleton sections.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins' && ctx.dow === 'sunday',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const present = new Set(blocks.map(b => b.section).filter(Boolean));
    const missing = REQUIRED.filter(s => !present.has(s));
    if (!missing.length) return [];
    return [{
      message: `Sunday Matins missing section(s): ${missing.join(', ')}`,
      hint:    'Check buildMatinsSpec / _buildSundayMatinsFromOctoechos for the relevant tone.',
    }];
  },
};
