/**
 * Feature contract: a six-stichera saint's Aposticha takes no generic Glory
 *
 * Spec: features/six-stichera-no-generic-aposticha.md
 *
 * The General-Menaion Aposticha fallback fired whenever the principal had no
 * Aposticha rows — including saints with a full proper service whose Menaion
 * simply prints none. 9-27 sang a template "O come all ye lovers of the
 * Martyrs… Callistratus" where the OCA order has the Resurrectional Aposticha
 * Theotokion. Found 2026-09-24 against the Tyler 09.26.26 packet.
 *
 * INV-3 guards the other direction: a polyeleos saint's service really has an
 * Aposticha Glory, so the stand-in must survive there until the text is in.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3109; // distinct: see sibling contract tests for the port ledger
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

const section = (blocks, name) => blocks.filter(b => (b.section || '') === name);
const hymns   = (blocks) => blocks.filter(b => b.type === 'hymn');

describe('Feature contract: six-stichera saint — no generic Aposticha Glory', () => {
  it('INV-1: 9-26 eve Aposticha is all Octoechos and ends with the Tone 8 Glory/Now Theotokion', async () => {
    const { json } = await get('/api/service?date=2026-09-26');
    const ap = section(json.blocks, 'Aposticha');
    const apHymns = hymns(ap);
    assert.ok(apHymns.length >= 4, 'Aposticha rendered');
    assert.deepEqual(apHymns.filter(b => b.source === 'menaion').map(b => b.text.slice(0, 40)), [],
      'no Menaion (General-Menaion template) hymn in the 9-27 Aposticha');
    // Position, not label: the LAST hymn is the Theotokion, directly under a combined Glory/Now.
    const last = ap[ap.length - 1];
    const beforeLast = ap[ap.length - 2];
    assert.equal(last.type, 'hymn');
    assert.equal(last.tone, 8);
    assert.match(last.text, /unwedded Virgin/);
    assert.equal(beforeLast.type, 'doxology');
    assert.match(beforeLast.text, /Glory to the Father.*now and ever/is);
  });

  it('INV-2: 9-26 eve Lord-I-Call is 7 Resurrection + 3 Callistratus, in that order', async () => {
    const { json } = await get('/api/service?date=2026-09-26');
    const numbered = hymns(section(json.blocks, 'Lord, I Have Cried'))
      .filter(b => /^lic-hymn-v\d+$/.test(b.id));
    assert.deepEqual(numbered.map(b => b.source),
      [...Array(7).fill('octoechos'), ...Array(3).fill('menaion')]);
    assert.ok(numbered.slice(7).every(b => !/In their sufferings/.test(b.text)),
      'the Octoechos martyrikon is not sung as a Callistratus sticheron');
  });

  it('INV-3: 1-10 eve (Theodosius, polyeleos) still sings an Aposticha Glory', async () => {
    const { json } = await get('/api/service?date=2026-01-10');
    const ap = section(json.blocks, 'Aposticha');
    const gloryIdx = ap.findIndex(b => b.type === 'doxology' && /^Glory to the Father/i.test(b.text)
      && !/now and ever/i.test(b.text));
    assert.ok(gloryIdx >= 0, 'a separate Glory is present');
    assert.equal(ap[gloryIdx + 1]?.source, 'menaion', 'the saint\'s Glory follows it');
  });
});
