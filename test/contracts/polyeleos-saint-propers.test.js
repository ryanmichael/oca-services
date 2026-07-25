/**
 * Feature contract: Polyeleos+ saint secondary propers
 * Spec: features/polyeleos-saint-propers.md
 *
 * One test per INV-* invariant. If you change polyeleos detection, the
 * general-menaion-propers data, or how `.secondary` is attached / rendered,
 * update both the feature file and these tests in the same commit.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3095; // distinct from vespers (3094), sunday-kontakia (3096), confess (3097), patron (3098), smoke (3099), dev (3000)
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
  serverProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    if (msg.includes('Error') && !msg.includes('EADDRINUSE')) {
      console.error('[server stderr]', msg);
    }
  });
  await waitForServer();
});

after(() => { if (serverProcess) serverProcess.kill(); });

function blockById(blocks, id) {
  return blocks.find(b => b.id === id);
}

describe('Feature contract: Polyeleos+ saint secondary propers', () => {

  it('INV-1: polyeleos Sunday — monastic principal — secondary prokeimenon is Tone 7 venerable refrain', async () => {
    // 2026-07-05 — Uncovering of Relics of Sergius of Radonezh (polyeleos),
    // a Sunday in ordinary time. Monastic category.
    const { json } = await get('/api/liturgy?date=2026-07-05');
    const refrain = blockById(json.blocks, 'prok-2-refrain');
    const rubric  = blockById(json.blocks, 'prok-2-rubric');

    assert.ok(refrain, 'expected prok-2-refrain block on polyeleos Sunday');
    assert.match(refrain.text, /Precious in the sight of the Lord is the death of His saints/,
      `unexpected prok-2-refrain: ${refrain.text}`);
    assert.ok(rubric && /Tone 7/.test(rubric.text), `expected Tone 7 in prok-2 rubric; got: ${rubric?.text}`);
  });

  it('INV-2: polyeleos Sunday — monastic principal — secondary alleluia is Tone 6 venerable verse', async () => {
    const { json } = await get('/api/liturgy?date=2026-07-05');
    const v0     = blockById(json.blocks, 'all-2-v0');
    const rubric = blockById(json.blocks, 'all-2-rubric');

    assert.ok(v0, 'expected all-2-v0 block on polyeleos Sunday');
    assert.match(v0.text, /Blessed is the man that feareth the Lord/,
      `unexpected all-2-v0: ${v0.text}`);
    assert.ok(rubric && /Tone 6/.test(rubric.text), `expected Tone 6 in all-2 rubric; got: ${rubric?.text}`);
  });

  it('INV-3: polyeleos Sunday — monastic principal — secondary koinonikon is the venerable text', async () => {
    const { json } = await get('/api/liturgy?date=2026-07-05');
    const ch2 = blockById(json.blocks, 'ch-2-text');

    assert.ok(ch2, 'expected ch-2-text block on polyeleos Sunday');
    assert.match(ch2.text, /The righteous shall be in everlasting remembrance/,
      `unexpected ch-2-text: ${ch2.text}`);
  });

  it('INV-4: simple-rank Sunday — no polyeleos+ rank — no secondary blocks render', async () => {
    // 2026-06-21 — Martyr Julian of Tarsus, ordinary Sunday, NOT polyeleos.
    const { json } = await get('/api/liturgy?date=2026-06-21');
    const prok2 = blockById(json.blocks, 'prok-2-refrain');
    const all2  = blockById(json.blocks, 'all-2-v0');
    const ch2   = blockById(json.blocks, 'ch-2-text');

    assert.equal(prok2, undefined, 'prok-2 must not leak to simple-rank Sundays');
    assert.equal(all2,  undefined, 'all-2 must not leak to simple-rank Sundays');
    assert.equal(ch2,   undefined, 'ch-2 must not leak to simple-rank Sundays');
  });

  it('INV-6: righteous polyeleos Sunday (St. Jacob Netsvetov, 7-26) renders the full secondary set', async () => {
    // Regression guard (surfaced 2026-07-25): St. Jacob was absent from
    // POLYELEOS_SAINTS and had no saint_type, so the Liturgy dropped his
    // prokeimenon / alleluia / koinonikon entirely — only the Sunday-cycle
    // propers rendered. Fixed by adding 7-26 to POLYELEOS_SAINTS, the
    // 'righteous' General-Menaion category, and saint_type='righteous'.
    const { json } = await get('/api/liturgy?date=2026-07-26');
    const refrain = blockById(json.blocks, 'prok-2-refrain');
    const v0      = blockById(json.blocks, 'all-2-v0');
    const ch2     = blockById(json.blocks, 'ch-2-text');

    assert.ok(refrain, 'expected prok-2-refrain on St. Jacob polyeleos Sunday');
    assert.match(refrain.text, /The righteous shall rejoice in the Lord, and shall hope in Him/,
      `unexpected prok-2-refrain: ${refrain?.text}`);
    assert.ok(v0, 'expected all-2-v0 on St. Jacob polyeleos Sunday');
    assert.match(v0.text, /Blessed is the man that feareth the Lord/,
      `unexpected all-2-v0: ${v0?.text}`);
    assert.ok(ch2, 'expected ch-2-text on St. Jacob polyeleos Sunday');
    assert.match(ch2.text, /The righteous shall be in everlasting remembrance/,
      `unexpected ch-2-text: ${ch2?.text}`);
  });

  it('INV-5: Great Feast Sunday — polyeleos guard skipped — no polyeleos-path secondary', async () => {
    // 2026-04-12 — Pascha (greatFeast). The `!feast && !pentOverride` guard
    // suppresses the polyeleos-path secondary. (Cocelebrated overlays may still
    // populate secondary on great feasts; that's a separate path.)
    const { json } = await get('/api/liturgy?date=2026-04-12');
    const prok2 = blockById(json.blocks, 'prok-2-refrain');

    // Pascha has no cocelebrated overlay, so prok-2 must be entirely absent.
    assert.equal(prok2, undefined, 'prok-2 must not render on Pascha (polyeleos path gated by !feast)');
  });
});
