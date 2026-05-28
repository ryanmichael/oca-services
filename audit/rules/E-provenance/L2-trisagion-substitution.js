'use strict';

// The Trisagion is substituted on a fixed set of feast days. Encoded inline
// here (not via getTrisagionSubstitution) so the rule keeps catching
// regressions if the calendar function drops a case — which is exactly the
// bug class this catches (Pascha / Bright Week / Pentecost were missing
// before 2026-05-28).
//
// Canonical days (universal Orthodox practice):
//   baptismal — Pascha, Bright Week, Pentecost, Nativity (Dec 25), Theophany
//                (Jan 6), Lazarus Saturday, Great Saturday
//   cross     — Sunday of the Holy Cross (3rd Sun of Lent), Elevation (Sep 14)

function expectedSubstitution(ctx) {
  const month = ctx.d.getUTCMonth() + 1;
  const day   = ctx.d.getUTCDate();

  // Cross
  if (month === 9 && day === 14) return 'cross';
  if (ctx.season === 'greatLent' && ctx.dow === 'sunday' && ctx.weekOfLent === 3) return 'cross';

  // Baptismal
  if (month === 12 && day === 25) return 'baptismal';   // Nativity
  if (month === 1  && day === 6 ) return 'baptismal';   // Theophany
  if (ctx.season === 'holyWeek' && ctx.dow === 'saturday') return 'baptismal';   // Great Saturday
  if (ctx.season === 'brightWeek') return 'baptismal';                            // Pascha + Bright Week
  if (ctx.daysSincePascha === 49)  return 'baptismal';                            // Pentecost
  // Lazarus Saturday — Pascha − 8 days
  if (ctx.daysSincePascha === -8)  return 'baptismal';

  return 'typical';
}

const cal = require('../../../calendar-rules.js');

module.exports = {
  id:             'L2-trisagion-substitution',
  family:         'provenance',
  severity:       'high',
  description:    'Trisagion substituted with the correct festal text (baptismal "As many as have been baptized" or "Before Thy Cross we bow down") on the canonical days.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    // Compute weekOfLent here since ctx doesn't carry it yet.
    ctx.weekOfLent = cal.getWeekOfLent(ctx.d);
    return expectedSubstitution(ctx) !== 'typical';
  },
  check: (ctx) => {
    const expected = expectedSubstitution(ctx);
    const blocks   = (ctx.assembled?.blocks || []).filter(b => b.section === 'Trisagion' && b.type === 'hymn');
    if (!blocks.length) return [];
    const text = blocks.map(b => (b.text || '').toLowerCase()).join(' ');

    if (expected === 'baptismal' && !/baptized into christ/.test(text)) {
      return [{
        message: 'Expected baptismal substitution ("As many as have been baptized into Christ…") but standard Trisagion is rendered.',
        hint:    'See getTrisagionSubstitution in calendar-rules.js — must return "baptismal" for this date.',
      }];
    }
    if (expected === 'cross' && !/before thy cross/.test(text)) {
      return [{
        message: 'Expected cross substitution ("Before Thy Cross we bow down…") but standard Trisagion is rendered.',
        hint:    'See getTrisagionSubstitution in calendar-rules.js — must return "cross" for this date.',
      }];
    }
    return [];
  },
};
