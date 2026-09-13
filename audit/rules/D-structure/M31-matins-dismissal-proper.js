'use strict';

// The dismissal must actually name the day.
//
// assembleDismissal() composes the proper text from a `dismissalSpec` — festal
// introit, day patron, the day's saints — and falls back to the literal string
// "[Proper Dismissal for the day]" when given none. assemblers/matins.js called
// it with no spec at all, so EVERY Matins printed that placeholder where the
// priest's dismissal belongs.
//
// It stayed invisible because nothing asserted on the Matins dismissal's
// content, and because on a vigil date the festal dismissal was reachable on
// the Vespers half instead — which is where contract INV-8 was checking it.
// Removing the Vespers dismissal at a vigil (correct: a vigil has ONE
// dismissal, at the end) is what finally exposed it: the festal introit
// vanished from the whole service. Found 2026-09-08.
//
// /api/vigil now hands the Vespers half's dismissal spec down to the Matins
// dismissal that closes the vigil, so vigils are covered. Matins served ALONE
// is not: the spec is composed inside assembleForDate on the Vespers path and
// nothing computes it for a bare Matins. That is the remaining gap this rule
// reports — at `low`, because the fix is a data-flow change (compute the
// dismissal spec independently of the Vespers assembly) rather than a typo.

const PLACEHOLDER = /\[Proper Dismissal for the day\]/;

module.exports = {
  id:             'M31-matins-dismissal-proper',
  family:         'structure',
  severity:       'low',
  description:    'Matins must render a proper dismissal naming the day, not the "[Proper Dismissal for the day]" placeholder. Gap found 2026-09-08 — assembleMatins passed no dismissalSpec.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const dis = (ctx.assembled?.blocks || []).filter(b => b.section === 'Dismissal');
    if (!dis.length) return [];

    const placeholder = dis.find(b => PLACEHOLDER.test(String(b.text || '')));
    if (!placeholder) return [];

    return [{
      message:
        'Matins dismissal renders the literal placeholder "[Proper Dismissal for the day]" '
        + 'instead of naming the day\'s feast, patron and saints.',
      hint:
        'assembleMatins passes spec.dismissal to assembleDismissal; nothing populates it for a '
        + 'standalone Matins (the spec is composed in assembleForDate on the Vespers path). '
        + '/api/vigil hands its Vespers half\'s spec down, which is why vigils are covered. '
        + 'Fix by composing the dismissal spec independently of the Vespers assembly.',
    }];
  },
};
