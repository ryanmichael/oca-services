'use strict';

// The Cherubic Hymn is sung in two halves around the Great Entrance — first
// half before, second half after. A regression that bundles the full hymn
// before (or after) the Great Entrance breaks the rubric and removes the
// musical cover the Entrance procession depends on. See features/cherubic-split.

module.exports = {
  id:             'L7-cherubic-split-around-great-entrance',
  family:         'structure',
  severity:       'high',
  description:    'Cherubic Hymn blocks appear both before AND after the Great Entrance.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const geIdx = blocks.findIndex(b => b.section === 'Great Entrance');
    if (geIdx === -1) return [];   // L5 will report; nothing to assert here

    const cherubIdxs = blocks
      .map((b, i) => (b.section === 'Cherubic Hymn' ? i : -1))
      .filter(i => i !== -1);
    if (!cherubIdxs.length) return [];

    const before = cherubIdxs.some(i => i < geIdx);
    const after  = cherubIdxs.some(i => i > geIdx);
    const issues = [];
    if (!before) issues.push({ message: `Cherubic Hymn has no block before Great Entrance (at ${geIdx}); split is collapsed.` });
    if (!after)  issues.push({ message: `Cherubic Hymn has no block after Great Entrance (at ${geIdx}); split is collapsed.` });
    return issues;
  },
};
