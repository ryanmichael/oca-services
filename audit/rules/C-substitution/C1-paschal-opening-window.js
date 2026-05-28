'use strict';

module.exports = {
  id:          'C1-paschal-opening-window',
  family:      'substitution',
  severity:    'high',
  description: '"Christ is risen" opening fires on Pascha+0..+38 (greeting window) and nowhere else.',
  appliesTo: (ctx) =>
    ctx.service === 'vespers' &&
    (ctx.isPentecostarion || ctx.isBrightWeek),
  check: (ctx) => {
    const expected = ctx.isPaschalGreetingWindow;
    const actual   = !!ctx.calendarEntry?.vespers?.paschalOpening;
    if (actual === expected) return [];
    return [{
      message: `paschalOpening=${actual}, expected ${expected} (daysSincePascha=${ctx.daysSincePascha})`,
      hint:    'See generatePentecostarionDay — isPaschalGreeting guard ends at Pascha+38 (leavetaking).',
    }];
  },
};
