/**
 * Feature contract: 10-1 Protection of the Theotokos — Vespers propers
 *
 * Source: OCA service text for October 1 (reference/scrape/2024-10-01.docx);
 * the Tyler 10.01.26 Daily Vespers packet sings the same Aposticha.
 *
 * Found 2026-09-24. The scrape had glued four troparia/kontakia into the
 * Aposticha, so the Vigil sang Romanus's troparion and the Protection troparion
 * as "stichera" 2 and 3, with Ps. 122 verses, an Octoechos Tone 6 Theotokion,
 * and a Lord-I-Call "Glory… now and ever" collapsed onto Romanus — the
 * Protection's own Tone 8 Now sat in the DB as numbered sticheron 9.
 *
 * Assert POSITION, not presence: each hymn must follow the right label/verse.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3110; // distinct: see sibling contract tests for the port ledger
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

// The Vespers of 10-1 is sung on the civil evening of 9-30.
const vespers = async () => (await get('/api/service?date=2026-09-30')).json.blocks;
const sec = (blocks, name) => blocks.filter(b => b.section === name);

describe('Feature contract: 10-1 Protection Vespers propers (OCA)', () => {
  it('INV-1: Aposticha is Tone 2, V. Ps 44:9a, Tone 5, V. Ps 44:11b, Tone 7 — no troparion among them', async () => {
    const ap = sec(await vespers(), 'Aposticha');
    const seq = ap.filter(b => b.type === 'hymn' || b.type === 'verse').slice(0, 5);
    assert.deepEqual(seq.map(b => b.type), ['hymn', 'verse', 'hymn', 'verse', 'hymn']);
    assert.deepEqual([seq[0].tone, seq[2].tone, seq[4].tone], [2, 5, 7]);
    assert.match(seq[0].text, /^Since thou art higher/);
    assert.match(seq[1].text, /Hearken, O daughter/);
    assert.match(seq[2].text, /^O people, let us joyfully sing a song of David/);
    assert.match(seq[3].text, /Even the rich among the people/);
    assert.match(seq[4].text, /^Thou art a mountain greater/);
    assert.ok(!ap.some(b => /gladden Christ.s Church|Today the faithful celebrate/.test(b.text || '')),
      'no troparion is sung as an Aposticha sticheron');
  });

  it('INV-2: Aposticha Glory is Romanus (Tone 6), Now is the Protection Theotokion (Tone 2)', async () => {
    const ap = sec(await vespers(), 'Aposticha');
    const g = ap.findIndex(b => b.id === 'apost-glory-label');
    const n = ap.findIndex(b => b.id === 'apost-now-label');
    assert.ok(g >= 0 && n > g, 'separate Glory then Now');
    assert.match(ap[g + 1].text, /^O Romanus, our father/);
    assert.equal(ap[n + 1].tone, 2);
    assert.match(ap[n + 1].text, /^The Church of God is adorned/);
  });

  it('INV-3: Lord-I-Call Glory is Romanus (Tone 6), Now is the Protection (Tone 8), not collapsed', async () => {
    const lic = sec(await vespers(), 'Lord, I Have Cried');
    assert.ok(!lic.some(b => b.id === 'lic-glory-now-label'), 'Glory and Now are separate');
    const g = lic.findIndex(b => b.id === 'lic-glory-label');
    const n = lic.findIndex(b => b.id === 'lic-now-label');
    assert.ok(g >= 0 && n === g + 2, 'Glory hymn sits between the two labels');
    assert.match(lic[g + 1].text, /^O Romanus, our father/);
    assert.equal(lic[n + 1].tone, 8);
    assert.match(lic[n + 1].text, /^Today the Powers of Heaven rejoice/);
  });

  it('INV-4: the Protection troparion is the OCA text', async () => {
    const tr = sec(await vespers(), 'Troparia').filter(b => b.type === 'hymn');
    assert.ok(tr.length > 0);
    assert.ok(tr.every(b => /^Today the faithful celebrate the feast with joy/.test(b.text)
      || /gladden Christ.s Church/.test(b.text)), tr.map(b => b.text.slice(0, 40)).join(' | '));
  });
});
