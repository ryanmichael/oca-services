'use strict';

// When Presanctified is served, the assembled output must contain the
// signature sections that distinguish it from regular Vespers. Catches the
// case where /api/presanctified routes but the assembler returns a
// non-presanctified structure.
module.exports = {
  id:             'B1-presanctified-shape',
  family:         'availability',
  severity:       'high',
  description:    'Presanctified assembly must include "Let My Prayer Arise" and the Prayer of St. Ephrem.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'presanctified',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const hasLetMyPrayer = blocks.some(b => /Let My Prayer/i.test(b.section || ''));
    const hasEphrem      = blocks.some(b =>
      /Ephrem/i.test(b.section || '') ||
      /Lord and Master of my life/i.test(b.text || '')
    );
    const issues = [];
    if (!hasLetMyPrayer) issues.push({ message: 'Missing "Let My Prayer Arise" section' });
    if (!hasEphrem)      issues.push({ message: 'Missing Prayer of St. Ephrem' });
    return issues;
  },
};
