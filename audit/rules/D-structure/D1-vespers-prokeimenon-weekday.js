'use strict';

// Vespers evening prokeimenon must be keyed by the civil-eve day, not the
// liturgical day. The data file (prokeimena.json) is named for the day the
// Vespers is sung (e.g., a Vespers sung Wed evening = "Wednesday prokeimenon
// = Save me, O God" Ps 53), but the calendar entry's `dow` is the *next*
// liturgical day (Wed eve → Thursday). Without the VESPERS_SUNG_EVE mapping,
// every shifted weekday Vespers picks the wrong day's prokeimenon.
//
// Five sites were fixed under commit aef1f6f; the Holy Week DAY_CONFIG
// Mon–Thu entries (calendar-rules.js:1014–1041) are knowingly stale pending
// an OCA Holy Week order check — this rule will surface them so they are
// not silently forgotten.

const { VESPERS_SUNG_EVE } = require('../../../calendar-rules.js');

function expectedKey(dow) {
  if (dow === 'sunday') return 'saturdayGreatVespers';
  return VESPERS_SUNG_EVE[dow] || dow;
}

module.exports = {
  id:             'D1-vespers-prokeimenon-weekday',
  family:         'structure',
  severity:       'high',
  description:    'Vespers weekday prokeimenon must key off the civil-eve day (VESPERS_SUNG_EVE), not the liturgical day.',
  needsAssembled: false,
  appliesTo: (ctx) => {
    if (ctx.service !== 'vespers') return false;
    const p = ctx.calendarEntry?.vespers?.prokeimenon;
    return p?.pattern === 'weekday';
  },
  check: (ctx) => {
    const actual   = ctx.calendarEntry.vespers.prokeimenon.weekday;
    const expected = expectedKey(ctx.dow);
    // Special-case: Holy Saturday and similar transition-into-Liturgy services
    // legitimately use 'saturdayGreatVespers' regardless of dow. Allow it.
    if (actual === 'saturdayGreatVespers') return [];
    if (actual === expected) return [];
    return [{
      message: `Vespers prokeimenon keyed as '${actual}', expected '${expected}' (dow=${ctx.dow}, sungEve=${VESPERS_SUNG_EVE[ctx.dow] || '-'}).`,
      hint:    'Use VESPERS_SUNG_EVE[dow] when building `vespers.prokeimenon.weekday` in calendar-rules.js.',
    }];
  },
};
