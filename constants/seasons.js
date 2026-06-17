'use strict';

/**
 * Single source of truth for `liturgicalContext.season` values.
 *
 * Until 2026-06-17 these were bare string literals compared across
 * `calendar-rules.js`, the assemblers, the audit harness, and the JSON
 * schema — a typo in any one site silently made the comparison false with
 * no error. The constants below + the `data-file-validation` walker test
 * (test/calendar-seasons.test.js) give compile-time-style guarantees:
 *
 *   - readers import `SEASONS.X` instead of the raw string;
 *   - the walker test sweeps the calendar for the next 366 days and
 *     asserts every emitted `season` is in `SEASON_VALUES`, so a typo at
 *     any writer site in `calendar-rules.js` fails the test suite;
 *   - `schema/calendar-entry.schema.json` carries the same enum, so any
 *     hand-authored calendar entry with a bad season fails validation.
 *
 * Note: the magic string `spec.weHaveSeen === 'paschal'` is a separate
 * concept (a content sentinel for the "Christ is risen" substitution at
 * Post-Communion), NOT a season value. See `assemblers/_shared/paschal-state.js`.
 */

const SEASONS = Object.freeze({
  ORDINARY_TIME:  'ordinaryTime',
  PRE_LENTEN:     'preLenten',
  GREAT_LENT:     'greatLent',
  HOLY_WEEK:      'holyWeek',
  BRIGHT_WEEK:    'brightWeek',
  PENTECOSTARION: 'pentecostarion',
});

const SEASON_VALUES = Object.freeze(Object.values(SEASONS));
const SEASON_SET    = new Set(SEASON_VALUES);

function isSeason(s) {
  return typeof s === 'string' && SEASON_SET.has(s);
}

function assertSeason(s, context = 'liturgicalContext.season') {
  if (!isSeason(s)) {
    throw new Error(`Invalid season at ${context}: ${JSON.stringify(s)} — expected one of ${SEASON_VALUES.join(', ')}`);
  }
}

module.exports = { SEASONS, SEASON_VALUES, SEASON_SET, isSeason, assertSeason };
