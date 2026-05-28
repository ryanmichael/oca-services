'use strict';

const HOURS = ['First Hour', 'Third Hour', 'Sixth Hour', 'Ninth Hour'];

module.exports = {
  id:             'HW4-royal-hours-four-hours',
  family:         'availability',
  severity:       'high',
  description:    'Royal Hours must include all four hours (First, Third, Sixth, Ninth), each with at least Psalms and Readings.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'royal-hours',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const sections = blocks.map(b => b.section || '');
    const issues = [];
    for (const h of HOURS) {
      const hasPsalms   = sections.some(s => s.startsWith(`${h} — Psalms`));
      const hasReadings = sections.some(s => s.startsWith(`${h} — Readings`));
      if (!hasPsalms || !hasReadings) {
        const missing = [!hasPsalms && 'Psalms', !hasReadings && 'Readings'].filter(Boolean).join(' + ');
        issues.push({ message: `Royal Hours: ${h} missing ${missing}` });
      }
    }
    return issues;
  },
};
