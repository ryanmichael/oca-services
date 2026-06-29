'use strict';

const cal = require('../../../calendar-rules.js');

// On a Vigil/Polyeleos/Great-Feast date, BOTH the Epistle and Gospel sections
// must contain at least one reading. The 2026-06-29 audit found the SS Peter
// and Paul feast Gospel (Matt 16.13-19) MISSING entirely while the Epistle
// rendered — the structural-A fix in liturgy-from-orthocal.js addresses this
// by promoting the feast reading to primary on weekday great-saint feasts.
//
// COUNT-MISMATCH is INTENTIONAL on co-celebration days: OCA practice reads
// 2 epistles (daily/Sunday + saint) but only 1 gospel (the saint gospel is
// hidden behind `includeSecondGospel` parish opt-in per liturgy-from-orthocal
// .js line 159-163). Rule therefore only catches the catastrophic case where
// one side is dropped to zero — not the deliberate 2-vs-1 cocelebration shape.

module.exports = {
  id:             'L26-feast-epistle-gospel-symmetry',
  family:         'structure',
  severity:       'high',
  description:    'Liturgy epistle/gospel render symmetrically on vigil/polyeleos/feast dates.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (cal.getGreatFeastKey(ctx.d) !== null) return true;
    const rank = cal.getFeastRank(ctx.d);
    return rank === 'vigil' || rank === 'polyeleos';
  },
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    // Reading citation blocks have section + speaker null + look like a book
    // reference. Simpler proxy: count "The reading from" rubrics in Epistle
    // (priest/reader/deacon-spoken intros) vs "according to" in Gospel.
    const epistleCount = blocks.filter(b =>
      b.section === 'Epistle Reading' && /The reading from/.test(b.text || '')
    ).length;
    const gospelCount = blocks.filter(b =>
      b.section === 'Gospel Reading' && /according to/.test(b.text || '')
    ).length;
    if (epistleCount === 0 || gospelCount === 0) {
      return [{
        message: `Liturgy missing ${epistleCount === 0 ? 'Epistle' : 'Gospel'} reading entirely (epistle=${epistleCount}, gospel=${gospelCount}).`,
        hint:    'Check liturgy-from-orthocal.js epistleR / gospelR resolution against orthocal readings list.',
      }];
    }
    return [];
  },
};
