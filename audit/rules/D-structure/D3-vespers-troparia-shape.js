'use strict';

// Vespers Troparia shape: for a non-vigil Daily Vespers with at least one
// saint's troparion, the section must end with a Now-and-ever doxology + a
// Theotokion. The historic gap was the menaion troparion being spliced as
// `position: 'glory'` on an empty slots array, producing `[Glory] →
// [saint troparion]` with no leading troparion and no trailing Theotokion
// (fixed in commit 3156bb0).
//
// Vigil-rank services intentionally drop the Theotokion and sing the
// troparion thrice — that path is signalled by the "sung thrice" rubric
// block at the head of the section and is excluded here.

module.exports = {
  id:             'D3-vespers-troparia-shape',
  family:         'structure',
  severity:       'high',
  description:    'Vespers Troparia must end with a Now-and-ever Theotokion (except vigil-rank, which sings the troparion thrice).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const trop = blocks.filter(b => b.section === 'Troparia');
    if (!trop.length) return [];

    // Skip vigil-rank "sung thrice" rendering.
    const isThrice = trop.some(b => b.type === 'rubric' && /sung thrice/i.test(b.text || ''));
    if (isThrice) return [];

    // Need at least one troparion hymn to make assertions about a trailing Theotokion.
    const hasTroparion = trop.some(b => b.type === 'hymn');
    if (!hasTroparion) return [];

    const hasNow = trop.some(b =>
      b.type === 'doxology' && /^Now and ever/i.test(b.text || '')
    );
    const hasTheotokion = trop.some(b =>
      b.type === 'hymn' && /theotokion/i.test(b.label || '')
    );

    const issues = [];
    if (!hasNow)        issues.push({ message: 'Troparia section ends without a "Now and ever" doxology.' });
    if (!hasTheotokion) issues.push({ message: 'Troparia section ends without a Theotokion hymn at Now-and-ever.' });
    return issues;
  },
};
