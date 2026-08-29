/**
 * Feature contract: a lesser feast's window does not claim "Now and ever…"
 * Spec: features/lesser-feast-window.md
 *
 * One test per INV-* invariant. If you change `windowClaimsNowAndEver` or
 * either of its two consumers, update the feature file and these tests in the
 * same commit.
 *
 * Every slot assertion here is by POSITION relative to the Glory/Now
 * connectors, never by "the label appears somewhere in the section" — the bug
 * this contract closes shipped green past rules that only checked labels.
 *
 * Run: node --test test/contracts/lesser-feast-window.test.js
 *      npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { windowClaimsNowAndEver } = require('../../server-lib/sources/menaion-principal');
const { openDb } = require('../../server-lib/cache/sqlite');

const PORT = 3103; // distinct: confess-first 3097, vigil-rank 3100, beatitudes-feast-blend 3101, hymn-label 3102
let serverProcess;

const TYLER = 'st-john-damascus-tyler';

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
  await waitForServer();
});

after(() => { if (serverProcess) serverProcess.kill(); });

// ── Helpers ───────────────────────────────────────────────────────────────

/** Blocks of a section, in order, as {label, tone, text}. */
function sectionBlocks(blocks, section) {
  return blocks.filter(b => (b.section || '') === section);
}

/** Index of the "Glory to the Father…" doxology within a block list. */
function gloryIdx(bs) {
  return bs.findIndex(b => /^Glory to the Father/.test(b.text || ''));
}

/** Index of the "Now and ever…" doxology within a block list. */
function nowIdx(bs) {
  return bs.findIndex(b => /^Now and ever/.test(b.text || ''));
}

/** The first block after index i that carries sung text (not a connector). */
function hymnAfter(bs, i) {
  return bs.slice(i + 1).find(b => b.type === 'hymn') || null;
}

// ── Contract tests ────────────────────────────────────────────────────────

describe('Feature contract: a lesser feast window does not claim "Now and ever"', () => {

  it('INV-1: 8-29 Great Vespers — Resurrection, Glory Forerunner, Now Dismissal Theotokion', async () => {
    // reference/orders/2026-0830-order-services.txt, "Or, if Great Vespers
    // alone is served": Resurrectional Troparion T4 / Glory... Forerunner T2 /
    // Now and ever... Resurrectional Dismissal Theotokion T2.
    const { json } = await get(`/api/service?date=2026-08-29&translation=${TYLER}`);
    const bs = sectionBlocks(json.blocks, 'Troparia');

    const gi = gloryIdx(bs);
    const ni = nowIdx(bs);
    assert.ok(gi >= 0, 'expected a Glory connector in Vespers Troparia');
    assert.ok(ni > gi, 'expected a Now connector after the Glory');

    // Leading slot, before the Glory, is the Resurrectional troparion.
    const lead = bs.slice(0, gi).find(b => b.type === 'hymn');
    assert.ok(lead, 'expected a hymn before the Glory');
    assert.match(lead.label || '', /Resurrectional Troparion/,
      `expected the Resurrectional troparion to lead; got: ${lead.label}`);

    // The Glory belongs to the feast WINDOW, not the day's hierarchs.
    const glory = hymnAfter(bs, gi);
    assert.ok(glory, 'expected a hymn at the Glory');
    assert.match(glory.label || '', /Afterfeast of the Beheading/,
      `expected the Beheading window at the Glory; got: ${glory.label}`);

    // "Now and ever" is the Theotokion — the window must NOT have taken it.
    const now = hymnAfter(bs, ni);
    assert.ok(now, 'expected a hymn at Now and ever');
    assert.match(now.label || '', /Dismissal Theotokion/,
      `expected the Dismissal Theotokion at Now and ever; got: ${now.label}`);
  });

  it('INV-2: the 8-29 Vespers Theotokion follows the tone of the Glory (Tone 2)', async () => {
    // "Богородичен по гласу Славы" — and the order prints Tone 2 for both.
    // The day's principal hierarchs are Tone 4, so a Tone-4 Theotokion here
    // would mean the Glory never moved off the saint.
    const { json } = await get(`/api/service?date=2026-08-29&translation=${TYLER}`);
    const bs = sectionBlocks(json.blocks, 'Troparia');
    const glory = hymnAfter(bs, gloryIdx(bs));
    const now   = hymnAfter(bs, nowIdx(bs));
    assert.equal(glory.tone, 2, `expected the Glory in Tone 2; got ${glory.tone}`);
    assert.equal(now.tone, 2, `expected the Theotokion in Tone 2; got ${now.tone}`);
  });

  it('INV-3: 8-30 Liturgy troparia read Resurrection → Patron → Forerunner → Saints', async () => {
    const { json } = await get(`/api/liturgy?date=2026-08-30&translation=${TYLER}`);
    const labels = sectionBlocks(json.blocks, 'Troparia')
      .filter(b => /^Troparion of /.test(b.text || ''))
      .map(b => b.text);

    const iRes  = labels.findIndex(t => /Troparion of the Resurrection/.test(t));
    const iPat  = labels.findIndex(t => /Patron of the Temple/.test(t));
    const iFore = labels.findIndex(t => /Afterfeast of the Beheading/.test(t));
    const iSts  = labels.findIndex(t => /Saint Alexander/.test(t));

    for (const [name, i] of [['Resurrection', iRes], ['Patron', iPat],
                             ['Forerunner', iFore], ['Saints', iSts]]) {
      assert.ok(i >= 0, `missing the ${name} troparion; got: ${labels.join(' | ')}`);
    }
    assert.ok(iRes < iPat && iPat < iFore && iFore < iSts,
      `expected Resurrection < Patron < Forerunner < Saints; got ${iRes} ${iPat} ${iFore} ${iSts}`);
  });

  it('INV-4: 8-30 Liturgy kontakia put the Forerunner BEFORE the Glory and the Theotokion at Now', async () => {
    // Order: Resurrection / Church / Forerunner T5 / Glory... Saints T8 /
    //        Now and ever... "Steadfast Protectress" T6.
    const { json } = await get(`/api/liturgy?date=2026-08-30&translation=${TYLER}`);
    const bs = sectionBlocks(json.blocks, 'Kontakia');
    const gi = gloryIdx(bs);
    const ni = nowIdx(bs);
    assert.ok(gi >= 0 && ni > gi, 'expected Glory then Now in Kontakia');

    const beforeGlory = bs.slice(0, gi).map(b => b.text || '');
    assert.ok(beforeGlory.some(t => /Afterfeast of the Beheading/.test(t)),
      `expected the Forerunner kontakion above the Glory; got: ${beforeGlory.join(' | ')}`);

    const glory = bs[gi + 1];
    assert.match(glory?.text || '', /Kontakion of Saint Alexander/,
      `expected the Saints' kontakion at the Glory; got: ${glory?.text}`);

    const now = bs[ni + 1];
    assert.match(now?.text || '', /Kontakion-Theotokion/,
      `expected the Kontakion-Theotokion at Now and ever; got: ${now?.text}`);
  });

  it('INV-5: the guard does not over-fire — 8-23 gives the Dormition Leavetaking "Now and ever"', async () => {
    const { json } = await get(`/api/liturgy?date=2026-08-23&translation=${TYLER}`);
    const bs = sectionBlocks(json.blocks, 'Kontakia');
    const ni = nowIdx(bs);
    assert.ok(ni >= 0, 'expected a Now connector in Kontakia');

    const now = bs[ni + 1];
    assert.match(now?.text || '', /Leavetaking of the Dormition/,
      `expected the Leavetaking kontakion at Now and ever; got: ${now?.text}`);

    // A GREAT Feast window displaces the Kontakion-Theotokion entirely.
    assert.ok(!bs.some(b => /Kontakion-Theotokion/.test(b.text || '')),
      'a Great Feast window must displace the Kontakion-Theotokion, not sit beside it');
  });

  it('INV-6: 8-08 Great Vespers still closes on the Transfiguration Afterfeast troparion', async () => {
    // 8-09 St. Herman inside the Transfiguration afterfeast — a Great Feast
    // window, so it keeps "Now and ever" and Herman keeps the Glory.
    const { json } = await get(`/api/service?date=2026-08-08&translation=${TYLER}`);
    const bs = sectionBlocks(json.blocks, 'Troparia');

    const glory = hymnAfter(bs, gloryIdx(bs));
    assert.match(glory?.label || '', /Herman of Alaska/,
      `expected St. Herman at the Glory; got: ${glory?.label}`);

    const now = hymnAfter(bs, nowIdx(bs));
    assert.match(now?.label || '', /Afterfeast of the Transfiguration/,
      `expected the Feast troparion at Now and ever; got: ${now?.label}`);
  });

  it('INV-7: windowClaimsNowAndEver is true for every Great Feast window in the DB, false for the rest', async () => {
    const db = openDb();
    const rows = db.prepare(`
      SELECT DISTINCT title FROM commemorations
      WHERE title LIKE 'Afterfeast %'  OR title LIKE 'Forefeast %'
         OR title LIKE 'Leavetaking %' OR title LIKE 'Midfeast%'
         OR title LIKE 'Postfeast %'
      ORDER BY title
    `).all();
    assert.ok(rows.length >= 25, `expected the window corpus; got ${rows.length} rows`);

    // The only two window titles in `commemorations` whose feast is NOT one of
    // the Twelve. If a third appears, this list must be revisited deliberately
    // rather than the assertion relaxed.
    const LESSER = [
      'Forefeast of the Procession of the Honorable and Lifegiving Cross of the Lord',
      'Afterfeast of the Beheading of the Holy Glorious Prophet, Forerunner, and Baptist John',
    ];

    const claimed    = rows.filter(r => windowClaimsNowAndEver(r.title)).map(r => r.title);
    const notClaimed = rows.filter(r => !windowClaimsNowAndEver(r.title)).map(r => r.title);

    assert.deepEqual(notClaimed.sort(), [...LESSER].sort(),
      `unexpected lesser windows: ${notClaimed.join(' | ')}`);
    assert.equal(claimed.length, rows.length - LESSER.length);

    // And the predicate must not fire on ordinary saints.
    assert.equal(windowClaimsNowAndEver('Saint Alexander, Patriarch of Constantinople'), false);
    assert.equal(windowClaimsNowAndEver(''), false);
    assert.equal(windowClaimsNowAndEver(null), false);
  });
});
