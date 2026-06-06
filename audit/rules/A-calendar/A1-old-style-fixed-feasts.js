'use strict';

// Old-Style fixed-feast resolution. Sanity-checks that for a sample of
// Gregorian civil dates, `getGreatFeastKey(date, 'old')` returns the Julian
// feast that would be celebrated on that civil day in an Old-Calendar
// jurisdiction (ROCOR, Serbian, Georgian, …).
//
// This rule runs once per audit, not once per (date, service) pair — it
// gates the offset semantics, not service content. It appears under
// `appliesTo` for a single sentinel date (the audit harness's first
// (date, service) pair) and runs all assertions in `check`.
//
// See docs/old-style-calendar.md.

const cal = require('../../../calendar-rules.js');

// (civil-Gregorian YYYY-MM-DD, expected getGreatFeastKey under 'old', label)
// The civil date is what the user sees on their phone; the Julian (M, D)
// it maps to under Old Calendar is in the label for human readability.
const CASES = [
  ['2026-01-07', 'nativity',          'Nativity (Julian Dec 25)'],
  ['2026-01-19', 'theophany',         'Theophany (Julian Jan 6)'],
  ['2026-02-15', 'meeting',           'Meeting (Julian Feb 2)'],
  ['2026-04-07', 'annunciation',      'Annunciation (Julian Mar 25)'],
  ['2026-08-19', 'transfiguration',   'Transfiguration (Julian Aug 6)'],
  ['2026-08-28', 'dormition',         'Dormition (Julian Aug 15)'],
  ['2026-09-21', 'nativityTheotokos', 'Nativity of the Theotokos (Julian Sep 8)'],
  ['2026-09-27', 'elevation',         'Elevation of the Cross (Julian Sep 14)'],
  ['2026-12-04', 'entryTheotokos',    'Entry of the Theotokos (Julian Nov 21)'],
];

module.exports = {
  id:             'A1-old-style-fixed-feasts',
  family:         'calendar',
  severity:       'high',
  description:    'Old-Style fixed feasts resolve to the correct Julian (M, D) tuple.',
  needsAssembled: false,
  // Only run on the first (date, service) of any audit to avoid emitting the
  // same finding for every row. The audit harness sweeps dates in order, so
  // hooking on Jan 1 keeps things deterministic.
  appliesTo: (ctx) => ctx.date === '2026-01-01' && ctx.service === 'vespers',
  check: () => {
    const findings = [];
    for (const [dateStr, expected, label] of CASES) {
      const d      = new Date(dateStr + 'T12:00:00Z');
      const actual = cal.getGreatFeastKey(d, 'old');
      if (actual !== expected) {
        findings.push({
          message: `Old-Style ${dateStr} (${label}) resolved to '${actual}', expected '${expected}'`,
          hint:    'Check JULIAN_OFFSET_DAYS + fixedFeastDate in calendar-rules.js.',
        });
      }
    }
    return findings;
  },
};
