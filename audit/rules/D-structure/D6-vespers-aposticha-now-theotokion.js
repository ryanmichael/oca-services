'use strict';

// Mirror of D2 for the Aposticha section: when an Aposticha Glory is
// rendered, the section must contain a separate Now-and-ever doxology and a
// Theotokion hymn. Catches future regressions where someone collapses
// Glory+Now or drops the trailing Theotokion in the aposticha injection path
// (the LIC version of this bug was 2026-06-13's NA Saints gap, fixed
// originally there; this rule guards the aposticha equivalent).

module.exports = {
  id:             'D6-vespers-aposticha-now-theotokion',
  family:         'structure',
  severity:       'high',
  description:    'When the Aposticha has a Glory, the section must contain a separate Now-and-ever doxology and a Theotokion hymn.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const apost = blocks.filter(b => b.section === 'Aposticha');
    if (!apost.length) return [];

    // Separate "Glory" doxology (not the combined "Glory ... now and ever").
    const gloryIdx = apost.findIndex(b =>
      b.type === 'doxology' &&
      /^Glory to the Father/i.test(b.text || '') &&
      !/now and ever/i.test(b.text || '')
    );
    if (gloryIdx === -1) return [];

    const tail = apost.slice(gloryIdx + 1);
    const hasNow        = tail.some(b => b.type === 'doxology' && /^Now and ever/i.test(b.text || ''));
    const hasTheotokion = tail.some(b => b.type === 'hymn' && /theotokion/i.test(b.label || ''));

    const issues = [];
    if (!hasNow)        issues.push({ message: 'Aposticha Glory present but no "Now and ever" doxology follows.' });
    if (!hasTheotokion) issues.push({ message: 'Aposticha Glory present but no Theotokion hymn at Now-and-ever.' });
    return issues;
  },
};
