/**
 * Feature contract: licNoLeadingRepeat (Sat Great Vespers LIC 9-count)
 * Spec: features/lic-no-leading-repeat.md
 *
 * One test per INV-* invariant. If you change LIC stichera count logic for
 * Sat Great Vespers, update both the feature file and these tests in the
 * same commit.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3092; // distinct: faithful-litany 3090, hours-precede 3091, beatitudes 3093,
                   // vespers 3094, polyeleos 3095, sunday-kontakia 3096, confess-first 3097,
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
// 2026-06-27 = Sat → Sun-eve Great Vespers (Tone 3) for 4th Sunday after Pentecost.
// Principal commemoration (Cyrus & John) supplies 3 menaion stichera at LIC.
const DATE = '2026-06-27';

function licHymnBlocks(json) {
  return (json.blocks || []).filter(b =>
    b.section === 'Lord, I Have Cried' &&
    b.type === 'hymn' &&
    !/^lic-(glory|now)/.test(b.id)  // exclude doxastikon + dogmatikon
  );
}

function licVerseIds(json) {
  return (json.blocks || []).filter(b =>
    b.section === 'Lord, I Have Cried' && b.type === 'verse'
  ).map(b => b.id);
}

// ── Contract tests ────────────────────────────────────────────────────────

describe('Feature contract: licNoLeadingRepeat', () => {

  it('INV-1: default — 10 LIC hymns, first two octoechos hymns are identical (sticheron 1 doubled)', async () => {
    const { json } = await get(`/api/service?date=${DATE}`);
    const hymns = licHymnBlocks(json);
    assert.equal(hymns.length, 10, `default LIC should emit 10 hymn blocks (7 octoechos + 3 menaion); got ${hymns.length}`);
    const oct = hymns.filter(b => b.source === 'octoechos');
    assert.equal(oct.length, 7, `default should have 7 octoechos hymns; got ${oct.length}`);
    assert.equal(oct[0].text, oct[1].text,
      `default: first two octoechos hymns should be identical (sticheron 1 doubled per typikon)`);
  });

  it('INV-2: Tyler — 9 LIC hymns, no consecutive duplicates, verse 10 absent', async () => {
    const { json } = await get(`/api/service?date=${DATE}&translation=${TYLER}`);
    const hymns = licHymnBlocks(json);
    assert.equal(hymns.length, 9, `Tyler LIC should emit 9 hymn blocks (6 octoechos + 3 menaion); got ${hymns.length}`);
    const oct = hymns.filter(b => b.source === 'octoechos');
    assert.equal(oct.length, 6, `Tyler should have 6 octoechos hymns; got ${oct.length}`);
    for (let i = 1; i < hymns.length; i++) {
      assert.notEqual(hymns[i].text, hymns[i - 1].text,
        `Tyler: consecutive LIC hymns ${i - 1} and ${i} should not be identical`);
    }
    const verseIds = licVerseIds(json);
    assert.ok(!verseIds.includes('lic-verse-10'),
      `Tyler: verse 10 should be absent (9-count starts at v.9). Got verses: ${verseIds.join(',')}`);
    assert.ok(verseIds.includes('lic-verse-9'), `Tyler: verse 9 should be present`);
  });

  it('INV-3: Tyler — Doxastikon and Dogmatikon (Glory + Now) still render', async () => {
    const { json } = await get(`/api/service?date=${DATE}&translation=${TYLER}`);
    const lic = (json.blocks || []).filter(b => b.section === 'Lord, I Have Cried' && b.type === 'hymn');
    const glory = lic.find(b => b.id === 'lic-glory-hymn');
    const now   = lic.find(b => b.id === 'lic-now-hymn');
    assert.ok(glory, 'Tyler: LIC Glory (Doxastikon) hymn must be present');
    assert.ok(now,   'Tyler: LIC Now (Dogmatikon) hymn must be present');
    assert.equal(glory.source, 'menaion', `Tyler: LIC Glory should come from menaion; got ${glory.source}`);
    assert.equal(now.source,   'octoechos', `Tyler: LIC Now (Dogmatikon) should come from octoechos; got ${now.source}`);
  });

  it('INV-5: Tone 8 — displaced doxastichon fills the 7th slot, so both parishes get a clean 10', async () => {
    // 2026-08-01 eve → Sun 8-02, Tone 8, Translation of the Relics of Protomartyr
    // Stephen. Tone 8's resurrectional doxastichon is flagged _alsoNumberedSticheron:
    // the Menaion takes the Glory, so it is sung as the 7th numbered sticheron.
    // Both parishes therefore reach the canonical 10 with no doubling — the Tyler
    // choir booklet for this date numbers the Octoechos block 10-4 + 3 Menaion.
    for (const q of ['', `&translation=${TYLER}`]) {
      const who = q ? 'Tyler' : 'default';
      const { json } = await get(`/api/service?date=2026-08-01${q}`);
      assert.equal(json.tone, 8, `${who}: expected Tone 8`);
      const hymns = licHymnBlocks(json);
      assert.equal(hymns.length, 10, `${who}: Tone 8 LIC should emit 10 hymns (7 octoechos + 3 menaion); got ${hymns.length}`);
      assert.equal(hymns.filter(b => b.source === 'octoechos').length, 7, `${who}: expected 7 octoechos hymns`);
      assert.equal(hymns.filter(b => b.source === 'menaion').length, 3, `${who}: expected 3 menaion hymns`);
      for (let i = 1; i < hymns.length; i++) {
        assert.notEqual(hymns[i].text, hymns[i - 1].text,
          `${who}: consecutive LIC hymns ${i - 1} and ${i} should not be identical`);
      }
      assert.ok(licVerseIds(json).includes('lic-verse-10'), `${who}: verse 10 should be present`);
    }
  });

  it('INV-6: a Glory-framed doxastichon is never promoted into a numbered slot', async () => {
    // Guards the opt-in. Tone 3's doxastichon is written for the Glory slot
    // ("we offer our evening song") and must stay out of the numbered stichera,
    // so Tone 3 keeps its old shape: default doubles, Tyler renders 9.
    const { json } = await get(`/api/service?date=${DATE}`);
    assert.equal(json.tone, 3, 'expected the Tone 3 fixture date');
    const oct = licHymnBlocks(json).filter(b => b.source === 'octoechos');
    assert.equal(oct.length, 7, 'Tone 3 default should still reach 7 octoechos slots');
    assert.ok(oct.every(b => !/we offer our evening song/i.test(b.text)),
      'Tone 3 Glory-framed doxastichon must not appear as a numbered sticheron');
  });

  it('INV-4: Tyler — Daily Vespers on a weekday is unaffected by the flag (still 6-count)', async () => {
    // 2026-07-01 = Wed weekday → Daily Vespers eve of Thu Jul 2
    const { json } = await get(`/api/service?date=2026-07-01&translation=${TYLER}`);
    assert.ok(json && json.blocks, 'expected Daily Vespers blocks');
    const hymns = licHymnBlocks(json);
    // Daily Vespers tops out at 6 LIC stichera by spec — rubric is Sat-Great-Vespers-scoped.
    assert.ok(hymns.length <= 6,
      `Daily Vespers LIC should be ≤6 hymns regardless of flag; got ${hymns.length}`);
  });
});
