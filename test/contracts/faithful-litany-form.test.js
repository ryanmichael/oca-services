/**
 * Feature contract: faithful2Long (2nd Litany of the Faithful form)
 * Spec: features/faithful-litany-form.md
 *
 * One test per INV-* invariant. If you change 2nd-Litany-of-the-Faithful
 * rendering, update both the feature file and these tests in the same
 * commit.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const PORT = 3090; // distinct from vespers (3094), polyeleos (3095), beatitudes/sunday-kontakia (3096), confess-first (3097), patron (3098), smoke (3099), dev (3000)
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

const TYLER = 'st-john-damascus-tyler';
const DB = path.join(__dirname, '..', '..', 'storage', 'oca.db');

function startServer() {
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
}

async function stopServer() {
  if (!serverProcess) return;
  const p = serverProcess;
  serverProcess = null;
  p.kill();
  // Wait for the child to fully exit so it releases the SQLite write lock
  // before we attempt a CLI UPDATE.
  await new Promise((resolve) => {
    if (p.exitCode !== null) return resolve();
    p.once('exit', resolve);
    setTimeout(resolve, 1000); // hard cap; sqlite busy_timeout below covers any residual lock
  });
}

/** Toggle the long-form rubric on the Tyler parish row.
 *  Server is fully stopped before the write to avoid SQLite write-lock
 *  contention; `busy_timeout` is set as defense-in-depth. */
async function setTylerLongFormFlag(value) {
  await stopServer();
  execFileSync('sqlite3', [
    '-cmd', 'PRAGMA busy_timeout=5000;',
    DB,
    `UPDATE parish_settings SET rubric_faithful_litany_2_long=${value ? 1 : 0} WHERE parish_id='${TYLER}';`,
  ]);
}

async function startServerAndWait() {
  startServer();
  await waitForServer();
}

before(async () => {
  // Ensure Tyler starts at short-form default. No server yet, so no lock risk.
  execFileSync('sqlite3', [
    '-cmd', 'PRAGMA busy_timeout=5000;',
    DB,
    `UPDATE parish_settings SET rubric_faithful_litany_2_long=0 WHERE parish_id='${TYLER}';`,
  ]);
  await startServerAndWait();
});

after(async () => {
  await stopServer();
  execFileSync('sqlite3', [
    '-cmd', 'PRAGMA busy_timeout=5000;',
    DB,
    `UPDATE parish_settings SET rubric_faithful_litany_2_long=0 WHERE parish_id='${TYLER}';`,
  ]);
});

// ── Helpers ───────────────────────────────────────────────────────────────

const DATE = '2026-06-21';

function faithful2Ids(json) {
  return json.blocks
    .filter(b => b.section === 'Litanies of the Faithful' && /^lf2-/.test(b.id))
    .map(b => b.id);
}

function faithful1Ids(json) {
  return json.blocks
    .filter(b => b.section === 'Litanies of the Faithful' && /^lf1-/.test(b.id))
    .map(b => b.id);
}

// ── Contract tests ────────────────────────────────────────────────────────

describe('Feature contract: faithful2Long', () => {

  it('INV-1: default (no overlay) — 2nd Litany of the Faithful has NO lf2-p* petition blocks', async () => {
    const { json } = await get(`/api/liturgy?date=${DATE}`);
    const ids = faithful2Ids(json);
    const petitions = ids.filter(id => /^lf2-p\d+(-resp)?$/.test(id));
    assert.equal(petitions.length, 0,
      `default Sluzhebnik short form must have no lf2-p* blocks; got: ${petitions.join(', ')}`);
    // Short-form skeleton must be intact.
    for (const expected of ['lf2-opening', 'lf2-response', 'lf2-petition', 'lf2-pet-resp', 'lf2-wisdom', 'lf2-excl', 'lf2-amen']) {
      assert.ok(ids.includes(expected), `expected ${expected} in short form; got: ${ids.join(', ')}`);
    }
  });

  it('INV-2: long-form rubric (Tyler flag flipped) — 2nd Litany contains exactly 4 lf2-p0..p3 petitions', async () => {
    await setTylerLongFormFlag(true);
    await startServerAndWait();
    try {
      const { json } = await get(`/api/liturgy?date=${DATE}&translation=${TYLER}`);
      const ids = faithful2Ids(json);
      const petitions = ids.filter(id => /^lf2-p\d+$/.test(id));
      assert.equal(petitions.length, 4,
        `long form must render exactly 4 petition blocks; got: ${petitions.join(', ')}`);
      assert.deepEqual(petitions, ['lf2-p0', 'lf2-p1', 'lf2-p2', 'lf2-p3'],
        `long form petitions must be lf2-p0..p3 in order; got: ${petitions.join(', ')}`);
      for (let i = 0; i < 4; i++) {
        assert.ok(ids.includes(`lf2-p${i}-resp`),
          `petition lf2-p${i} must have lf2-p${i}-resp; got: ${ids.join(', ')}`);
      }
      const helpIdx = ids.indexOf('lf2-petition');
      const lastPetIdx = ids.indexOf('lf2-p3-resp');
      assert.ok(helpIdx > lastPetIdx, `lf2-petition (${helpIdx}) must follow lf2-p3-resp (${lastPetIdx})`);
    } finally {
      await setTylerLongFormFlag(false);
      await startServerAndWait();
    }
  });

  it('INV-3: 1st Litany of the Faithful is unaffected by the flag', async () => {
    const expected = ['lf1-opening', 'lf1-response', 'lf1-petition', 'lf1-pet-resp', 'lf1-wisdom', 'lf1-excl', 'lf1-amen'];

    // Default (short form) — server already up from before().
    const { json: short } = await get(`/api/liturgy?date=${DATE}`);
    assert.deepEqual(faithful1Ids(short), expected,
      `1st Litany default mismatch; got: ${faithful1Ids(short).join(', ')}`);

    // Long form on Tyler.
    await setTylerLongFormFlag(true);
    await startServerAndWait();
    try {
      const { json: long } = await get(`/api/liturgy?date=${DATE}&translation=${TYLER}`);
      assert.deepEqual(faithful1Ids(long), expected,
        `1st Litany long-form mismatch; got: ${faithful1Ids(long).join(', ')}`);
    } finally {
      await setTylerLongFormFlag(false);
      await startServerAndWait();
    }
  });
});
