'use strict';

// Communion section flow guard. Rubrically-correct order (per 2026-06-14
// restructure, commit 3ff91cc): Communion Hymn (koinonikon + cycling labels,
// sung while clergy commune) precedes Communion Prayer ("In the fear of God"
// + "Blessed is He" + "I believe and confess"), which precedes Post-Communion.
// Variant paths (Great Feasts, Basil, paschal) occasionally leave the last-mile
// sections on generic defaults and break this order — cheap invariant.
module.exports = {
  id:             'L1-communion-ordering',
  family:         'provenance',
  severity:       'high',
  description:    'Liturgy: Communion Hymn precedes Communion Prayer, which precedes Post-Communion.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const idxOf = (re) => blocks.findIndex(b => re.test(b.section || ''));
    const hymn   = idxOf(/^Communion Hymn/i);
    const prayer = idxOf(/^Communion Prayer/i);
    const post   = idxOf(/Post[- ]?Communion/i);
    const issues = [];
    if (hymn >= 0 && prayer >= 0 && hymn > prayer) {
      issues.push({ message: `Communion Hymn at block ${hymn} renders after Communion Prayer at block ${prayer}` });
    }
    if (prayer >= 0 && post >= 0 && prayer > post) {
      issues.push({ message: `Communion Prayer at block ${prayer} renders after Post-Communion at block ${post}` });
    }
    return issues;
  },
};
