/**
 * Feature contract: Beatitudes troparia on the Fathers Sundays
 * Spec: features/beatitudes-fathers-canon.md
 *
 * The three Fathers Sundays appoint DIFFERENT canons, and one detector used to
 * serve two of them — so the Seventh Council Liturgy on 2026-10-11 read the
 * July Six-Councils troparia aloud. A reader at St John Tyler caught it mid
 * service: the first six (Resurrection) were right, the last four were not.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('path');
const { spawn } = require('node:child_process');

const PORT = 3116; // distinct: 3115 was the last taken
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    }).on('error', reject);
  });
}
async function waitForServer(maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try { const r = await get('/api/days?from=2026-10-11&to=2026-10-11'); if (r.status === 200) return; } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('server did not start');
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

const TYLER = '&parish=st-john-damascus-tyler&translation=st-john-damascus-tyler';

async function beatitudeTroparia(date) {
  const r = await get(`/api/liturgy?date=${date}&pronoun=tt${TYLER}`);
  assert.equal(r.status, 200, `${date} status`);
  return (r.json.blocks || []).filter(
    b => b.section === 'Third Antiphon' && b.type === 'hymn');
}

describe('Beatitudes troparia on the Fathers Sundays', () => {
  it('INV-1: the Six Councils Sunday gets its Tone 6 canon, 6 Resurrection + 4 Fathers', async () => {
    const t = await beatitudeTroparia('2026-07-19');
    const feast = t.filter(x => x.source === 'feast');
    const oct   = t.filter(x => x.source === 'octoechos');
    assert.equal(oct.length, 6, 'six resurrectional troparia');
    assert.equal(feast.length, 4, 'four from Ode 3 of the 1st Canon');
    assert.ok(feast.every(x => x.tone === 6), 'the Six Councils canon is Tone 6');
    assert.equal(t.length, 10, 'on 10');
  });

  it('INV-2: the Seventh Council Sunday does NOT borrow the Six Councils troparia', async () => {
    // Printing July's hymns in October is the defect this guards. We do not
    // hold the Seventh Council's own Tone 8 canon, so the Octoechos Beatitudes
    // stand alone — a missing commemoration beats four wrong hymns read aloud.
    const t = await beatitudeTroparia('2026-10-11');
    assert.ok(t.every(x => x.source === 'octoechos'),
      'no feast canon may be borrowed on the Seventh Council Sunday');
    const text = t.map(x => x.text || '').join(' ');
    assert.ok(!/mindless Arius/i.test(text), 'the July canon must not appear');
    assert.ok(!/seven sacred councils/i.test(text), 'the July canon must not appear');
    assert.ok(!/multifarious murrain/i.test(text), 'the July canon must not appear');
  });

  it('INV-3: an ordinary Sunday is unaffected — Octoechos Beatitudes only', async () => {
    const t = await beatitudeTroparia('2026-10-18');
    assert.ok(t.length >= 8, 'the resurrectional set is present');
    assert.ok(t.every(x => x.source === 'octoechos'));
  });
});
