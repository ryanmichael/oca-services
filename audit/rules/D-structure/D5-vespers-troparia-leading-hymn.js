'use strict';

// Vespers Troparia must not begin with a "Glory" doxology. The historic gap
// was the Menaion injector splicing a `position: 'glory'` slot into an empty
// troparia.slots array, producing `[Glory] → [saint troparion]` with no
// leading troparion. The saint's troparion should lead the section
// un-positioned; "Glory" only appears later, before a doxastichon or
// concluding Now-and-ever block. Fixed in commit 3156bb0.
//
// Lenten Saturday Triodion is excluded: the Triodion intentionally ships the
// saint's troparion at position:'glory' (Theodore Sat, Soul Sats 2–4), so the
// section legitimately leads with a Glory doxology then the saint's hymn.
// INV-7 documents this convention; D5's failure mode doesn't apply there.

module.exports = {
  id:             'D5-vespers-troparia-leading-hymn',
  family:         'structure',
  severity:       'high',
  description:    'Vespers Troparia must lead with a hymn (or vigil-rank "sung thrice" rubric), not a "Glory" doxology.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'vespers') return false;
    if (ctx.season === 'greatLent' && ctx.dow === 'saturday') return false;
    return true;
  },
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const trop = blocks.filter(b => b.section === 'Troparia');
    if (!trop.length) return [];

    // Skip if section is empty of hymns (some calendar entries genuinely emit
    // none — caught by other rules).
    const firstContentful = trop.find(b => b.type === 'hymn' || b.type === 'doxology' || b.type === 'rubric');
    if (!firstContentful) return [];

    // Vigil-rank "Troparion sung thrice" rubric is allowed to lead.
    if (firstContentful.type === 'rubric' && /sung thrice/i.test(firstContentful.text || '')) return [];

    // Otherwise the first contentful block must be a hymn.
    if (firstContentful.type === 'hymn') return [];

    return [{
      message: `Troparia section leads with a ${firstContentful.type} block ("${(firstContentful.text || '').slice(0, 40)}…") instead of a hymn.`,
      hint:    'Spec should ship the saint troparion as an order:1 slot (un-positioned) — see for-date.js empty-slots branch (commit 3156bb0).',
    }];
  },
};
