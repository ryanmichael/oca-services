'use strict';

// Royal Hours of Holy Friday use fixed psalm assignments per hour (LXX
// numbering, matching OCA Holy Week and the Greek typikon):
//   First  — Ps 5, 2, 21
//   Third  — Ps 34, 108, 50
//   Sixth  — Ps 53, 139, 90
//   Ninth  — Ps 68, 69, 85
// Each per-hour Psalms section is asserted to contain a "Psalm <N>" heading
// for each of its three psalms; a missing or wrong number flags a swap.
const CANONICAL = {
  'First Hour':  [5,  2,   21],
  'Third Hour':  [34, 108, 50],
  'Sixth Hour':  [53, 139, 90],
  'Ninth Hour':  [68, 69,  85],
};

module.exports = {
  id:             'HW10-royal-hours-canonical-psalms',
  family:         'provenance',
  severity:       'high',
  description:    'Royal Hours each contain their canonical 3 LXX psalms (1st: 5/2/21, 3rd: 34/108/50, 6th: 53/139/90, 9th: 68/69/85).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'royal-hours',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const issues = [];
    for (const [hour, psalms] of Object.entries(CANONICAL)) {
      const inHour = blocks.filter(b => (b.section || '') === `${hour} — Psalms`);
      const headings = inHour
        .map(b => (b.text || '').trim())
        .map(t => {
          const m = t.match(/^Psalm\s+(\d+)\b/);
          return m ? Number(m[1]) : null;
        })
        .filter(n => n !== null);
      const missing = psalms.filter(n => !headings.includes(n));
      if (missing.length) {
        issues.push({
          message: `Royal Hours ${hour}: missing Psalm(s) ${missing.join(', ')} (expected ${psalms.join('/')}, found ${headings.join('/') || 'none'}).`,
          hint:    'Check assembleRoyalHours psalm assignments — these are fixed per hour, not date-dependent.',
        });
      }
    }
    return issues;
  },
};
