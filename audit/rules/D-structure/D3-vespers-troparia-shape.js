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
//
// Special-services seasons are excluded too: greatLent, holyWeek, brightWeek
// each substitute the Troparia section with a feast/penitential structure
// (Triodion troparia at Lenten Sat; "Christ is risen" through Bright Week;
// festal troparia on Lazarus Sat and Palm Sun) where INV-5's Now+Theotokion
// closure doesn't apply. Pentecost eve (P+48) is the last paschal-cycle
// special service before the season normalizes.

module.exports = {
  id:             'D3-vespers-troparia-shape',
  family:         'structure',
  severity:       'high',
  description:    'Vespers Troparia must end with a Now-and-ever Theotokion (except vigil-rank, which sings the troparion thrice).',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'vespers') return false;
    if (ctx.season === 'greatLent') return false;
    if (ctx.season === 'holyWeek')  return false;
    if (ctx.isBrightWeek) return false;
    if (ctx.daysSincePascha === 48) return false;   // Pentecost eve
    return true;
  },
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

    // Find the last "Now and ever" doxology; assert that a closing hymn
    // follows it. We don't require the hymn to be labeled "Theotokion" —
    // during festal afterfeasts (Ascension, etc.) the closing hymn is the
    // feast troparion in place of the Theotokion. The original bug class
    // (Glory-doxology with NO Now+closure) still gets caught.
    let nowIdx = -1;
    trop.forEach((b, i) => {
      if (b.type === 'doxology' && /^Now and ever/i.test(b.text || '')) nowIdx = i;
    });

    const issues = [];
    if (nowIdx === -1) {
      issues.push({ message: 'Troparia section ends without a "Now and ever" doxology.' });
    } else {
      const closingHymn = trop.slice(nowIdx + 1).some(b => b.type === 'hymn');
      if (!closingHymn) issues.push({ message: 'Troparia "Now and ever" doxology has no closing hymn (Theotokion or festal troparion).' });
    }
    return issues;
  },
};
