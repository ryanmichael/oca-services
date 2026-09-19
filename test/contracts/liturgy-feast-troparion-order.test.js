/**
 * Feature contract: where the feast troparion sits in the Liturgy troparia
 *
 * Measured across every OCA order in reference/orders/ (2022-2026) that prints
 * a feast troparion in the "Troparia and Kontakia" block — 35 of 36 read:
 *
 *     Resurrection > Feast > Church (if of Patron Saint) > Saint(s)
 *
 * The assembler previously generalised from the ONE order that does not
 * (2026-08-16, where the Image Not-Made-by-Hands leads and the Dormition window
 * follows), treating "the window is sung last" as the rule. That put the feast
 * last on every window Sunday: 2026-09-20 rendered
 * Resurrection > Patron > Eustathius > Cross where the order reads
 * Resurrection > Cross > Church > Eustathius. Found 2026-09-19 reviewing the
 * choir packet, whose sheets are stacked in the order's own sequence.
 *
 * Two narrowings, each forced by an order that contradicted a broader first
 * attempt — and each caught by an existing contract rather than by reasoning:
 *   INV-4  a LESSER window does not take second (2026-08-30's Beheading
 *          afterfeast; its order prints no feast troparion and puts the Church
 *          second). The first attempt broke lesser-feast-window INV-3.
 *   INV-3  named exceptions where a co-commemoration leads the window
 *          (08-16, 09-13). The first attempt broke 9-13 INV-5.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3107; // distinct: see sibling contract tests for the port ledger
const TYLER = 'st-john-damascus-tyler';
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, body: data, json });
      });
    }).on('error', reject);
  });
}

async function waitForServer(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try { await get('/'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error(`Server did not start within ${maxMs}ms`);
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  serverProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    if (msg.includes('Error') && !msg.includes('EADDRINUSE')) console.error('[server stderr]', msg);
  });
  await waitForServer();
});
after(() => { if (serverProcess) serverProcess.kill(); });

async function troparionRubrics(date, translation) {
  const q = translation ? `&translation=${translation}` : '';
  const { json } = await get(`/api/liturgy?date=${date}${q}`);
  assert.ok(json?.blocks, `no blocks for ${date}`);
  return json.blocks
    .filter(b => b.section === 'Troparia' && b.type === 'rubric')
    .map(b => b.text || '');
}

const idxOf = (rubrics, re) => rubrics.findIndex(r => re.test(r));

describe('Liturgy feast-troparion order', () => {
  // date → the Great Feast window expected immediately after the Resurrection
  const GREAT_WINDOW_SUNDAYS = [
    ['2026-09-20', /Elevation of the Cross/i],
    ['2026-08-09', /Transfiguration/i],
    ['2026-01-11', /Theophany/i],
    ['2026-02-08', /Meeting of our Lord/i],
    ['2026-08-23', /Dormition/i],
  ];

  it('INV-1: a Great Feast window sings immediately after the Resurrection', async () => {
    for (const [date, feastRe] of GREAT_WINDOW_SUNDAYS) {
      const r = await troparionRubrics(date);
      const res = idxOf(r, /Troparion of the Resurrection/i);
      const win = idxOf(r, feastRe);
      assert.ok(res >= 0 && win >= 0, `${date}: missing Resurrection or feast troparion`);
      assert.equal(win, res + 1,
        `${date}: feast must sit directly after the Resurrection; got [${r.join(' | ')}]`);
    }
  });

  it('INV-2: the Church/patron follows the feast, never precedes it', async () => {
    for (const [date, feastRe] of GREAT_WINDOW_SUNDAYS) {
      const r = await troparionRubrics(date, TYLER);
      const win = idxOf(r, feastRe);
      const patron = idxOf(r, /Patron of the Temple/i);
      if (patron < 0) continue;            // parish without a patron set
      assert.ok(win >= 0 && patron > win,
        `${date}: the orders read "Feast > Church (if of Patron Saint)"; got [${r.join(' | ')}]`);
    }
  });

  it('INV-3: a co-commemoration that leads the window keeps its place', async () => {
    // 2026-08-16 order: Resurrection / the Image / the Feast.
    const aug = await troparionRubrics('2026-08-16');
    assert.ok(idxOf(aug, /Image Not-Made-by-Hands/i) < idxOf(aug, /Dormition/i),
      `08-16: the Image leads the Dormition window; got [${aug.join(' | ')}]`);

    // 2026-09-13 order: Resurrection / the Founding / the Forefeast.
    const sep = await troparionRubrics('2026-09-13');
    assert.ok(idxOf(sep, /Founding/i) < idxOf(sep, /Forefeast/i),
      `09-13: the Founding leads the Forefeast; got [${sep.join(' | ')}]`);
  });

  it('INV-4: a LESSER window does not take second place', async () => {
    // 2026-08-30 order: Resurrection / the Church / the Forerunner / the Saints.
    // The Beheading's afterfeast is not a Great Feast window, and its order
    // prints no "Troparion of the Feast" at all.
    const r = await troparionRubrics('2026-08-30', TYLER);
    const res = idxOf(r, /Troparion of the Resurrection/i);
    const patron = idxOf(r, /Patron of the Temple/i);
    const window = idxOf(r, /Beheading/i);
    assert.equal(patron, res + 1,
      `08-30: the Church sings second on a lesser window; got [${r.join(' | ')}]`);
    assert.ok(window < 0 || window > patron,
      `08-30: the lesser window must not displace the Church; got [${r.join(' | ')}]`);
  });
});
