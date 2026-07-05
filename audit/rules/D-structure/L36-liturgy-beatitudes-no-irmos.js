'use strict';

const cal = require('../../../calendar-rules.js');

// Third-Antiphon Beatitudes source guard (discovered 2026-07-05, Sun 07-05
// Divine Liturgy): the Beatitudes ("Blesseds") were being populated from the
// Octoechos Resurrection *Canon* (odes 3 & 6, including the irmos) instead of
// the dedicated resurrectional Beatitudes set of the tone. The dead giveaway
// was an irmos-labeled hymn in the Third Antiphon — the Beatitudes are
// troparia only and NEVER include an irmos. Fixed by replacing the octoechos
// `tone{N}.sunday.liturgy.beatitudes` data (all 8 tones) with the dedicated
// Beatitude set and reworking server-lib/sources/beatitudes.js.
//
// This rule catches a regression back to canon/irmos data (e.g. a tone
// reverted to the ode3/ode6 shape, or a feast override emitting an irmos).

module.exports = {
  id:             'L36-liturgy-beatitudes-no-irmos',
  family:         'structure',
  severity:       'high',
  description:    'The Divine Liturgy Third Antiphon (Beatitudes) must not contain an irmos-labeled hymn — Beatitudes are troparia, never canon irmoi. [discovered 2026-07-05]',
  needsAssembled: true,
  // Ordinary-Sunday resurrectional Beatitudes only. Lenten/Holy-Week Sundays
  // (e.g. the Sunday of the Cross) and Great Feasts draw their Beatitudes from
  // a Triodion/feast canon — a separate hand-authored design that may include
  // an irmos — and are out of scope for this resurrectional-set guard.
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (ctx.season === 'greatLent' || ctx.season === 'holyWeek') return false;
    if (ctx.isBrightWeek) return false;
    if (cal.getGreatFeastKey(ctx.d) !== null) return false;
    return true;
  },
  check: (ctx) => {
    const third = (ctx.assembled?.blocks || []).filter(b => b.section === 'Third Antiphon');
    if (!third.length) return [];
    const irmoi = third.filter(b => b.type === 'hymn' && /\birmos\b/i.test(b.label || ''));
    if (!irmoi.length) return [];
    return [{
      message: `Third Antiphon contains ${irmoi.length} irmos-labeled hymn(s) — Beatitudes must use the dedicated resurrectional troparia set, not the Resurrection canon.`,
      hint:    'octoechos.json tone{N}.sunday.liturgy.beatitudes should be the flat dedicated Beatitude troparia (see server-lib/sources/beatitudes.js); no irmos.',
    }];
  },
};
