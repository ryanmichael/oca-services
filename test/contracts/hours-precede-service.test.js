/**
 * Feature contract: hoursPrecedeService (skip reader's opening prayers)
 * Spec: features/hours-precede-service.md
 *
 * One test per INV-* invariant. If you change the opening-skip behavior,
 * update both the feature file and these tests in the same commit.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3091; // distinct: faithful-litany 3090, beatitudes 3093, vespers 3094,
                   // polyeleos 3095, sunday-kontakia 3096, confess-first 3097,
                   // patron 3098, smoke 3099, dev 3000
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

// ── Fixtures ──────────────────────────────────────────────────────────────

const TYLER = 'st-john-damascus-tyler';
// 2026-06-27 = Sat → Great Vespers eve of 4th Sunday after Pentecost
const GREAT_VESPERS_DATE = '2026-06-27';
// 2026-06-24 = Wed weekday → Daily Vespers eve of Nativity of Forerunner (Jun 25)
const DAILY_VESPERS_DATE = '2026-07-01'; // ordinary weekday with daily vespers
// 2026-06-28 = Sun → Matins for 4th Sunday after Pentecost
const MATINS_DATE = '2026-06-28';

const FULL_OPENING_IDS = [
  'opening-exclamation', 'opening-amen',
  'heavenly-king', 'trisagion', 'glory-now-1',
  'most-holy-trinity', 'lhm-3', 'glory-now-2',
  'our-father', 'kingdom-doxology', 'lhm-12', 'glory-now-3',
];

const SKIPPED_OPENING_IDS = ['opening-exclamation', 'opening-amen'];

function openingBlockIds(json) {
  return json.blocks.filter(b => b.section === 'Opening').map(b => b.id);
}

// ── Contract tests ────────────────────────────────────────────────────────

describe('Feature contract: hoursPrecedeService', () => {

  it('INV-1: default (no overlay) — Great Vespers opening has all 12 reader prayers', async () => {
    const { json } = await get(`/api/service?date=${GREAT_VESPERS_DATE}`);
    assert.ok(json, 'expected JSON response');
    const ids = openingBlockIds(json);
    assert.deepEqual(ids, FULL_OPENING_IDS,
      `default opening should be the full 12-block reader's prayer sequence`);
  });

  it('INV-2: Tyler (flag=1) — Great Vespers opening is exclamation+amen only', async () => {
    const { json } = await get(`/api/service?date=${GREAT_VESPERS_DATE}&translation=${TYLER}`);
    const ids = openingBlockIds(json);
    assert.deepEqual(ids, SKIPPED_OPENING_IDS,
      `Tyler opening should skip the reader's prayers (Hours read prior)`);
    // Psalm 103 still renders immediately after.
    const sections = [...new Set(json.blocks.map(b => b.section))];
    const psIdx = sections.indexOf('Psalm 103');
    const opIdx = sections.indexOf('Opening');
    assert.ok(psIdx > opIdx, 'Psalm 103 must follow Opening');
  });

  it('INV-3: Tyler (flag=1) — Daily Vespers opening is exclamation+amen only', async () => {
    const { json } = await get(`/api/service?date=${DAILY_VESPERS_DATE}&translation=${TYLER}`);
    assert.ok(json && json.blocks, `expected blocks for ${DAILY_VESPERS_DATE}`);
    const ids = openingBlockIds(json);
    assert.deepEqual(ids, SKIPPED_OPENING_IDS,
      `Tyler Daily Vespers should also skip reader's prayers`);
  });

  it('INV-4: Tyler (flag=1) — Matins (non-vigil Sunday) opening is exclamation+amen only', async () => {
    const { json } = await get(`/api/matins?date=${MATINS_DATE}&translation=${TYLER}`);
    const ids = openingBlockIds(json);
    assert.deepEqual(ids, SKIPPED_OPENING_IDS,
      `Tyler Matins should skip reader's prayers when Midnight Office precedes`);
  });

  it('INV-5: default Matins (no overlay) — opening has all 12 reader prayers', async () => {
    const { json } = await get(`/api/matins?date=${MATINS_DATE}`);
    const ids = openingBlockIds(json);
    assert.deepEqual(ids, FULL_OPENING_IDS,
      `default Matins opening should be unchanged for parishes without the flag`);
  });
});
