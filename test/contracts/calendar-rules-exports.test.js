/**
 * Contract: calendar-rules.js public export shape
 *
 * `server-lib/boot/load-fixed.js:194` splats `...require('../../calendar-rules')`
 * into a shared context bag. If the facade ever drops, renames, or re-orders an
 * export, downstream consumers silently lose access. This test freezes the key
 * set so the Track D module split (and any future refactor) cannot regress it
 * without an explicit, reviewed change here.
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const FROZEN_EXPORTS = [
  'JULIAN_OFFSET_DAYS',
  'VESPERS_SUNG_EVE',
  'calculatePascha',
  'fixedFeastDate',
  'generateCalendarEntry',
  'getAllSaints',
  'getDayOfWeek',
  'getEothinon',
  'getFeastRank',
  'getGreatFeastKey',
  'getLentenSaturdayNumber',
  'getLiturgicalKey',
  'getLiturgicalSeason',
  'getLiturgyVariant',
  'getTone',
  'getTrisagionSubstitution',
  'getWeekOfLent',
  'isBridegroomMatins',
  'isBurialVespersDay',
  'isLamentationsDay',
  'isLiturgyServed',
  'isPassionGospelsDay',
  'isPresanctifiedDay',
  'isRoyalHoursDay',
  'isSoulSaturday',
  'isVesperalLiturgyDay',
  'isVigilServed',
];

describe('calendar-rules public export shape', () => {
  const mod = require('../../calendar-rules');
  const actual = Object.keys(mod).sort();

  it('exports the frozen 27-key set (no additions, no removals)', () => {
    assert.deepEqual(actual, FROZEN_EXPORTS);
  });

  it('every export is non-undefined', () => {
    for (const k of FROZEN_EXPORTS) {
      assert.ok(mod[k] !== undefined, `export '${k}' is undefined`);
    }
  });
});
