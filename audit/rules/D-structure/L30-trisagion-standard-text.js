'use strict';

// L2 checks that the Trisagion is *substituted* on the canonical days
// (baptismal at Pascha/Theophany/Nativity etc.; cross at Sep 14 + Sunday of
// the Cross). This rule checks the *complement*: on all other days the
// standard Trisagion text "Holy God, Holy Mighty, Holy Immortal, have mercy
// on us" must render. Catches a stray substitution path firing on a wrong
// date.

const cal = require('../../../calendar-rules.js');

function substitutionExpected(ctx) {
  const month = ctx.d.getUTCMonth() + 1;
  const day   = ctx.d.getUTCDate();
  if (month === 9 && day === 14) return true;
  const weekOfLent = cal.getWeekOfLent(ctx.d);
  if (ctx.season === 'greatLent' && ctx.dow === 'sunday' && weekOfLent === 3) return true;
  if (month === 12 && day === 25) return true;
  if (month === 1  && day === 6)  return true;
  if (ctx.season === 'holyWeek' && ctx.dow === 'saturday') return true;
  if (ctx.season === 'brightWeek') return true;
  if (ctx.daysSincePascha === 49)  return true;
  if (ctx.daysSincePascha === -8)  return true;
  return false;
}

module.exports = {
  id:             'L30-trisagion-standard-text',
  family:         'structure',
  severity:       'high',
  description:    'Trisagion renders the standard "Holy God, Holy Mighty, Holy Immortal" text on non-substitution days.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    return !substitutionExpected(ctx);
  },
  check: (ctx) => {
    const hymns = (ctx.assembled?.blocks || [])
      .filter(b => b.section === 'Trisagion' && b.type === 'hymn');
    if (!hymns.length) return [];
    const joined = hymns.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/holy god[, ]+holy mighty[, ]+holy immortal/.test(joined)) return [];
    return [{
      message: 'Trisagion has no standard "Holy God, Holy Mighty, Holy Immortal" text on a non-substitution day.',
      hint:    'A festal substitution (baptismal / cross) may be firing on the wrong date — check getTrisagionSubstitution.',
    }];
  },
};
