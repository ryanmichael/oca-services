/**
 * Feature contract: Sunday Liturgy Kontakia Restructure
 * Spec: features/sunday-kontakia-restructure.md
 *
 * One test per INV-* invariant. If you change the Sunday-kontakia restructure
 * behavior, update both the feature file and these tests in the same commit.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const PORT = 3096; // distinct from confess (3097), patron (3098), smoke (3099), dev (3000)
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

// ── Helpers ───────────────────────────────────────────────────────────────

function kontakiaBlocks(json) {
  return json.blocks.filter(b => b.section === 'Kontakia');
}

function findIdx(blocks, re) {
  return blocks.findIndex(b => re.test(b.text || ''));
}

// ── Contract tests ────────────────────────────────────────────────────────

describe('Feature contract: Sunday Kontakia Restructure', () => {

  it('INV-1: Sunday — Resurrection kontakion is NOT in the Kontakia section (carried by Res troparion above)', async () => {
    // 2026-06-21 — ordinary-time Sunday, Ananias (simple-rank), no overlay.
    const { json } = await get('/api/liturgy?date=2026-06-21');
    const ks = kontakiaBlocks(json);

    const resKontakion = ks.find(b => /Kontakion of the Resurrection/i.test(b.text || ''));
    assert.equal(resKontakion, undefined,
      `Resurrection kontakion must not appear in Sunday Kontakia section; found: ${resKontakion?.text || ''}`);
  });

  it('INV-2: Sunday with saint kontakion and no patron — shape is Glory: <saint> / Now: Kontakion-Theotokion', async () => {
    // 2026-06-21 — Ananias, no overlay, so no patron.
    const { json } = await get('/api/liturgy?date=2026-06-21');
    const ks = kontakiaBlocks(json);

    const gloryIdx     = findIdx(ks, /^Glory to the Father/);
    const saintLabIdx  = findIdx(ks, /Kontakion of Venerable Ananias the Iconographer/);
    const nowIdx       = findIdx(ks, /^Now and ever/);
    const theoLabelIdx = findIdx(ks, /^Kontakion-Theotokion/);

    assert.ok(gloryIdx     >= 0, 'expected Glory connector');
    assert.ok(saintLabIdx  >  gloryIdx, `saint kontakion (${saintLabIdx}) must follow Glory (${gloryIdx})`);
    assert.ok(nowIdx       >  saintLabIdx, `Now (${nowIdx}) must follow saint kontakion (${saintLabIdx})`);
    assert.ok(theoLabelIdx >  nowIdx, `Kontakion-Theotokion (${theoLabelIdx}) must follow Now (${nowIdx})`);
  });

  it('INV-3: weekday Liturgy — Sunday restructure does not apply; no Kontakion-Theotokion', async () => {
    // 2026-06-22 — Monday, Hieromartyr Eusebius.
    const { json } = await get('/api/liturgy?date=2026-06-22');
    const ks = kontakiaBlocks(json);

    const theoBlock = ks.find(b => /Kontakion-Theotokion/i.test(b.text || ''));
    assert.equal(theoBlock, undefined,
      `Kontakion-Theotokion must not appear on weekday Liturgy; found: ${theoBlock?.text || ''}`);
  });

  it('INV-4: feastOnly Sunday (Great Feast) — restructure skipped; no Kontakion-Theotokion', async () => {
    // 2026-04-12 — Pascha. feastOnly: true; feast claims all hymn slots.
    const { json } = await get('/api/liturgy?date=2026-04-12');
    const ks = kontakiaBlocks(json);

    const theoBlock = ks.find(b => /Kontakion-Theotokion/i.test(b.text || ''));
    assert.equal(theoBlock, undefined,
      `Kontakion-Theotokion must not appear on a feastOnly day; found: ${theoBlock?.text || ''}`);
  });

  it('INV-5: Now-slot Kontakion-Theotokion text matches the fixed-text source (no silent text drift)', async () => {
    const { json } = await get('/api/liturgy?date=2026-06-21');
    const ks = kontakiaBlocks(json);

    // The block whose tone is set and which renders the body text — find it by
    // matching the Romanos opening phrase, then confirm against the fixed-text.
    const theoBodyBlock = ks.find(b =>
      b.type === 'hymn' && /Protection of Christians/.test(b.text || ''));
    assert.ok(theoBodyBlock, `expected a hymn block with "Protection of Christians..."; got: ${ks.map(b=>b.text?.slice(0,60)).join(' | ')}`);

    const fixed = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', '..', 'fixed-texts', 'liturgy-fixed.json'), 'utf8'));
    const expectedText = fixed['kontakion-theotokion']?.text;
    assert.ok(expectedText, 'fixed-texts/liturgy-fixed.json#kontakion-theotokion.text must exist');
    assert.equal(theoBodyBlock.text, expectedText,
      'Rendered Kontakion-Theotokion text must match fixed-text source verbatim');
  });
});
