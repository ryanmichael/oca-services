/**
 * Feature contract: where the saint's doxastikon is sung
 *
 * The same hymn belongs in two different places depending on the SERVICE, not
 * the date:
 *
 *   simple rank, not a Sunday  → Aposticha Glory (no sung Lauds exist)
 *   Sunday / sung-Lauds ranks  → Lauds Glory
 *
 * A fixed-date menaion file cannot encode that, because the date falls on a
 * different weekday each year. Some files author the hymn under
 * `matins.aposticha.doxastikon` (01-31, the worked example from 4c36ee3) and
 * some under `matins.lauds.doxastikon` (01-18, 05-24, 06-28, 09-05). Neither is
 * wrong; matins-spec.js reads whichever is present and routes by service shape.
 *
 * Before that, the four `lauds`-keyed files rendered the doxastikon as a lone
 * hymn inside a Lauds section a simple-rank service does not have — which is
 * what M19-matins-lauds-shape was reporting on 2026-09-05, the only `high` in
 * the year sweep.
 *
 * INV-3 exists because the first attempt fixed this in the DATA (moving the key
 * to `aposticha`) and silently dropped the hymn on 01-18, 05-24 and 06-28 — all
 * Sundays in 2026, all of which legitimately sing it at Lauds. Caught only by
 * checking the render before and after.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3106; // distinct: see sibling contract tests for the port ledger
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

const doxastikonText = (menaionFile) => {
  const d = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'variable-sources', 'menaion', `${menaionFile}.json`), 'utf8'));
  const dox = d.matins.aposticha?.doxastikon || d.matins.lauds?.doxastikon;
  assert.ok(dox?.text, `${menaionFile}: no saint doxastikon authored under aposticha or lauds`);
  return dox.text.replace(/\s+/g, ' ').trim();
};

const sections = (blocks, name) => blocks.filter(b => b.section === name);
const flat = (blocks) => blocks.map(b => (b.text || '').replace(/\s+/g, ' ')).join(' ');

// 2026-09-05 and 2026-01-31 are Saturdays; 01-18, 05-24, 06-28 are Sundays.
const SIMPLE_RANK_SATURDAYS = [['2026-09-05', 'september-05'], ['2026-01-31', 'january-31']];
const SUNDAYS               = [['2026-01-18', 'january-18'],
                               ['2026-05-24', 'may-24'],
                               ['2026-06-28', 'june-28']];

describe('saint doxastikon placement by service shape', () => {
  it('INV-1: simple-rank, non-Sunday Matins renders NO Lauds section', async () => {
    for (const [date] of SIMPLE_RANK_SATURDAYS) {
      const { json } = await get(`/api/matins?date=${date}`);
      assert.equal(sections(json.blocks, 'Lauds').length, 0,
        `${date}: a simple-rank service has no sung Lauds, so the section must be empty`);
    }
  });

  it('INV-2: on those days the doxastikon is sung at the Aposticha Glory', async () => {
    for (const [date, file] of SIMPLE_RANK_SATURDAYS) {
      const { json } = await get(`/api/matins?date=${date}`);
      const apost = sections(json.blocks, 'Aposticha');
      assert.ok(apost.length, `${date}: expected an Aposticha section`);
      assert.ok(flat(apost).includes(doxastikonText(file).slice(0, 60)),
        `${date}: the saint's doxastikon must be sung at the Aposticha Glory`);
    }
  });

  it('INV-3: on a Sunday the doxastikon is NOT dropped', async () => {
    // The regression this guards: relocating the hymn in the data removed it
    // from these three dates entirely.
    for (const [date, file] of SUNDAYS) {
      const { json } = await get(`/api/matins?date=${date}`);
      assert.ok(flat(json.blocks).includes(doxastikonText(file).slice(0, 60)),
        `${date}: the saint's doxastikon must still be sung (Sunday keeps sung Lauds)`);
    }
  });

  it('INV-4: the hymn is sung once, never in both places', async () => {
    for (const [date, file] of [...SIMPLE_RANK_SATURDAYS, ...SUNDAYS]) {
      const { json } = await get(`/api/matins?date=${date}`);
      const needle = doxastikonText(file).slice(0, 60);
      const hits = json.blocks.filter(b =>
        (b.text || '').replace(/\s+/g, ' ').includes(needle)).length;
      assert.equal(hits, 1, `${date}: doxastikon appears ${hits} times, expected exactly 1`);
    }
  });
});
