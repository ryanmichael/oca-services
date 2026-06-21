/**
 * Feature contract: beatitudesTropariaReaderLed (Third Antiphon speaker)
 * Spec: features/beatitudes-reader-led.md
 *
 * One test per INV-* invariant. If you change Third Antiphon speaker
 * attribution behavior, update both the feature file and these tests in the
 * same commit.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3096; // distinct from confess-first (3097), patron (3098), smoke (3099), dev (3000)
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

const TYLER = 'st-john-damascus-tyler';
// 2026-06-21 = 3rd Sunday after Pentecost, Tone 2, ordinary time.
// Tone-2 resurrectional canon supplies multiple interpolated Beatitudes
// troparia (Irmos + Troparia + Theotokion of Odes 3 and 6), giving us
// `hymn`-type blocks to assert on.
const DATE = '2026-06-21';

function thirdAntiphonBlocks(json) {
  return json.blocks.filter(b => b.section === 'Third Antiphon');
}

// ── Contract tests ────────────────────────────────────────────────────────

describe('Feature contract: beatitudesTropariaReaderLed', () => {

  it('INV-1: default (no overlay) — all Third Antiphon hymn blocks are speaker:choir', async () => {
    const { json } = await get(`/api/liturgy?date=${DATE}`);
    const blocks = thirdAntiphonBlocks(json);
    const hymns  = blocks.filter(b => b.type === 'hymn');
    assert.ok(hymns.length > 0, `expected at least one Third Antiphon hymn block on ${DATE}`);
    for (const b of hymns) {
      assert.equal(b.speaker, 'choir',
        `default: hymn block ${b.id} (label="${b.label}") expected speaker:choir, got speaker:${b.speaker}`);
    }
  });

  it('INV-2: Tyler overlay (flag=1) — all Third Antiphon hymn blocks are speaker:reader; verses still choir', async () => {
    const { json } = await get(`/api/liturgy?date=${DATE}&translation=${TYLER}`);
    const blocks = thirdAntiphonBlocks(json);
    const hymns  = blocks.filter(b => b.type === 'hymn');
    const verses = blocks.filter(b => b.type === 'verse');
    assert.ok(hymns.length > 0, `expected Third Antiphon hymn blocks under Tyler overlay`);
    assert.ok(verses.length > 0, `expected Third Antiphon verse blocks under Tyler overlay`);
    for (const b of hymns) {
      assert.equal(b.speaker, 'reader',
        `Tyler: hymn block ${b.id} (label="${b.label}") expected speaker:reader, got speaker:${b.speaker}`);
    }
    for (const b of verses) {
      assert.equal(b.speaker, 'choir',
        `Tyler: verse block ${b.id} must remain speaker:choir, got speaker:${b.speaker}`);
    }
  });

  it('INV-3: doxology lines (beat-glory, beat-now) keep speaker:null regardless of flag', async () => {
    for (const url of [
      `/api/liturgy?date=${DATE}`,
      `/api/liturgy?date=${DATE}&translation=${TYLER}`,
    ]) {
      const { json } = await get(url);
      const dox = thirdAntiphonBlocks(json).filter(b => b.type === 'doxology');
      assert.ok(dox.length >= 2, `expected at least 2 doxology lines at Third Antiphon (${url})`);
      for (const b of dox) {
        assert.equal(b.speaker, null,
          `doxology block ${b.id} must keep speaker:null (${url}); got speaker:${b.speaker}`);
      }
    }
  });
});
