'use strict';

// Palm Sunday audit pattern: variant paths (great feasts, Basil, etc.) sometimes
// leave the last-mile sections on generic defaults, breaking the documented
// order Communion Prayer → Communion Hymn → Post-Communion. Cheap invariant.
module.exports = {
  id:             'L1-communion-ordering',
  family:         'provenance',
  severity:       'high',
  description:    'Liturgy: Communion Prayer precedes Communion Hymn, which precedes Post-Communion.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const idxOf = (re) => blocks.findIndex(b => re.test(b.section || ''));
    const prayer = idxOf(/^Communion Prayer/i);
    const hymn   = idxOf(/^Communion Hymn/i);
    const post   = idxOf(/Post[- ]?Communion/i);
    const issues = [];
    if (prayer >= 0 && hymn >= 0 && prayer > hymn) {
      issues.push({ message: `Communion Prayer at block ${prayer} renders after Communion Hymn at block ${hymn}` });
    }
    if (hymn >= 0 && post >= 0 && hymn > post) {
      issues.push({ message: `Communion Hymn at block ${hymn} renders after Post-Communion at block ${post}` });
    }
    return issues;
  },
};
