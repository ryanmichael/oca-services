/**
 * Feature contract: a parish's named Menaion service set
 *
 * Tyler serves the Protection (10-1) as Daily Vespers with the Raphaela
 * Menaion's propers (10.01.26 packet), while the OCA default stays the Vigil.
 * The parish opts in through rubrics_extra_json
 * {"menaionServiceSet": {"10-1": "raphaela-protection-daily"}}; the set lives in
 * variable-sources/menaion-service-sets.json. Added 2026-09-24.
 *
 * INV-6 is the other half of the same round's choir correction: Tyler sings
 * Steadfast Protectress "for thou always protect" (variant
 * steadfast-protectress-as-sung).
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3111; // distinct: see sibling contract tests for the port ledger
const TYLER = '&translation=st-john-damascus-tyler';
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

const tylerVespers = async () => (await get(`/api/service?date=2026-09-30${TYLER}`)).json;
const sec = (blocks, name) => blocks.filter(b => b.section === name);

describe('Feature contract: parish Menaion service set (Tyler, 10-1 Protection)', () => {
  it('INV-1: Tyler 9-30 eve is Daily Vespers — no Entrance, Litya, readings or vigil blessing', async () => {
    const d = await tylerVespers();
    assert.equal(d.serviceType, 'dailyVespers');
    const sections = new Set(d.blocks.map(b => b.section));
    for (const s of ['The Entrance', 'The Litya', 'Blessing of Bread']) assert.ok(!sections.has(s), s);
    assert.ok(!d.blocks.some(b => /^ot-|^vigil-/.test(b.id)), 'no paremias or vigil blocks');
  });

  it('INV-2: Lord-I-Call is 3 Octoechos then 3 Protection Tone 4, then one Glory/Now of the Protection', async () => {
    const lic = sec((await tylerVespers()).blocks, 'Lord, I Have Cried');
    const nums = lic.filter(b => /^lic-hymn-v\d+$/.test(b.id));
    assert.deepEqual(nums.map(b => b.source), ['octoechos', 'octoechos', 'octoechos', 'menaion', 'menaion', 'menaion']);
    assert.deepEqual(nums.slice(3).map(b => b.tone), [4, 4, 4]);
    assert.match(nums[5].text, /^Thou art the beauty of Jacob/);
    const gn = lic.findIndex(b => b.id === 'lic-glory-now-label');
    assert.ok(gn >= 0, 'combined Glory… now and ever');
    assert.equal(lic[gn + 1].tone, 8);
    assert.match(lic[gn + 1].text, /^Today the Powers of Heaven rejoice/);
  });

  it('INV-3: Aposticha is the feast\'s (2/5/7 with Ps 44 verses), Glory Romanus, Now Protection Tone 2', async () => {
    const ap = sec((await tylerVespers()).blocks, 'Aposticha').filter(b => b.type !== 'rubric');
    const seq = ap.filter(b => b.type === 'hymn' || b.type === 'verse');
    assert.deepEqual(seq.slice(0, 5).map(b => b.type), ['hymn', 'verse', 'hymn', 'verse', 'hymn']);
    assert.deepEqual([seq[0].tone, seq[2].tone, seq[4].tone], [2, 5, 7]);
    assert.match(seq[1].text, /Hearken, O daughter/);
    const g = ap.findIndex(b => b.id === 'apost-glory-label');
    const n = ap.findIndex(b => b.id === 'apost-now-label');
    assert.match(ap[g + 1].text, /^O Romanus, our father/);
    assert.match(ap[n + 1].text, /^The Church of God is adorned/);
  });

  it('INV-4: Troparia are Romanus, then "Glory… now and ever" Protection', async () => {
    const tr = sec((await tylerVespers()).blocks, 'Troparia');
    const hymns = tr.filter(b => b.type === 'hymn');
    assert.equal(hymns.length, 2);
    assert.match(hymns[0].text, /gladden Christ.s Church/);
    const lbl = tr.findIndex(b => b.id === 'trop-now-label');
    assert.match(tr[lbl].text, /Glory to the Father.*now and ever/is);
    assert.match(tr[lbl + 1].text, /^Today the faithful celebrate/);
  });

  it('INV-5: the OCA default parish still serves the Protection as a Vigil', async () => {
    const d = (await get('/api/service?date=2026-09-30')).json;
    assert.notEqual(d.serviceType, 'dailyVespers');
    assert.ok(d.blocks.some(b => b.section === 'The Litya'), 'default keeps the Litya');
  });

  it('INV-6: Tyler sings Steadfast Protectress "for thou always protect those who honor thee"', async () => {
    const d = (await get(`/api/liturgy?date=2026-09-27${TYLER}`)).json;
    const k = d.blocks.find(b => /Steadfast Protectress of Christians/.test(b.text || ''));
    assert.ok(k, 'Steadfast Protectress rendered');
    assert.match(k.text, /for thou always protect those who honor thee!$/);
  });
});
