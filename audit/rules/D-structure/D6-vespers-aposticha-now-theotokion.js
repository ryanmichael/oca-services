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
    const nowIdx = tail.findIndex(b => b.type === 'doxology' && /^Now and ever/i.test(b.text || ''));
    const hasNow = nowIdx !== -1;

    // The check is STRUCTURAL: a hymn must follow the "Now and ever…". It used
    // to require the hymn's LABEL to contain "Theotokion" (or start with
    // "Paschal", added for the paschal sticheron), which is a string test
    // standing in for a structural one — it says nothing about whether a hymn
    // is there, and it goes off when a perfectly correct hymn is labelled
    // something else.
    //
    // Which is the normal case inside a feast window: on 2026-08-15 the OCA
    // order prints "Now and ever… Feast, Tone 8", and the hymn is the
    // Dormition's, labelled "(for the Dormition, by the Emperor Leo the Wise)".
    // The label rule fired on nine 2026 dates where the hymn was present and
    // right. Meanwhile a genuinely EMPTY Now-and-ever labelled "Theotokion"
    // would have passed — the failure this rule exists to catch.
    const hasNowHymn = hasNow && tail.slice(nowIdx + 1).some(
      b => b.type === 'hymn' && (b.text || '').trim().length > 0);

    const issues = [];
    if (!hasNow)        issues.push({ message: 'Aposticha Glory present but no "Now and ever" doxology follows.' });
    if (hasNow && !hasNowHymn) issues.push({ message: 'Aposticha "Now and ever" doxology present but no hymn follows it.' });
    return issues;
  },
};
