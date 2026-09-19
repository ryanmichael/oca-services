/**
 * Feature contract: blended Beatitudes fill every appointed slot
 *
 * assemblers/liturgy-parts/antiphons.js RIGHT-ALIGNS the troparia:
 *
 *     const totalSlots = 12;                       // 10 verses + Glory + Now
 *     const startSlot  = totalSlots - tropList.length;
 *
 * So the COUNT decides which Beatitude verse each troparion is sung against.
 * A blend that is short does not merely omit its missing troparia — it slides
 * every remaining one later. 2026-09-20 rendered the plain Octoechos eight
 * (6 + Glory + Theotokion, the right shape for an ORDINARY Sunday) where the
 * order appoints twelve, so all eight sat four stichoi late.
 *
 * That is the 2026-08-16 failure, which was caught from the kliros mid-Liturgy
 * rather than by the audit — see project_feast_window_sunday_2026_08_10.
 *
 * The live hazard this guards is quiet: loadBlendParts SKIPS a part it cannot
 * read, with only a console warning. A renamed canon file or a changed `at`
 * path therefore drops the count and silently restores the mis-alignment.
 * INV-1 fails the moment that happens.
 *
 * Reserved slots (`missing: N`) render as nothing but still OCCUPY their slot,
 * which is what keeps the alignment honest while a text is unsourced.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3108; // distinct: see sibling contract tests for the port ledger
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

// Both dates carrying a FEAST_BEATITUDES_BLENDS entry. Testing only one would
// let a blend-wide regression pass on the other.
const BLEND_SUNDAYS = ['2026-09-20', '2026-08-16'];

async function thirdAntiphon(date) {
  const { json } = await get(`/api/liturgy?date=${date}`);
  assert.ok(json?.blocks, `no blocks for ${date}`);
  return json.blocks.filter(b => b.section === 'Third Antiphon');
}

describe('blended Beatitudes alignment', () => {
  it('INV-1: troparia start on the FIRST Beatitude verse, not partway down', async () => {
    for (const date of BLEND_SUNDAYS) {
      const th = await thirdAntiphon(date);
      const firstVerse = th.findIndex(b => b.type === 'verse' && /^Blessed are the poor in spirit/i.test(b.text || ''));
      assert.ok(firstVerse >= 0, `${date}: "Blessed are the poor in spirit" not found`);
      const next = th[firstVerse + 1];
      assert.ok(next && next.type === 'hymn',
        `${date}: the first Beatitude verse carries no troparion — the blend is short, so ` +
        `right-alignment has slid every troparion later. Got "${next && next.type}".`);
    }
  });

  it('INV-2: the Glory and Now-and-ever slots carry real text', async () => {
    // The last two of the twelve are the Glory and the Now-and-ever. A `missing`
    // reservation placed at the END of the final group would silence one of
    // them, which is why each blend puts its reservations FIRST in the group.
    for (const date of BLEND_SUNDAYS) {
      const th = await thirdAntiphon(date);
      const hymns = th.filter(b => b.type === 'hymn');
      assert.ok(hymns.length >= 2, `${date}: fewer than two troparia rendered`);
      for (const b of hymns.slice(-2)) {
        assert.ok((b.text || '').trim().length > 0,
          `${date}: a terminal Beatitude slot (Glory / Now-and-ever) rendered empty`);
      }
    }
  });

  it('INV-3: a blend never emits a canon irmos', async () => {
    // Beatitudes are troparia only (L36, discovered 2026-07-05). Blends read
    // canon odes, so they are the likeliest source of a regression back to
    // irmos-bearing data.
    for (const date of BLEND_SUNDAYS) {
      const th = await thirdAntiphon(date);
      for (const b of th.filter(x => x.type === 'hymn')) {
        assert.doesNotMatch(b.label || '', /irmos/i,
          `${date}: an irmos-labeled hymn reached the Beatitudes`);
      }
    }
  });
});
