'use strict';

// The Sunday Before the Exaltation of the Cross (the Sunday in Sept 7-13)
// carries its OWN Liturgy set in place of the Octoechos-tone pair:
//   Prokeimenon, Tone 6: "O Lord, save Thy people, and bless Thine inheritance!"
//   Alleluia, Tone 1:    "I have exalted one chosen out of My people."
// and its Epistle (Galatians 6:11-18) and Gospel (John 3:13-17) are read AS
// ONE with the Sunday-cycle pericopes — not instead of them. OCA order
// 2026-0913: "Galatians 6:11-18 and 2 Corinthians 4:6-15 read as one";
// same shape in the 2025-09-07 DLMT text.
//
// Surfaced 2026-09-13 against the choir packet: the render sang the ordinary
// Tone-6 alleluia and dropped both cycle readings, and every rule passed —
// the Alleluia section had the right SHAPE (a rubric, three alleluias, two
// verses) with the wrong hymn in it. So this rule asserts identity and
// position, not counts:
//   - the FIRST prokeimenon refrain is the Sunday-Before text
//   - the Alleluia rubric says Tone 1 and its FIRST verse is Ps 88:18b
//   - a second pericope reference follows the Galatians text BEFORE any
//     second "The reading from…" announcement (the read-as-one continuation),
//     and likewise for the Gospel before its closing "Glory to Thee".
//
// Detection is independent of the wiring it guards: the Galatians 6.11-18
// reference comes from orthocal, not from the propers hook.

const SUNDAY_BEFORE_PROK = /^O Lord, save Thy people, and bless Thine inheritance/i;
const SUNDAY_BEFORE_ALL  = /^V\. I have exalted one chosen out of My people/i;

module.exports = {
  id:             'L41-sunday-before-elevation-propers',
  family:         'structure',
  severity:       'high',
  description:    'Sunday Before the Exaltation sings its own prokeimenon (Tone 6) and alleluia (Tone 1) in place of the Octoechos pair, and reads the Sunday-cycle Epistle/Gospel as one with Galatians 6:11-18 / John 3:13-17. Regression class discovered 2026-09-13.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy' || ctx.dow !== 'sunday') return false;
    const md = (ctx.date || '').slice(5);
    return md >= '09-07' && md <= '09-13';
  },
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const epistle = blocks.filter(b => b.section === 'Epistle Reading');
    const gospel  = blocks.filter(b => b.section === 'Gospel Reading');

    // Independent signal: orthocal appointed the Sunday-Before Epistle.
    const galIdx = epistle.findIndex(b => b.type === 'rubric' && /^Galatians 6\.11-18/.test(b.text || ''));
    if (galIdx < 0) return [];

    // The feast itself on a Sunday (9-14) is a Great Feast with a single set —
    // excluded by the date window, but guard the reading anyway.
    const findings = [];

    // Prokeimenon: the first refrain IS the Sunday-Before text.
    const prokHymns = blocks.filter(b => b.section === 'Prokeimenon' && b.type === 'hymn');
    if (!prokHymns[0] || !SUNDAY_BEFORE_PROK.test(prokHymns[0].text || '') || prokHymns[0].tone !== 6) {
      findings.push({
        message: `Sunday Before the Exaltation prokeimenon is "${(prokHymns[0]?.text || '').slice(0, 50)}" (Tone ${prokHymns[0]?.tone ?? '?'}); expected Tone 6 "O Lord, save Thy people…" as the FIRST prokeimenon.`,
        hint:    'Check the sundayBeforeElevation branch of the prokeimenon chain in liturgy-from-orthocal.js.',
      });
    }

    // Alleluia: Tone 1, first verse Ps 88:18b — the Octoechos-tone alleluia is
    // the exact wrong hymn this rule exists to catch.
    const allRubric = blocks.find(b => b.section === 'Alleluia' && b.type === 'rubric');
    const allVerses = blocks.filter(b => b.section === 'Alleluia' && b.type === 'verse');
    if (!allRubric || !/Tone 1\b/.test(allRubric.text || '') || !allVerses[0] || !SUNDAY_BEFORE_ALL.test(allVerses[0].text || '')) {
      findings.push({
        message: `Sunday Before the Exaltation alleluia is "${(allRubric?.text || '').slice(0, 30)}" / "${(allVerses[0]?.text || '').slice(0, 50)}"; expected Tone 1 "I have exalted one chosen out of My people" as the FIRST verse.`,
        hint:    'Check the sundayBeforeElevation branch of the alleluia chain in liturgy-from-orthocal.js.',
      });
    }

    // Epistle read as one: after the Galatians reference, the next reference
    // must arrive before any further "The reading from…" announcement.
    const isAnnounce = b => b.type === 'prayer' && /^The reading (from|of) the/.test(b.text || '');
    const isRef      = b => b.type === 'rubric' && /^[1-3]? ?[A-Z][a-z]+ \d+\.\d+/.test(b.text || '');
    const afterGal = epistle.slice(galIdx + 1);
    const nextRef = afterGal.findIndex(isRef);
    const nextAnn = afterGal.findIndex(isAnnounce);
    if (nextRef < 0 || (nextAnn >= 0 && nextAnn < nextRef)) {
      findings.push({
        message: 'Sunday Before the Exaltation Epistle: Galatians 6:11-18 is not followed by the Sunday-cycle pericope under the same announcement (expected "read as one", e.g. 2 Corinthians 4:6-15 in 2026).',
        hint:    'Check epistleCont in liturgy-from-orthocal.js and the continuation branch of _litEpistle.',
      });
    }

    // Gospel read as one: after John 3.13-17, a second reference before the
    // closing "Glory to Thee, O Lord" and before any second announcement.
    const johnIdx = gospel.findIndex(b => b.type === 'rubric' && /^John 3\.13-17/.test(b.text || ''));
    if (johnIdx >= 0) {
      const afterJohn = gospel.slice(johnIdx + 1);
      const gRef = afterJohn.findIndex(isRef);
      const gAnn = afterJohn.findIndex(isAnnounce);
      const gEnd = afterJohn.findIndex(b => b.type === 'response' && /Glory to Thee, O Lord/.test(b.text || ''));
      if (gRef < 0 || (gAnn >= 0 && gAnn < gRef) || (gEnd >= 0 && gEnd < gRef)) {
        findings.push({
          message: 'Sunday Before the Exaltation Gospel: John 3:13-17 is not followed by the Sunday-cycle pericope under the same announcement (expected "read as one", e.g. Matthew 22:35-46 in 2026).',
          hint:    'Check gospelCont in liturgy-from-orthocal.js and the continuation branch of _litGospel.',
        });
      }
    }

    return findings;
  },
};
