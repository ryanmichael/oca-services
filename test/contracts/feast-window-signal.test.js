'use strict';

/**
 * Contract: the feast-window signal on /api/liturgy.
 *
 * Exists so the parish rubric "the patron is trumped by a feast or afterfeast"
 * can be expressed at all. Before it, the only window knowledge reaching a
 * route was `feastOnly`, which is true only ON a Great Feast.
 *
 * See features/feast-window-signal.md.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3101;
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    }).on('error', reject);
  });
}

const liturgy = (date) =>
  get(`/api/liturgy?date=${date}&translation=st-john-damascus-tyler`);

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch (_) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error('server did not start');
});

after(() => { if (serverProcess) serverProcess.kill(); });

describe('Feast-window signal', () => {
  // INV-1 — the pair is well-formed and mutually exclusive.
  it('INV-1 the feast ITSELF reports feastOnly, never a window', async () => {
    // Both calendars, because they reach the answer by different routes: a
    // commemoration title for the fixed feasts, a paschal offset for the
    // moveable ones. An earlier draft reused the wider isAscensionAfterfeast
    // range, which includes the feast day, and Ascension reported both.
    for (const date of ['2026-08-15',   // Dormition — fixed
                        '2026-09-14',   // Elevation — fixed
                        '2026-12-25',   // Nativity — fixed
                        '2026-05-21',   // Ascension — moveable (+39)
                        '2026-05-31']) { // Pentecost — moveable (+49)
      const r = await liturgy(date);
      assert.equal(r.status, 200, date);
      assert.equal(r.json.feastOnly, true, `${date} should be feastOnly`);
      assert.equal(r.json.feastWindow, null,
        `${date} is the feast itself — it must not also be a window`);
    }
  });

  // INV-2 — a window day is detected, whichever calendar it belongs to.
  it('INV-2 detects a window on fixed and moveable days alike', async () => {
    const cases = [
      ['2026-08-16', 'Afterfeast',  'commemoration-title'], // Dormition +1
      ['2026-09-13', 'Forefeast',   'commemoration-title'], // Elevation eve
      ['2026-09-21', 'Leavetaking', 'commemoration-title'], // Elevation close
      ['2026-05-22', 'Afterfeast',  'paschal-offset'],      // Ascension +40
      ['2026-06-03', 'Afterfeast',  'paschal-offset'],      // Pentecost +52
    ];
    for (const [date, kind, source] of cases) {
      const r = await liturgy(date);
      assert.ok(r.json.feastWindow, `${date} should be inside a window`);
      assert.equal(r.json.feastWindow.kind, kind, date);
      assert.equal(r.json.feastWindow.source, source, date);
      assert.equal(r.json.feastOnly, false, `${date} is not the feast itself`);
    }
  });

  // INV-3 — the distinction the whole signal exists to preserve.
  it('INV-3 an Afterfeast is not necessarily a GREAT feast window', async () => {
    // 2026-08-30 is inside the Afterfeast of the Beheading of the Forerunner,
    // which is not one of the Twelve. Its kontakion is sung in an ordinary slot
    // and the Theotokion still closes — the evidence behind GREAT_FEAST_WINDOW
    // in menaion-principal.js. A consumer meaning "the feast displaces
    // everything" must be able to tell these apart.
    const lesser = await liturgy('2026-08-30');
    assert.equal(lesser.json.feastWindow.kind, 'Afterfeast');
    assert.equal(lesser.json.feastWindow.isGreatFeast, false,
      'the Beheading is not one of the Twelve');

    const great = await liturgy('2026-08-16');
    assert.equal(great.json.feastWindow.isGreatFeast, true,
      'the Dormition is');
  });

  // INV-4 — the window is found even when a saint outranks it.
  it('INV-4 finds the window when a saint is the principal', async () => {
    // 2026-08-09 is St Herman of Alaska inside the Transfiguration afterfeast.
    // The window is not the principal, so a check that only looked at the
    // principal commemoration would miss it — the defect recorded in
    // project_herman_alaska_audit_2026_08_07.
    const r = await liturgy('2026-08-09');
    assert.ok(r.json.feastWindow, 'the window must be found behind the saint');
    assert.equal(r.json.feastWindow.kind, 'Afterfeast');
    assert.equal(r.json.feastWindow.isPrincipal, false);
    assert.match(r.json.feastWindow.title, /Transfiguration/);
  });

  // INV-5 — an ordinary day is null, so the signal means something.
  it('INV-5 an ordinary day has no window', async () => {
    for (const date of ['2026-09-27', '2026-10-04', '2026-07-12']) {
      const r = await liturgy(date);
      assert.equal(r.json.feastWindow, null, `${date} should be ordinary`);
      assert.equal(r.json.feastOnly, false, date);
    }
  });

  // INV-6 — the composed rule the parish rubric will actually use.
  it('INV-6 (feastOnly || feastWindow) covers feast AND afterfeast', async () => {
    const inside = ['2026-08-15', '2026-08-16', '2026-08-30', '2026-09-14',
                    '2026-09-21', '2026-05-21', '2026-05-22'];
    const outside = ['2026-09-27', '2026-10-04'];
    for (const date of inside) {
      const r = await liturgy(date);
      assert.ok(r.json.feastOnly || r.json.feastWindow,
        `${date}: the rule must fire`);
    }
    for (const date of outside) {
      const r = await liturgy(date);
      assert.ok(!r.json.feastOnly && !r.json.feastWindow,
        `${date}: the rule must not fire`);
    }
  });
});
