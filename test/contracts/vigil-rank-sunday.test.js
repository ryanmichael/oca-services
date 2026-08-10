/**
 * Feature contract: a vigil-rank saint on a Sunday shares the day with the
 * Resurrection
 *
 * The vigil generator (calendar/generators/great-feast.js) ships `slots: []`
 * with no Octoechos slot, because on a weekday there is no resurrectional set
 * to interleave. It was dispatched on rank alone, ahead of the Sunday branch —
 * so on a Sunday it erased the Resurrection outright. 2026-11-08 (Synaxis of
 * the Archangels) and 2026-12-06 (St Nicholas) each rendered nine Lord-I-Call
 * hymns, every one the saint's, and no resurrectional stichera whatever.
 *
 * Three OCA order documents, three saints, three years, one shape:
 *   reference/orders/2025-0629  Peter and Paul  4 Resurrection + 6 Apostles
 *   reference/orders/2022-1009  St Tikhon       4 Resurrection + 6 St Tikhon
 *   reference/orders/2023-1001  the Protection  4 Resurrection + 6 Protection
 * each with "Glory… <saint>" and "Now and ever… Dogmatic Theotokion".
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3100;
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
    try { await get('/'); return; } catch (_) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`Server did not start within ${maxMs}ms`);
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  await waitForServer();
});

after(() => { if (serverProcess) serverProcess.kill(); });

// Great Vespers is served on the EVE, so these are the Saturdays before
// 2026-11-08 (Archangels) and 2026-12-06 (St Nicholas).
const EVES = [
  { eve: '2026-11-07', sunday: '2026-11-08', saint: /Archangel/ },
  { eve: '2026-12-05', sunday: '2026-12-06', saint: /Nicholas/ },
];

const licHymns = (blocks) => blocks.filter(
  b => /Lord, I Have Cried/i.test(b.section || '') && b.type === 'hymn');

describe('Feature contract: vigil-rank saint on a Sunday', () => {

  it('INV-1: the day is still ranked vigil — this is not a rank change', () => {
    const { getFeastRank } = require('../../calendar/fixed-feasts');
    for (const { sunday } of EVES) {
      assert.equal(getFeastRank(new Date(`${sunday}T12:00:00Z`)), 'vigil', sunday);
    }
  });

  it('INV-2: Great Vespers is the Sunday service, not the weekday vigil', async () => {
    for (const { eve } of EVES) {
      const { json } = await get(`/api/service?date=${eve}&format=json`);
      assert.notEqual(json.serviceType, 'all-night-vigil',
        `${eve}: the vigil generator has no Octoechos slot and erases the Resurrection`);
    }
  });

  it('INV-3: 4 resurrectional + 6 of the saint, per three OCA orders', async () => {
    for (const { eve, saint } of EVES) {
      const { json } = await get(`/api/service?date=${eve}&format=json`);
      const hymns = licHymns(json.blocks);
      const res = hymns.filter(h => /Resurrectional/i.test(h.label || ''));
      assert.equal(res.length, 4, `${eve}: expected 4 resurrectional stichera`);
      // 6 numbered of the saint, plus the Glory doxastikon and the Dogmatikon.
      assert.equal(hymns.length - res.length, 8,
        `${eve}: expected 6 numbered saint stichera + Glory + Now-and-ever`);
      assert.ok(hymns.some(h => saint.test(h.label || '')),
        `${eve}: the saint's own stichera are missing`);
    }
  });

  it('INV-4: the Resurrection is never absent from a Sunday Great Vespers', async () => {
    // The regression itself, stated as plainly as it can be. A Sunday with zero
    // resurrectional stichera is wrong whatever the saint's rank.
    for (const { eve } of EVES) {
      const { json } = await get(`/api/service?date=${eve}&format=json`);
      const res = licHymns(json.blocks).filter(h => /Resurrectional/i.test(h.label || ''));
      assert.ok(res.length > 0, `${eve}: NO resurrectional stichera on a Sunday`);
    }
  });

  it('INV-5: "Now and ever…" is the Dogmatikon of the week\'s tone', async () => {
    for (const { eve } of EVES) {
      const { json } = await get(`/api/service?date=${eve}&format=json`);
      const last = licHymns(json.blocks).at(-1);
      assert.match(last.label || '', /Dogmatikon/, eve);
    }
  });

  it('INV-6: a vigil-rank saint on a WEEKDAY still gets the All-Night Vigil', async () => {
    // The fix must be confined to Sundays. 2026-12-06 is St Nicholas on a
    // Sunday; 2026-10-01 (Protection) is a Thursday and must be untouched.
    const { json } = await get('/api/service?date=2026-09-30&format=json');
    assert.equal(json.serviceType, 'all-night-vigil',
      'a weekday vigil-rank saint lost his Vigil — the fix has leaked');
  });
});
