'use strict';

// Lord-I-Call structural integrity: when a Menaion Glory (doxastichon) is
// rendered, the section must continue with a Now-and-ever doxology and a
// Theotokion hymn. The historic gap was `combinesGloryNow: !lic.now` silently
// collapsing the two doxologies and dropping the Theotokion on every weekday
// Daily Vespers with a saint (fixed in commit a3b0e8c).

module.exports = {
  id:             'D2-vespers-lic-theotokion',
  family:         'structure',
  severity:       'high',
  description:    'When LIC has a Menaion Glory, the section must contain a Now-and-ever Theotokion (not just a collapsed Glory+Now).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const lic = blocks.filter(b => b.section === 'Lord, I Have Cried');
    if (!lic.length) return [];

    // Find the Glory doxology + the following hymn.
    const gloryIdx = lic.findIndex(b =>
      b.type === 'doxology' &&
      /^Glory to the Father/i.test(b.text || '') &&
      !/now and ever/i.test(b.text || '')
    );
    if (gloryIdx === -1) return [];   // either no Menaion Glory, or Glory+Now still collapsed

    // After Glory + doxastichon hymn we expect a Now-and-ever doxology + Theotokion.
    const tail = lic.slice(gloryIdx + 1);
    const hasNow = tail.some(b =>
      b.type === 'doxology' && /^Now and ever/i.test(b.text || '')
    );
    const hasTheotokion = tail.some(b =>
      b.type === 'hymn' && /theotokion/i.test(b.label || '')
    );
    const issues = [];
    if (!hasNow)         issues.push({ message: 'LIC Glory present but no separate "Now and ever" doxology follows (Glory+Now collapsed).' });
    if (!hasTheotokion)  issues.push({ message: 'LIC Glory present but no Theotokion hymn at Now-and-ever.' });
    return issues;
  },
};
