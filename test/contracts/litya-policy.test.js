/**
 * Feature contract: the Litya is a parish practice, not a consequence of rank
 *
 * `getFeastRank` returning 'vigil' is a statement about the SAINT — it drives
 * paremias at Vespers, the Magnification at Matins, festal propers at Liturgy.
 * Whether the parish serves an All-Night Vigil with a Litya and Blessing of the
 * Loaves is a statement about the PARISH. Fusing them is what has blocked rank
 * corrections: 18 of the 34 open rank-coverage findings are vigil-related, and
 * each one, applied honestly, started printing a service the parish may never
 * serve.
 *
 * The OCA orders draw the same distinction: a Great Feast prints "Litya"
 * plainly; an ordinary vigil-rank saint's day prints "[Litya]" — bracketed,
 * which those documents' own header defines as "commonly omitted in parish
 * practice".
 *
 * The rubric is `vespers.servesLitya`: always (default) | greatFeastsOnly | never.
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { applyLityaPolicy } = require(path.join(ROOT, 'server-lib', 'sources', 'calendar.js'));
const REGISTRY = require(path.join(ROOT, 'data', 'rubric-registry.json'));

// A vigil-rank saint's day (Protection, 1 October) and a Great Feast (Nativity).
const VIGIL_SAINT = '2026-10-01';
const GREAT_FEAST = '2026-12-25';

const entry = () => ({
  vespers: { serviceType: 'all-night-vigil', litya: { slots: [] }, lordICall: { totalStichera: 8 } },
});
const rubrics = (v) => ({ vespers: { servesLitya: v } });
const hasLitya = (e) => !!e?.vespers?.litya;

describe('Feature contract: Litya policy', () => {

  it('INV-1: the default is unchanged output — no policy, no removal', () => {
    // Every existing parish and every caller that passes no rubrics must render
    // exactly what it rendered before this existed.
    assert.equal(hasLitya(applyLityaPolicy(entry(), VIGIL_SAINT, 'new', undefined)), true);
    assert.equal(hasLitya(applyLityaPolicy(entry(), VIGIL_SAINT, 'new', {})), true);
    assert.equal(hasLitya(applyLityaPolicy(entry(), VIGIL_SAINT, 'new', rubrics('always'))), true);
    assert.equal(REGISTRY.rubrics.servesLitya.default, 'always');
  });

  it('INV-2: greatFeastsOnly keeps the feast and drops the saint', () => {
    assert.equal(hasLitya(applyLityaPolicy(entry(), GREAT_FEAST, 'new', rubrics('greatFeastsOnly'))), true,
      'a Great Feast prints "Litya" unbracketed and must keep it');
    assert.equal(hasLitya(applyLityaPolicy(entry(), VIGIL_SAINT, 'new', rubrics('greatFeastsOnly'))), false,
      'a vigil-rank saint\'s day prints "[Litya]" and must drop it');
  });

  it('INV-3: never means never, Great Feast included', () => {
    assert.equal(hasLitya(applyLityaPolicy(entry(), GREAT_FEAST, 'new', rubrics('never'))), false);
    assert.equal(hasLitya(applyLityaPolicy(entry(), VIGIL_SAINT, 'new', rubrics('never'))), false);
  });

  it('INV-4: subtractive only — it never invents a Litya', () => {
    // A day with no Litya block must not acquire one under any policy. Vigil-rank
    // SUNDAYS are in this category: the Sunday generator has no Litya block, so
    // they render without one whatever the parish sets. That is a known gap, not
    // something this function should paper over.
    const bare = { vespers: { serviceType: 'greatVespers', lordICall: {} } };
    for (const p of ['always', 'greatFeastsOnly', 'never', undefined]) {
      assert.equal(hasLitya(applyLityaPolicy(bare, GREAT_FEAST, 'new', p ? rubrics(p) : undefined)), false);
    }
  });

  it('INV-5: the calendar entry is not mutated in place', () => {
    // Entries are cached and shared; mutating one would leak a parish's practice
    // into the next request for a different parish.
    const e = entry();
    const out = applyLityaPolicy(e, VIGIL_SAINT, 'new', rubrics('never'));
    assert.equal(hasLitya(e), true, 'the caller\'s entry was mutated');
    assert.equal(hasLitya(out), false);
    assert.equal(out.vespers.serviceType, 'all-night-vigil', 'unrelated fields were dropped');
    assert.ok(out.vespers.lordICall, 'unrelated fields were dropped');
  });

  it('INV-6: a missing entry is handled, not thrown on', () => {
    assert.equal(applyLityaPolicy(null, VIGIL_SAINT, 'new', rubrics('never')), null);
    assert.equal(applyLityaPolicy(undefined, VIGIL_SAINT, 'new', rubrics('never')), undefined);
  });

  it('INV-7: the rubric is registered so the settings page can offer it', () => {
    const r = REGISTRY.rubrics.servesLitya;
    assert.equal(r.namespace, 'vespers.servesLitya');
    assert.equal(r.type, 'enum');
    assert.deepEqual(r.options, ['always', 'greatFeastsOnly', 'never']);
    assert.deepEqual(r.appliesTo, ['vespers']);
  });
});
