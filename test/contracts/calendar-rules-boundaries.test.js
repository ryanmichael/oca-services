/**
 * Contract: calendar-rules.js boundary-date semantics.
 *
 * The snapshot oracle catches drift, but it only flags differences — it
 * doesn't tell you whether the *current* output is correct at the dates where
 * subtle multi-year bugs hide (Pascha edges, Bright/Pentecost transitions,
 * fixed-feast cusps, Annunciation-in-Lent, leavetaking windows).
 *
 * These tests pin explicit semantic claims at those boundaries so that a
 * future regression fails with a meaningful message instead of a 3-MB JSON
 * diff. Year 2026 is the active development year.
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const cal = require('../../calendar-rules');

const PASCHA_2026 = cal.calculatePascha(2026); // 2026-04-12
const days = (base, n) => new Date(base.getTime() + n * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);

describe('calendar-rules — boundary dates (2026)', () => {
  describe('Pascha math', () => {
    it('Pascha 2026 is 2026-04-12', () => {
      assert.equal(iso(PASCHA_2026), '2026-04-12');
    });
    it('All Saints 2026 is Pascha + 56', () => {
      assert.equal(iso(cal.getAllSaints(2026)), iso(days(PASCHA_2026, 56)));
    });
  });

  describe('Lent boundary', () => {
    const cleanMonday = days(PASCHA_2026, -48); // 2026-02-23

    it('Clean Monday is in greatLent, week 1', () => {
      assert.equal(cal.getLiturgicalSeason(cleanMonday), 'greatLent');
      assert.equal(cal.getWeekOfLent(cleanMonday), 1);
    });
    it('Day before Clean Monday is NOT greatLent (Forgiveness Sunday)', () => {
      assert.notEqual(cal.getLiturgicalSeason(days(cleanMonday, -1)), 'greatLent');
    });
    it('Lazarus Saturday (Pascha−8) is in greatLent', () => {
      const lazSat = days(PASCHA_2026, -8);
      assert.equal(cal.getLiturgicalSeason(lazSat), 'greatLent');
    });
  });

  describe('Holy Week → Bright Week → Pentecostarion', () => {
    it('Holy Friday (Pascha−2) is in holyWeek', () => {
      assert.equal(cal.getLiturgicalSeason(days(PASCHA_2026, -2)), 'holyWeek');
    });
    it('Pascha day itself is in brightWeek', () => {
      assert.equal(cal.getLiturgicalSeason(PASCHA_2026), 'brightWeek');
    });
    it('Bright Saturday (Pascha+6) is in brightWeek', () => {
      assert.equal(cal.getLiturgicalSeason(days(PASCHA_2026, 6)), 'brightWeek');
    });
    it('Thomas Sunday (Pascha+7) is in pentecostarion', () => {
      assert.equal(cal.getLiturgicalSeason(days(PASCHA_2026, 7)), 'pentecostarion');
    });
    it('Ascension (Pascha+39) is in pentecostarion', () => {
      assert.equal(cal.getLiturgicalSeason(days(PASCHA_2026, 39)), 'pentecostarion');
    });
    it('Pentecost (Pascha+49) is in pentecostarion', () => {
      assert.equal(cal.getLiturgicalSeason(days(PASCHA_2026, 49)), 'pentecostarion');
    });
    it('Day after All Saints (Pascha+57) is ordinaryTime', () => {
      assert.equal(cal.getLiturgicalSeason(days(PASCHA_2026, 57)), 'ordinaryTime');
    });
  });

  describe('Pre-Lent', () => {
    it('Publican & Pharisee Sunday (Pascha−70) is in preLenten', () => {
      assert.equal(cal.getLiturgicalSeason(days(PASCHA_2026, -70)), 'preLenten');
    });
    it('Forgiveness Sunday (Pascha−49) is in preLenten', () => {
      assert.equal(cal.getLiturgicalSeason(days(PASCHA_2026, -49)), 'preLenten');
    });
  });

  describe('Great-feast keys (fixed cycle)', () => {
    it('Sep 14 → elevation', () => {
      assert.equal(cal.getGreatFeastKey(new Date('2026-09-14T00:00:00Z')), 'elevation');
    });
    it('Nov 21 → entryTheotokos', () => {
      assert.equal(cal.getGreatFeastKey(new Date('2026-11-21T00:00:00Z')), 'entryTheotokos');
    });
    it('Dec 25 → nativity', () => {
      assert.equal(cal.getGreatFeastKey(new Date('2026-12-25T00:00:00Z')), 'nativity');
    });
    it('Aug 15 → dormition', () => {
      assert.equal(cal.getGreatFeastKey(new Date('2026-08-15T00:00:00Z')), 'dormition');
    });
    it('Jan 6 → theophany', () => {
      assert.equal(cal.getGreatFeastKey(new Date('2026-01-06T00:00:00Z')), 'theophany');
    });
    it('Mar 25 → annunciation (during Lent in 2026)', () => {
      const mar25 = new Date('2026-03-25T00:00:00Z');
      assert.equal(cal.getGreatFeastKey(mar25), 'annunciation');
      assert.equal(cal.getLiturgicalSeason(mar25), 'greatLent');
    });
    it('non-feast date → null', () => {
      assert.equal(cal.getGreatFeastKey(new Date('2026-07-15T00:00:00Z')), null);
    });
  });

  describe('Liturgy variant', () => {
    it('Lenten Sunday → basil', () => {
      const lent2 = days(PASCHA_2026, -35); // Sunday in Lent
      assert.equal(cal.getLiturgyVariant(lent2, 'new'), 'basil');
    });
    it('Ordinary Sunday → chrysostom', () => {
      assert.equal(cal.getLiturgyVariant(new Date('2026-07-12T00:00:00Z'), 'new'), 'chrysostom');
    });
  });

  describe('Tone cycle', () => {
    it('Bright Week returns tone 0 (no tone)', () => {
      assert.equal(cal.getTone(PASCHA_2026), 0);
    });
    it('Pentecost Sunday returns tone 0', () => {
      assert.equal(cal.getTone(days(PASCHA_2026, 49)), 0);
    });
    it('ordinary-time Sunday returns 1–8', () => {
      const t = cal.getTone(new Date('2026-07-12T00:00:00Z'));
      assert.ok(t >= 1 && t <= 8, `tone out of range: ${t}`);
    });
  });

  describe('Old-style threading', () => {
    it('fixedFeastDate shifts a civil date back by JULIAN_OFFSET_DAYS in old style', () => {
      const civil = new Date('2026-12-25T00:00:00Z');
      const newD = cal.fixedFeastDate(civil, 'new');
      const oldD = cal.fixedFeastDate(civil, 'old');
      const diffDays = (newD.getTime() - oldD.getTime()) / 86400000;
      assert.equal(diffDays, cal.JULIAN_OFFSET_DAYS);
    });
    it('JULIAN_OFFSET_DAYS is 13', () => {
      assert.equal(cal.JULIAN_OFFSET_DAYS, 13);
    });
  });
});
