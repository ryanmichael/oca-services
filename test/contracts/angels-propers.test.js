/**
 * Feature contract: the Bodiless Powers have propers, and they are sung
 *
 * The General Menaion's Common of the Bodiless Powers was in the corpus the
 * whole time — 9 rows in `general_menaion` under saint_type 'angels' — but NO
 * commemoration carried that saint_type, so the category was orphaned and
 * unreachable. Four angelic commemorations (601 and 1415 Gabriel, 1823 the
 * Miracle at Colossae, 2300 the Synaxis of Michael) all held saint_type NULL.
 *
 * `drift.js` compounded it: its rank/saint_type rule EXEMPTED
 * "^Synaxis of the Archangel" on the stated grounds that no General-Menaion
 * category fitted an angel. That was true of general-menaion-propers.json,
 * which covered saints only — and false of the stichera table. The exemption
 * hid the missing tag that was the actual defect.
 *
 * Found 2026-10-29 preparing 2026-11-08 (Synaxis of the Archangel Michael and
 * the Other Bodiless Powers). Fixed by tagging the four commemorations,
 * authoring an `angels` category in general-menaion-propers.json from the OCA
 * text (reference/scrape/2024-11-08.docx), and RETIRING the drift exemption so
 * the rule guards angels like everything else.
 *
 * reference/orders/2026-1108-order-services.txt appoints, at Liturgy:
 *   Beatitudes  6 troparia of the Resurrection T6 + 4 from Ode 3 of the
 *               Canon of the Angels T8
 *   Prokeimenon Resurrection T6 AND Angels T4
 *   Alleluia    Resurrection T6 AND Angels T5
 *   Communion   "Praise the Lord from the heavens" AND "He makes His angels…"
 *
 * Before the fix the Beatitudes rendered the plain Octoechos eight (6 + Glory
 * + Theotokion), which — because the renderer RIGHT-ALIGNS into twelve slots —
 * put every troparion two stichoi late with the Angels absent entirely. Same
 * L39 failure as the Holy Fathers Sunday on 2026-10-11.
 *
 * The second GOSPEL is deliberately NOT asserted here: `includeSecondGospel`
 * defaults false, matching OCA practice of reading one Gospel even when a
 * polyeleos+ feast appoints its own. Both Epistles always render.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3121; // distinct: 3120 was the last taken
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

const MICHAEL = '2026-11-08';
const UNMERCENARIES = '2026-11-01';   // 6 Resurrection T5 + 4 of the Canon T1

const liturgy = async (date) => (await get(`/api/liturgy?date=${date}`)).json;
const inSection = (blocks, name) => blocks.filter(b => b.section === name);
const textOf = (blocks) => blocks.map(b => b.text || '').join('\n');

describe('Feature contract: the Bodiless Powers have propers and they are sung', () => {
  it('INV-1: the four angelic commemorations carry saint_type "angels"', () => {
    const { openDb } = require(path.join(ROOT, 'server-lib', 'cache', 'sqlite'));
    const db = openDb();
    try {
      // Untagged, these resolve to NO propers at all — the category exists but
      // nothing reaches it. This is the defect itself, not a detail of it.
      const rows = db.prepare(
        'SELECT id, saint_type AS saintType FROM commemorations WHERE id IN (601, 1415, 1823, 2300)'
      ).all();
      assert.equal(rows.length, 4, 'expected all four angelic commemorations');
      for (const r of rows) {
        assert.equal(r.saintType, 'angels',
          `commemoration ${r.id} must be tagged 'angels' or its propers are unreachable`);
      }
      const gm = db.prepare(
        "SELECT COUNT(*) AS n FROM general_menaion WHERE saint_type = 'angels'"
      ).get();
      assert.ok(gm.n > 0, 'the general_menaion angels category must exist for the tag to reach');
    } finally { db.close(); }
  });

  it('INV-2: 11-08 Beatitudes are 6 Resurrection + 4 Bodiless Powers', async () => {
    const rows = inSection((await liturgy(MICHAEL)).blocks, 'Third Antiphon');
    const sung = rows.filter(b => b.source === 'octoechos' || b.source === 'feast');
    const res  = sung.filter(b => b.source === 'octoechos');
    const ang  = sung.filter(b => b.source === 'feast');
    // 6 + 4 = 10; the renderer right-aligns into 12 slots, so the count is what
    // puts each troparion on its appointed verse.
    assert.equal(res.length, 6, `expected 6 Resurrection troparia, got ${res.length}`);
    assert.equal(ang.length, 4, `expected 4 of the Bodiless Powers, got ${ang.length}`);
    for (const b of res) assert.equal(b.tone, 6, 'Resurrection troparia are Tone 6');
    for (const b of ang) assert.equal(b.tone, 8, 'the Canon of the Angels is Tone 8');
  });

  it('INV-3: the Angels\' Theotokion lands last, with no genre heading sung', async () => {
    const rows = inSection((await liturgy(MICHAEL)).blocks, 'Third Antiphon');
    const sung = rows.filter(b => b.source === 'feast');
    const last = sung[sung.length - 1];
    assert.match(last.label || '', /Theotokion/,
      'the Theotokion must be identified in the LABEL, where the renderer puts it at Now-and-ever');
    // The book glues the heading into the text ("Theotokion: O Bride of God…").
    // At Matins that is furniture; sung at the Beatitudes it is a lyric.
    for (const b of sung) {
      assert.doesNotMatch(b.text || '', /^(Theotokion|Stavrotheotokion|Triadicon|Martyricon)\s*[:—-]/i,
        `a genre heading is being sung as text: "${String(b.text).slice(0, 48)}…"`);
    }
  });

  it('INV-4: prokeimenon, alleluia and koinonikon each carry the Angels\' set', async () => {
    const blocks = (await liturgy(MICHAEL)).blocks;
    const prok = textOf(inSection(blocks, 'Prokeimenon'));
    assert.match(prok, /He makes His angels spirits/,
      'the Angels\' prokeimenon (Tone 4) must be sung alongside the Resurrection one');

    const alle = textOf(inSection(blocks, 'Alleluia'));
    assert.match(alle, /Praise Him, all His angels/, 'Angels\' alleluia verse 1 (Ps 148:2)');
    assert.match(alle, /For He spake, and they came into being/, 'Angels\' alleluia verse 2 (Ps 148:5)');

    const comm = textOf(inSection(blocks, 'Communion Hymn'));
    assert.match(comm, /Praise the Lord from the heavens/, 'the Sunday koinonikon');
    assert.match(comm, /He makes His angels spirits/, 'the Angels\' koinonikon');
  });

  it('INV-5: 11-01 also takes its appointed 6 + 4, in the canon\'s own tone', async () => {
    // Found on the LIVE site two days before the service, after the Vespers
    // fix for this same Sunday had already shipped and verified correct: the
    // Liturgy Beatitudes were still the plain Octoechos eight. Eight into
    // twelve right-aligned slots sits every troparion FOUR stichoi late.
    // reference/orders/2026-1101 appoints 4 from Ode 3 of the Canon of the
    // Unmercenaries, which is Tone 1 — NOT the day's Tone 5.
    const rows = inSection((await liturgy(UNMERCENARIES)).blocks, 'Third Antiphon');
    const res  = rows.filter(b => b.source === 'octoechos');
    const unm  = rows.filter(b => b.source === 'feast');
    assert.equal(res.length, 6, `expected 6 Resurrection troparia, got ${res.length}`);
    assert.equal(unm.length, 4, `expected 4 of the Unmercenaries, got ${unm.length}`);
    for (const b of res) assert.equal(b.tone, 5, 'Resurrection troparia are Tone 5');
    for (const b of unm) assert.equal(b.tone, 1, "the Canon of the Unmercenaries is Tone 1");
    assert.match(unm[unm.length - 1].label || '', /Theotokion/,
      'the Theotokion lands last, at Now-and-ever');
    for (const b of unm) {
      assert.doesNotMatch(b.text || '', /^(Theotokion|Stavrotheotokion)\s*[:\u2014-]/i,
        'no genre heading is sung as text');
    }
  });

  it('INV-6: both Epistles still render (Epistle doubling is the norm)', async () => {
    const ep = textOf(inSection((await liturgy(MICHAEL)).blocks, 'Epistle Reading'));
    assert.match(ep, /Ephesians 2\.4-10/, 'the Sunday-cycle Epistle');
    assert.match(ep, /Hebrews 2\.2-10/,   'the Bodiless Powers\' Epistle');
  });
});
