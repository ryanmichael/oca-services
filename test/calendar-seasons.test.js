/**
 * Walker test: typo guard for `liturgicalContext.season`.
 *
 * Sweeps `getLiturgicalSeason()` and `generateCalendarEntry()` across a full
 * year and asserts every emitted season string is in the allowlist exported
 * by `constants/seasons.js`. A typo at any writer site in `calendar-rules.js`
 * will fail this test.
 *
 * See `constants/seasons.js` for the rationale.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const cal = require('../calendar-rules.js');
const { SEASON_SET, SEASON_VALUES, isSeason } = require('../constants/seasons');

describe('Calendar season typo guard', () => {
  it('getLiturgicalSeason returns an allowlisted season for every day in 2026', () => {
    const start = new Date('2026-01-01T12:00:00Z');
    for (let i = 0; i < 366; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const s = cal.getLiturgicalSeason(d);
      assert.ok(SEASON_SET.has(s),
        `getLiturgicalSeason returned "${s}" for ${d.toISOString().slice(0,10)} — expected one of ${SEASON_VALUES.join(', ')}`);
    }
  });

  it('generateCalendarEntry emits an allowlisted season for every day in 2026', () => {
    const start = new Date('2026-01-01T12:00:00Z');
    for (let i = 0; i < 366; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      let entry;
      try { entry = cal.generateCalendarEntry(iso); }
      catch { continue; } // dates that throw aren't season-relevant
      const s = entry?.liturgicalContext?.season;
      // Some entry shapes don't carry a season (e.g. error stubs); ignore.
      if (s === undefined) continue;
      assert.ok(isSeason(s),
        `generateCalendarEntry(${iso}) emitted season "${s}" — expected one of ${SEASON_VALUES.join(', ')}`);
    }
  });

  it('SEASONS allowlist matches what getLiturgicalSeason can actually produce', () => {
    // Every allowlisted value should occur at least once across a 2-year sweep.
    // (If a value never appears, it's stale and should be removed.)
    const seen = new Set();
    const start = new Date('2026-01-01T12:00:00Z');
    for (let i = 0; i < 730; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      seen.add(cal.getLiturgicalSeason(d));
    }
    for (const v of SEASON_VALUES) {
      assert.ok(seen.has(v),
        `Allowlist value "${v}" never produced by getLiturgicalSeason across 2026–2027 — is it stale?`);
    }
  });
});
