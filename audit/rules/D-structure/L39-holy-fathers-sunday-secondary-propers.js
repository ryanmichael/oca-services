'use strict';

// The movable Sunday of the Holy Fathers — First Six Ecumenical Councils
// (July 13-19) or Seventh Ecumenical Council (Oct 11-17) — carries a complete
// SECOND set of Liturgy propers layered on the Sunday cycle: the Fathers'
// prokeimenon (Tone 4), alleluia (Tone 1), Gospel (John 17:1-13), koinonikon
// ("Rejoice in the Lord, O ye righteous…"), and 4 troparia from Ode 3 of the
// Fathers' 1st canon at the Beatitudes.
//
// The judge sweep on 2026-07-19 (Pentecost-7) caught the whole Fathers half
// missing except the second Epistle (which orthocal supplied automatically).
// This rule asserts the second set is present whenever a Fathers-of-the-Council
// commemoration is rendered (detected from the DB-sourced troparion/kontakion,
// which is independent of the propers-wiring this guards).

module.exports = {
  id:             'L39-holy-fathers-sunday-secondary-propers',
  family:         'structure',
  severity:       'high',
  description:    'Sunday of the Holy Fathers (Ecumenical Councils) renders the Fathers’ second set of propers (prokeimenon / alleluia / Gospel / koinonikon / Beatitude troparia) alongside the Sunday cycle. Regression class discovered 2026-07-19.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy' || ctx.dow !== 'sunday') return false;
    // Scope to the two FIXED Councils Fathers Sundays this rule guards:
    // First Six Councils (Sunday in July 13-19) and Seventh Council (Sunday in
    // Oct 11-17). The movable Paschal-cycle Fathers Sunday (7th Sunday of
    // Pascha) is deliberately EXCLUDED — the assembler gates the dual-propers
    // hook on `!pentOverride`, because that day is a Pentecostarion Sunday whose
    // proper Gospel already IS John 17:1-13 (single set, no Octoechos Sunday
    // cycle to layer onto). Its commemoration label still pairs "Fathers" with
    // "Council", so a label-only guard leaks — the date window is the reliable
    // discriminator. (False positive surfaced 2026-07-25.)
    const md = (ctx.date || '').slice(5); // 'MM-DD'
    return (md >= '07-13' && md <= '07-19') || (md >= '10-11' && md <= '10-17');
  },
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];

    // Is this a Fathers-of-the-Council Sunday? Detect from the rendered
    // troparion/kontakion label (menaion-DB sourced, independent of the
    // secondary-propers code path this rule guards). The date-window guard in
    // appliesTo already excludes the Sunday before Nativity (Forefathers) and
    // the Paschal-cycle Fathers Sunday.
    const isFathersSunday = blocks.some(b =>
      /fathers\b.*\bcouncil/i.test(`${b.label || ''} ${b.text || ''}`));
    if (!isFathersSunday) return [];

    const findings = [];

    // Prokeimenon: Sunday + Fathers = ≥2 hymn blocks.
    const prokHymns = blocks.filter(b => b.section === 'Prokeimenon' && b.type === 'hymn');
    if (prokHymns.length < 2) {
      findings.push({
        message: `Holy Fathers Sunday Prokeimenon has ${prokHymns.length} hymn block(s); expected ≥2 (Sunday + Fathers Tone 4).`,
        hint:    'Check the HOLY_FATHERS_PROPER.prokeimenon secondary attachment in liturgy-from-orthocal.js (holyFathersSunday guard).',
      });
    }

    // Alleluia: Sunday + Fathers = ≥2 hymn blocks.
    const allHymns = blocks.filter(b => b.section === 'Alleluia' && b.type === 'hymn');
    if (allHymns.length < 2) {
      findings.push({
        message: `Holy Fathers Sunday Alleluia has ${allHymns.length} hymn block(s); expected ≥2 (Sunday + Fathers Tone 1).`,
        hint:    'Check the HOLY_FATHERS_PROPER.alleluia secondary attachment.',
      });
    }

    // Gospel Reading: Sunday + Fathers (John 17) = two reading prompts.
    const gospelPrompts = blocks.filter(b =>
      b.section === 'Gospel Reading' && /The reading of the Holy Gospel according to/.test(b.text || ''));
    if (gospelPrompts.length < 2) {
      findings.push({
        message: `Holy Fathers Sunday Gospel has ${gospelPrompts.length} reading(s); expected 2 (Sunday + Fathers John 17:1-13).`,
        hint:    'Check the gospelR2 gate — holyFathersSunday must force the second Gospel regardless of includeSecondGospel.',
      });
    }

    // Communion Hymn: Sunday + Fathers = ≥2 distinct choir hymn texts.
    const commChoir = blocks.filter(b => b.section === 'Communion Hymn' && b.speaker === 'choir' && b.text);
    const uniqueTexts = new Set(commChoir.map(b => b.text));
    if (uniqueTexts.size < 2) {
      findings.push({
        message: `Holy Fathers Sunday Communion Hymn has ${uniqueTexts.size} distinct hymn(s); expected 2 (Sunday + Fathers koinonikon).`,
        hint:    'Check the HOLY_FATHERS_PROPER.communionHymn secondary attachment.',
      });
    }

    // Beatitudes: the 4 Fathers Ode-3 troparia must appear at the Third Antiphon.
    const fathersBeatitudes = blocks.filter(b =>
      b.section === 'Third Antiphon' && b.type === 'hymn' && b.source === 'feast');
    if (fathersBeatitudes.length < 4) {
      findings.push({
        message: `Holy Fathers Sunday Beatitudes has ${fathersBeatitudes.length} Fathers troparion/troparia; expected 4 (Ode 3 of the 1st Canon).`,
        hint:    'Check buildBeatitudesTroparia feastCanonOverride=holy-fathers-councils and beatitudesReplaceGloryNow in beatitudes.js.',
      });
    }

    return findings;
  },
};
