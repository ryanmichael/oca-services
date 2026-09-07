'use strict';

// A weekday Great Feast eve must offer its Great Vespers / All-Night Vigil in
// the service picker.
//
// getServiceRows() in public/scripts/app.js consulted `allNightVigil` in the
// Saturday and Sunday branches only. The weekday branch emitted Matins,
// Presanctified and Liturgy, and the shared "evening services" tail emitted
// Daily Vespers but never Great Vespers or a vigil. So on any weekday Great
// Feast eve the day appeared in the list — shouldShowDay() does check
// allNightVigil — with no vigil row to open, and a direct
// ?date=…&svc=greatVespers link no-opped because the boot handler looks up
// `.svc-row[data-svc=…]` and silently does nothing when the row is absent.
// The service was unreachable from the UI.
//
// Reported 2026-09-07 by the user trying to print that evening's vigil for the
// Nativity of the Theotokos — the same service whose texts had just been
// corrected and promoted to production.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

// getServiceRows is browser code with no module boundary; slice it out rather
// than duplicating its logic here, so this test exercises the shipped source.
function loadGetServiceRows() {
  const src   = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'scripts', 'app.js'), 'utf8');
  const start = src.indexOf('function getServiceRows(day)');
  const end   = src.indexOf('function shouldShowDay');
  assert.ok(start !== -1 && end > start,
    'getServiceRows/shouldShowDay not found — did app.js get restructured?');
  // eslint-disable-next-line no-eval
  return eval('(' + src.slice(start, end) + ')');
}

const NO_SERVICES = {
  greatVespers: false, dailyVespers: false, allNightVigil: false,
  burialVespers: false, bridegroomMatins: false, lamentations: false,
  vesperalLiturgy: false, royalHours: false, passionGospels: false,
  matins: false, liturgy: false, presanctified: false,
  paschalHours: false, paschaCollection: false, kneelingVespers: false,
};

const day = (dayOfWeek, overrides) => ({
  dayOfWeek, services: { ...NO_SERVICES, ...overrides },
});

const names = (rows) => rows.filter(r => r.available).map(r => r.name);

describe('weekday vigil service row', () => {
  const getServiceRows = loadGetServiceRows();

  // INV-1: the regression itself. 2026-09-07 was a Monday.
  test('INV-1: a weekday all-night vigil is offered', () => {
    for (const dow of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']) {
      const rows = names(getServiceRows(day(dow, {
        allNightVigil: true, matins: true, liturgy: true,
      })));
      assert.ok(rows.includes('All-Night Vigil'),
        `${dow}: expected an All-Night Vigil row, got [${rows.join(', ')}]`);
    }
  });

  // INV-2: same hole caught weekday Great Vespers without a vigil (2026-09-11).
  test('INV-2: a weekday Great Vespers is offered', () => {
    const rows = names(getServiceRows(day('friday', {
      greatVespers: true, matins: true, liturgy: true,
    })));
    assert.ok(rows.includes('Great Vespers'),
      `expected a Great Vespers row, got [${rows.join(', ')}]`);
  });

  // INV-3: Sat/Sun already emitted the row in their own branches — the weekday
  // tail must not double it up.
  test('INV-3: Saturday and Sunday emit the vigil exactly once', () => {
    for (const dow of ['saturday', 'sunday']) {
      const rows = names(getServiceRows(day(dow, {
        allNightVigil: true, matins: true, liturgy: true,
      })));
      const n = rows.filter(r => r === 'All-Night Vigil').length;
      assert.strictEqual(n, 1, `${dow}: expected exactly 1 vigil row, got ${n}`);
    }
  });

  // INV-4: an ordinary weekday must not sprout a vespers row it never had.
  test('INV-4: a plain weekday offers no Great Vespers or vigil', () => {
    const rows = names(getServiceRows(day('wednesday', {
      dailyVespers: true, matins: true, liturgy: true,
    })));
    assert.ok(!rows.includes('All-Night Vigil') && !rows.includes('Great Vespers'),
      `expected no vigil/Great Vespers row, got [${rows.join(', ')}]`);
    assert.ok(rows.includes('Daily Vespers'), 'Daily Vespers should still appear');
  });
});
