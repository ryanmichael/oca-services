/**
 * Feature contract: confessFirst (Communion Prayer order)
 * Spec: features/confess-first.md
 *
 * One test per INV-* invariant. If you change Communion Prayer ordering
 * behavior, update both the feature file and these tests in the same commit.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3097; // distinct from patron (3098), smoke (3099), dev (3000)
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

/** Return block ids within a section, in render order. */
function idsIn(blocks, section) {
  return blocks.filter(b => b.section === section).map(b => b.id);
}

/** Index of the first id matching a regex within an array of ids. */
function firstIdx(ids, re) {
  return ids.findIndex(id => re.test(id));
}

// ── Contract tests ────────────────────────────────────────────────────────

describe('Feature contract: confessFirst', () => {

  it('INV-1: default (no overlay rubric) — Communion Prayer order is draw-near → blessed → prayer', async () => {
    // 2026-06-21 — ordinary Sunday, no parish overlay.
    const { json } = await get('/api/liturgy?date=2026-06-21');
    const ids = idsIn(json.blocks, 'Communion Prayer');

    const drawIdx    = ids.indexOf('pc-draw-near');
    const blessedIdx = ids.indexOf('pc-blessed');
    const prayerIdx  = firstIdx(ids, /^pc-prayer(-\d+)?$/);

    assert.ok(drawIdx    >= 0, `expected pc-draw-near in Communion Prayer; got: ${ids.join(', ')}`);
    assert.ok(blessedIdx >= 0, `expected pc-blessed in Communion Prayer; got: ${ids.join(', ')}`);
    assert.ok(prayerIdx  >= 0, `expected pc-prayer-* in Communion Prayer; got: ${ids.join(', ')}`);
    assert.ok(drawIdx    < blessedIdx, `draw-near (${drawIdx}) must precede blessed (${blessedIdx})`);
    assert.ok(blessedIdx < prayerIdx,  `blessed (${blessedIdx}) must precede prayer (${prayerIdx})`);
  });

  it('INV-2: confessFirst=true (Tyler overlay) — order is prayer → draw-near → blessed', async () => {
    // 2026-06-21 — ordinary Sunday, Tyler overlay sets confessFirst: true.
    const { json } = await get(`/api/liturgy?date=2026-06-21&translation=${TYLER}`);
    const ids = idsIn(json.blocks, 'Communion Prayer');

    const drawIdx    = ids.indexOf('pc-draw-near');
    const blessedIdx = ids.indexOf('pc-blessed');
    const prayerIdx  = firstIdx(ids, /^pc-prayer(-\d+)?$/);
    const lastPrayerIdx = ids.map((id, i) => /^pc-prayer(-\d+)?$/.test(id) ? i : -1)
      .filter(i => i >= 0).pop();

    assert.ok(prayerIdx  >= 0, `expected pc-prayer-* in Communion Prayer; got: ${ids.join(', ')}`);
    assert.ok(drawIdx    >= 0, `expected pc-draw-near in Communion Prayer; got: ${ids.join(', ')}`);
    assert.ok(blessedIdx >= 0, `expected pc-blessed in Communion Prayer; got: ${ids.join(', ')}`);
    assert.ok(lastPrayerIdx < drawIdx, `all pc-prayer-* (last at ${lastPrayerIdx}) must precede draw-near (${drawIdx})`);
    assert.ok(drawIdx < blessedIdx, `draw-near (${drawIdx}) must precede blessed (${blessedIdx})`);
  });

  it('INV-3: Paschal period — draw-near and blessed are suppressed; only prayer renders (even with confessFirst set)', async () => {
    // 2026-04-19 — Thomas Sunday, in the Paschal period (pentecostarion season).
    // Use Tyler overlay (confessFirst: true) to prove the Paschal suppression
    // wins over the parish rubric.
    const { json } = await get(`/api/liturgy?date=2026-04-19&translation=${TYLER}`);
    const ids = idsIn(json.blocks, 'Communion Prayer');

    assert.ok(ids.length > 0, 'expected at least one Communion Prayer block on Thomas Sunday');
    assert.equal(ids.indexOf('pc-draw-near'), -1,
      `pc-draw-near must NOT appear in Paschal period; got: ${ids.join(', ')}`);
    assert.equal(ids.indexOf('pc-blessed'), -1,
      `pc-blessed must NOT appear in Paschal period; got: ${ids.join(', ')}`);
    const onlyPrayers = ids.every(id => /^pc-prayer(-\d+)?$/.test(id));
    assert.ok(onlyPrayers, `expected only pc-prayer-* blocks; got: ${ids.join(', ')}`);
  });
});
