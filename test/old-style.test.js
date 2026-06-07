'use strict';

// Cross-jurisdictional contract tests for the Old-Style (Julian) calendar
// axis. Each case asserts which fixed feast resolves under each style on a
// given civil (Gregorian) date.
//
// These dates anchor the Julian → Gregorian + 13d offset (valid through
// 2099-12-31; becomes +14d on 2100-03-01 — revisit then). See
// docs/old-style-calendar.md.

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');

const {
  fixedFeastDate,
  getGreatFeastKey,
  getFeastRank,
  getTrisagionSubstitution,
  getLiturgyVariant,
  isLiturgyServed,
  JULIAN_OFFSET_DAYS,
} = require('../calendar-rules');

const { resolveStyle }    = require('../server-lib/overlays/style');
const { buildMatinsSpec } = require('../server-lib/sources/matins-spec');

function utc(dateStr) {
  return new Date(dateStr + 'T12:00:00Z');
}

describe('Old-Style calendar — primitives', () => {
  it('JULIAN_OFFSET_DAYS is 13 (valid 1900–2099)', () => {
    assert.equal(JULIAN_OFFSET_DAYS, 13);
  });

  it("fixedFeastDate(date, 'new') is the identity", () => {
    const d = utc('2026-06-15');
    assert.equal(fixedFeastDate(d, 'new').getTime(), d.getTime());
  });

  it("fixedFeastDate(date, 'old') shifts back 13 days", () => {
    const d   = utc('2026-01-07');
    const adj = fixedFeastDate(d, 'old');
    assert.equal(adj.toISOString().slice(0, 10), '2025-12-25');
  });

  it('fixedFeastDate handles year-wrap correctly', () => {
    const d   = utc('2026-01-13');
    const adj = fixedFeastDate(d, 'old');
    assert.equal(adj.getUTCFullYear(), 2025);
    assert.equal(adj.getUTCMonth() + 1, 12);
    assert.equal(adj.getUTCDate(), 31);
  });
});

describe('Old-Style calendar — Great Feast resolution', () => {
  // Each row: [civil date (Gregorian), expected new feast, expected old feast,
  //           descriptive label]
  const CASES = [
    ['2026-12-25', 'nativity',         null,                'Nativity New Style'],
    ['2026-01-07', null,               'nativity',          'Nativity Old Style (Julian Dec 25)'],
    ['2026-01-06', 'theophany',        null,                'Theophany New Style'],
    ['2026-01-19', null,               'theophany',         'Theophany Old Style (Julian Jan 6)'],
    ['2026-02-02', 'meeting',          null,                'Meeting of the Lord New Style'],
    ['2026-02-15', null,               'meeting',           'Meeting of the Lord Old Style (Julian Feb 2)'],
    ['2026-03-25', 'annunciation',     null,                'Annunciation New Style'],
    ['2026-04-07', null,               'annunciation',      'Annunciation Old Style (Julian Mar 25)'],
    ['2026-08-06', 'transfiguration',  null,                'Transfiguration New Style'],
    ['2026-08-19', null,               'transfiguration',   'Transfiguration Old Style (Julian Aug 6)'],
    ['2026-08-15', 'dormition',        null,                'Dormition New Style'],
    ['2026-08-28', null,               'dormition',         'Dormition Old Style (Julian Aug 15)'],
    ['2026-09-08', 'nativityTheotokos',null,                'Nativity of the Theotokos New Style'],
    ['2026-09-21', null,               'nativityTheotokos', 'Nativity of the Theotokos Old Style (Julian Sep 8)'],
    ['2026-09-14', 'elevation',        null,                'Elevation of the Cross New Style'],
    ['2026-09-27', null,               'elevation',         'Elevation of the Cross Old Style (Julian Sep 14)'],
    ['2026-11-21', 'entryTheotokos',   null,                'Entry of the Theotokos New Style'],
    ['2026-12-04', null,               'entryTheotokos',    'Entry of the Theotokos Old Style (Julian Nov 21)'],
  ];

  for (const [date, expectedNew, expectedOld, label] of CASES) {
    it(`${label} — ${date}`, () => {
      const d = utc(date);
      assert.equal(getGreatFeastKey(d, 'new'), expectedNew, `New: ${label}`);
      assert.equal(getGreatFeastKey(d, 'old'), expectedOld, `Old: ${label}`);
    });
  }
});

describe('Old-Style calendar — feast-rank consequences', () => {
  it('Vigil-rank saints shift too: St Nicholas Old Style is Dec 19 (Julian Dec 6)', () => {
    const d = utc('2026-12-19');
    assert.equal(getFeastRank(d, 'old'), 'vigil');
    assert.equal(getFeastRank(d, 'new'), 'sixStichera');
  });

  it('St Nicholas New Style on Dec 6 — vigil only under new', () => {
    const d = utc('2026-12-06');
    assert.equal(getFeastRank(d, 'new'), 'vigil');
    // Under Old, Dec 6 civil = Nov 23 Julian (no Vigil-rank saint)
    assert.equal(getFeastRank(d, 'old'), 'sixStichera');
  });

  it('Old-Style Theophany (Jan 19) sets Baptismal Trisagion', () => {
    const d = utc('2026-01-19');
    assert.equal(getTrisagionSubstitution(d, 'old'), 'baptismal');
    assert.equal(getTrisagionSubstitution(d, 'new'), 'typical');
  });

  it('Old-Style Elevation of the Cross (Sep 27) sets the Cross Trisagion', () => {
    const d = utc('2026-09-27');
    assert.equal(getTrisagionSubstitution(d, 'old'), 'cross');
    assert.equal(getTrisagionSubstitution(d, 'new'), 'typical');
  });

  it("Old-Style Eve of Theophany (Jan 18) sets Basil Liturgy", () => {
    const d = utc('2026-01-18');
    assert.equal(getLiturgyVariant(d, 'old'), 'basil');
  });

  it('Old-Style St Basil Day (Jan 14) sets Basil Liturgy', () => {
    const d = utc('2026-01-14');
    assert.equal(getLiturgyVariant(d, 'old'), 'basil');
  });

  it('Old-Style Annunciation (Apr 7) is a Great Feast → Liturgy served', () => {
    const d = utc('2026-04-07');
    assert.equal(isLiturgyServed(d, 'old'), true);
  });
});

describe('Old-Style calendar — fixed feast inside Holy/Bright Week', () => {
  // In 2026, civil Apr 7 = Julian Mar 25 (Annunciation) lands on Holy Tuesday.
  // The Typikon rubric for "Annunciation on Holy ___" keeps the festal propers;
  // the matins route must not return null just because the season is holyWeek.
  it('Old-Style Annunciation in Holy Week returns festal matins (not null)', () => {
    const d    = utc('2026-04-07');
    const spec = buildMatinsSpec('2026-04-07', d, 'tuesday', 'holyWeek', 8, {}, 'old');
    assert.notEqual(spec, null, 'buildMatinsSpec returned null — Holy Week guard ate the great feast');
    assert.equal(spec.feastRank, 'greatFeast');
    assert.ok(spec.canon,  'festal canon missing');
    assert.ok(spec.gospel, 'festal gospel missing');
  });

  it('New-Style Apr 7 (no feast) still returns null in Holy Week', () => {
    const d    = utc('2026-04-07');
    const spec = buildMatinsSpec('2026-04-07', d, 'tuesday', 'holyWeek', 8, {}, 'new');
    assert.equal(spec, null, 'plain Holy Tuesday should still 404 for regular matins');
  });
});

describe('Old-Style calendar — defaults preserve current behavior', () => {
  // The whole point of the optional `style='new'` default is that no caller
  // who hasn't opted in sees any behavior change.
  it('omitting style defaults to new', () => {
    const d = utc('2026-01-07');
    assert.equal(getGreatFeastKey(d), null, 'Jan 7 civil is NOT a feast under default');
    assert.equal(getGreatFeastKey(d, 'new'), null);
  });
});

describe('resolveStyle — overlay + query interaction', () => {
  it('returns "new" when nothing supplies a style', () => {
    assert.equal(resolveStyle({}, null), 'new');
  });

  it('query string wins over overlay default', () => {
    assert.equal(resolveStyle({ style: 'old' }, null), 'old');
  });

  it("rejects unknown style values in the query", () => {
    assert.equal(resolveStyle({ style: 'julian-revised' }, null), 'new');
  });
});
