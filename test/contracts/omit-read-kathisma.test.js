/**
 * Feature contract: a parish may omit the read Kathisma at Vespers
 *
 * Spec: features/omit-read-kathisma.md. Rubric `vespers.omitReadKathisma`
 * (registry id omitReadKathisma, boolean, default false). Tyler does not read
 * the Kathisma (2026-09-30); "mostly everywhere" — the sung "Blessed is the
 * Man" on Saturday evening stays.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3112; // distinct: see sibling contract tests for the port ledger
const TYLER = '&translation=st-john-damascus-tyler';
const REGISTRY = require(path.join(ROOT, 'data', 'rubric-registry.json'));
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
  await waitForServer();
});
after(() => { if (serverProcess) serverProcess.kill(); });

const blocks = async (u) => (await get(u)).json.blocks;
// Read-kathisma blocks are `k<N>-…` (Vigil prefixes them `gv-`).
const isReadKathisma = (b) => /^(gv-)?k\d+-/.test(b.id);
// The section that follows Vespers' Great Litany — asserts POSITION, not
// presence. The FIRST Peace Litany: a Vigil carries Matins' one later.
function afterGreatLitany(bs) {
  let i = bs.findIndex(b => b.section === 'The Peace Litany');
  while (bs[i]?.section === 'The Peace Litany') i++;
  return bs[i]?.section;
}

describe('Feature contract: omit the read Kathisma at Vespers', () => {
  it('INV-1: registry — boolean, default off, no typed column (so parish-admin renders a toggle)', () => {
    const r = REGISTRY.rubrics.omitReadKathisma;
    assert.equal(r.type, 'boolean');
    assert.equal(r.default, false);
    assert.equal(r.namespace, 'vespers.omitReadKathisma');
    assert.ok(!r.dbColumn);
    assert.ok(r.appliesTo.includes('vespers'));
  });

  it('INV-2: default parish still reads the Kathisma, then the Little Litany (Wed 9-23 Daily Vespers)', async () => {
    const bs = await blocks('/api/service?date=2026-09-23');
    assert.ok(bs.some(isReadKathisma), 'default reads the Kathisma');
    assert.equal(afterGreatLitany(bs), 'Kathisma');
  });

  it('INV-3: Tyler Daily Vespers goes from the Great Litany straight to Lord, I Call', async () => {
    const bs = await blocks(`/api/service?date=2026-09-23${TYLER}`);
    assert.ok(!bs.some(isReadKathisma), 'no read Kathisma');
    assert.ok(!bs.some(b => b.section === 'Little Litany'), 'no Little Litany');
    assert.equal(afterGreatLitany(bs), 'Lord, I Have Cried');
  });

  it('INV-4: Tyler weekday Vigil omits it too (9-07 eve, Nativity of the Theotokos)', async () => {
    const dflt = await blocks('/api/vigil?date=2026-09-07');
    assert.ok(dflt.some(isReadKathisma), 'default Vigil reads the weekday Kathisma');
    const bs = await blocks(`/api/vigil?date=2026-09-07${TYLER}`);
    assert.ok(!bs.some(isReadKathisma), 'Tyler Vigil: no read Kathisma');
    assert.equal(afterGreatLitany(bs), 'Lord, I Have Cried');
  });

  it('INV-5: Tyler keeps the sung "Blessed is the Man" and its Little Litany on Saturday evening', async () => {
    const bs = await blocks(`/api/service?date=2026-10-03${TYLER}`);
    assert.equal(afterGreatLitany(bs), 'Kathisma');
    assert.ok(bs.some(b => b.id === 'kathisma-heading'), '"Blessed is the Man" rendered');
    const kEnd = bs.map(b => b.section).lastIndexOf('Kathisma');
    assert.equal(bs[kEnd + 1]?.section, 'Little Litany');
  });
});
