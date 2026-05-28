'use strict';

// When a Great Feast falls on any date (incl. Lenten weekdays for
// Annunciation, Sundays for Pascha/Pentecost, etc.), the Liturgy response's
// `liturgicalLabel` must contain the feast name. Pre-fix the Annunciation in
// Lent returned label=null because the Lenten-weekday branch of getDayLabel
// fired first and didn't check for a Great Feast override.

const cal = require('../../../calendar-rules.js');

// Mirror server.js GREAT_FEAST_VARIANTS labels — kept inline so the rule
// catches regressions if the table is mutated or labels drift.
const EXPECTED_LABEL_FRAGMENT = {
  nativity:            /nativity of christ/i,
  theophany:           /theophany/i,
  meeting:             /meeting of (our )?(the )?lord/i,
  annunciation:        /annunciation/i,
  transfiguration:     /transfiguration/i,
  elevation:           /elevation of the cross/i,
  ascension:           /ascension/i,
  pentecost:           /pentecost/i,
  pascha:              /pascha/i,
  palmSunday:          /palm sunday|entr(?:y|ance).{0,30}jerusalem/i,
  nativityTheotokos:   /nativity of.{0,30}theotokos/i,
  entryTheotokos:      /entry of.{0,30}theotokos|entr(?:y|ance).{0,30}temple/i,
  dormition:           /dormition/i,
};

module.exports = {
  id:             'L4-great-feast-label',
  family:         'provenance',
  severity:       'high',
  description:    'Liturgy on a Great Feast date must include the feast name in `liturgicalLabel`.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy' && cal.getGreatFeastKey(ctx.d) !== null,
  check: (ctx) => {
    const feastKey = cal.getGreatFeastKey(ctx.d);
    const expected = EXPECTED_LABEL_FRAGMENT[feastKey];
    const label    = ctx.assembled?.liturgicalLabel || '';
    if (!expected) return [];
    if (expected.test(label)) return [];
    return [{
      message: `Liturgy on ${feastKey} returned liturgicalLabel=${JSON.stringify(label)} — expected to match ${expected}.`,
      hint:    'Check getDayLabel in server.js — Great Feast override must fire before season-specific label branches.',
    }];
  },
};
