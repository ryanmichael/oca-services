'use strict';

// The three antiphons must render in the canonical sequence 1st → 2nd → 3rd.
// Variant paths (paschal antiphons in Bright Week, feast antiphons on Great
// Feasts) substitute the *content* but preserve the section labels — so an
// out-of-order or interleaved antiphon block indicates a real bug, not a
// substitution.

module.exports = {
  id:             'L6-three-antiphons-in-order',
  family:         'structure',
  severity:       'high',
  description:    'Liturgy antiphons render in order: First → Second → Third, with no overlap.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const lastIdx = (section) => {
      let i = -1;
      blocks.forEach((b, k) => { if (b.section === section) i = k; });
      return i;
    };
    const firstIdx = (section) => blocks.findIndex(b => b.section === section);

    const f1 = firstIdx('First Antiphon');
    const f2 = firstIdx('Second Antiphon');
    const f3 = firstIdx('Third Antiphon');
    const l1 = lastIdx('First Antiphon');
    const l2 = lastIdx('Second Antiphon');

    const issues = [];
    if (f1 === -1 || f2 === -1 || f3 === -1) {
      // Missing-section reporting belongs to L5; nothing more to say here.
      return [];
    }
    if (l1 > f2) issues.push({ message: `First Antiphon block at ${l1} renders after Second Antiphon begins at ${f2}.` });
    if (l2 > f3) issues.push({ message: `Second Antiphon block at ${l2} renders after Third Antiphon begins at ${f3}.` });
    if (f1 > f2) issues.push({ message: `First Antiphon starts at ${f1} but Second Antiphon starts earlier at ${f2}.` });
    if (f2 > f3) issues.push({ message: `Second Antiphon starts at ${f2} but Third Antiphon starts earlier at ${f3}.` });
    return issues;
  },
};
