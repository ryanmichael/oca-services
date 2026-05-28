'use strict';

module.exports = {
  id:          'C2-paschal-aposticha-window',
  family:      'substitution',
  severity:    'high',
  description: 'paschalAposticha flag only fires on Pent Sundays within Pascha+0..+38 (Holy Fathers at +42 must NOT fire).',
  appliesTo: (ctx) =>
    ctx.service === 'vespers' && ctx.isPentecostarion && ctx.dow === 'sunday',
  check: (ctx) => {
    const expected = ctx.isPaschalGreetingWindow;
    const actual   = !!ctx.calendarEntry?.vespers?.paschalAposticha;
    if (actual === expected) return [];
    return [{
      message: `paschalAposticha=${actual}, expected ${expected} (daysSincePascha=${ctx.daysSincePascha})`,
      hint:    'Holy Fathers Sunday (+42) was the original bug; guard with isPaschalGreeting in calendar-rules.',
    }];
  },
};
