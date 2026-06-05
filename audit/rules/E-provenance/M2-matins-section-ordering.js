'use strict';

// Matins section-order invariants. Each pair = [earlier, later]; if both are
// present, earlier must precede later. Pattern catches the "variant path not
// plumbed through to the end" class of bug for matins.
const ORDER_PAIRS = [
  ['Six Psalms',     'God is the Lord'],
  ['Six Psalms',     'Matins Gospel'],
  ['Matins Gospel',  'Psalm 50'],
  ['Matins Gospel',  'Canon'],
  ['Canon',          'Lauds'],
  ['Lauds',          'Great Doxology'],
  ['Great Doxology', 'Dismissal'],
];

module.exports = {
  id:             'M2-matins-section-ordering',
  family:         'provenance',
  severity:       'high',
  description:    'Matins skeleton sections appear in the documented order.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const firstIdx = {};
    blocks.forEach((b, i) => {
      // The Penitential Psalm 50 anchor must be the dedicated ps50 block,
      // not a verse of Psalm 50 emitted inside a Kathisma reading (which
      // also uses section "Psalm 50" for the underlying psalter verse).
      if (b.id === 'ps50') {
        if (firstIdx['Psalm 50'] === undefined) firstIdx['Psalm 50'] = i;
        return;
      }
      if (b.section === 'Psalm 50') return;
      const s = b.section;
      if (s && firstIdx[s] === undefined) firstIdx[s] = i;
    });
    const issues = [];
    for (const [earlier, later] of ORDER_PAIRS) {
      const a = firstIdx[earlier], b = firstIdx[later];
      if (a === undefined || b === undefined) continue;
      if (a >= b) {
        issues.push({ message: `${earlier} (block ${a}) renders at or after ${later} (block ${b})` });
      }
    }
    return issues;
  },
};
