'use strict';

// On Lenten commemoration Sundays (weeks 2/4/5 of Great Lent — Palamas,
// Climacus, Mary of Egypt), OCA practice sings BOTH the Sunday-cycle propers
// AND the saint's own proper prokeimenon/alleluia/Gospel/koinonikon. The
// judge sweep on 2026-07-03 caught these missing on 3-8, 3-22, 3-29 in
// 2026 — cluster #1 of the sweep.
//
// This rule asserts that the Prokeimenon, Alleluia, Gospel Reading, and
// Communion Hymn sections each contain at least TWO distinct rendered
// elements on those Sundays (one Sunday-cycle, one saint-secondary).
//
// Cross Sunday (week 3) is intentionally excluded — its Sunday is
// self-contained as the Cross feast, not a Sunday-saint combination.

const { getWeekOfLent, getLiturgicalSeason } = require('../../../calendar-rules');
const { SEASONS } = require('../../../constants/seasons');

module.exports = {
  id:             'L27-lenten-sunday-secondary-propers',
  family:         'structure',
  severity:       'high',
  description:    'Lenten commemoration Sundays (Palamas / Climacus / Mary of Egypt) render both Sunday-cycle and saint-secondary propers.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (ctx.dow !== 'sunday') return false;
    if (getLiturgicalSeason(ctx.d) !== SEASONS.GREAT_LENT) return false;
    const week = getWeekOfLent(ctx.d);
    return week === '2' || week === '4' || week === '5';
  },
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const findings = [];

    // Prokeimenon: expect at least 2 hymn blocks (Sunday + saint secondary).
    const prokHymns = blocks.filter(b => b.section === 'Prokeimenon' && b.type === 'hymn');
    if (prokHymns.length < 2) {
      findings.push({
        message: `Lenten commemoration Sunday Prokeimenon has ${prokHymns.length} hymn block(s); expected ≥2 (Sunday + saint secondary).`,
        hint:    'Check LENTEN_SUNDAY_PROKEIMENA[week].secondary attachment in liturgy-from-orthocal.js.',
      });
    }

    // Alleluia: expect at least 2 hymn blocks.
    const allHymns = blocks.filter(b => b.section === 'Alleluia' && b.type === 'hymn');
    if (allHymns.length < 2) {
      findings.push({
        message: `Lenten commemoration Sunday Alleluia has ${allHymns.length} hymn block(s); expected ≥2 (Sunday + saint secondary).`,
        hint:    'Check LENTEN_SUNDAY_ALLELUIA[week].secondary attachment.',
      });
    }

    // Gospel Reading: expect two "The reading of the Holy Gospel" prompts
    // (Sunday primary + saint secondary).
    const gospelPrompts = blocks.filter(b =>
      b.section === 'Gospel Reading' && /The reading of the Holy Gospel according to/.test(b.text || '')
    );
    if (gospelPrompts.length < 2) {
      findings.push({
        message: `Lenten commemoration Sunday Gospel has ${gospelPrompts.length} reading(s); expected 2 (Sunday + saint secondary).`,
        hint:    'Check the gospelR2 gate — should be forced for Lenten commemoration Sundays regardless of includeSecondGospel.',
      });
    }

    // Communion Hymn: expect at least 2 choir hymn blocks with different text
    // (Sunday primary + saint secondary).
    const commChoir = blocks.filter(b => b.section === 'Communion Hymn' && b.speaker === 'choir' && b.text);
    const uniqueTexts = new Set(commChoir.map(b => b.text));
    if (uniqueTexts.size < 2) {
      findings.push({
        message: `Lenten commemoration Sunday Communion Hymn has ${uniqueTexts.size} distinct hymn(s); expected 2 (Sunday + saint secondary).`,
        hint:    'Check LENTEN_SUNDAY_COMMUNION[week] attachment.',
      });
    }

    return findings;
  },
};
