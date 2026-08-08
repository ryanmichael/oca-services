/**
 * Feature contract: "Glory to the Father" placement at the antiphons
 *
 * Rubric `antiphons.gloryAfterLittleLitany`. Default OFF — the First Antiphon
 * closes with "Glory… now and ever…" followed by its refrain, which is the OCA
 * standard shape and what every parish gets unless they opt out.
 *
 * ON, the doxology moves: the First Antiphon ends with its refrain, a bare
 * "Glory to the Father, and to the Son, and to the Holy Spirit." is sung at the
 * end of the following Little Litany, and "Now and ever…" stays at the close of
 * the Second Antiphon before "Only-begotten Son".
 *
 * St. John of Damascus (Tyler) sings it this way. Their choir book carries a
 * separate piece headed `"Glory . . ." before Psalm 145 (Second Antiphon)` and
 * none at the end of Psalm 102; the choir director confirmed the placement on
 * 2026-08-08.
 *
 * ASSUMPTION worth revisiting: only the doxology moves. The antiphon's refrain
 * ("Through the intercessions of the Theotokos…") still closes the First
 * Antiphon, and the relocated Glory carries no refrain — matching the choir
 * book's Glory piece, which is the doxology alone. The director spoke to the
 * Glory, not the refrain.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3084; // distinct: antiphon-glory 3084, sunday-matins 3085, pick-library 3086, …
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

const SUNDAY = '2026-06-21';
const GLORY_ONLY = /^Glory to the Father, and to the Son, and to the Holy Spirit\.$/;
const GLORY_AND_NOW = /Glory to the Father.*now and ever/i;

// NOTE: there are TWO Little Litanies (after each of the first two antiphons),
// so filtering by section name alone collects both. `ordered` keeps the real
// block order, which is what "at the end of the Little Litany, before Psalm 145"
// actually means.
async function sections(translation) {
  const { json } = await get(`/api/liturgy?date=${SUNDAY}&translation=${translation}`);
  assert.ok(json && json.blocks, `no blocks for ${translation}`);
  const pick = (name) => json.blocks.filter(b => b.section === name);
  return {
    a1: pick('First Antiphon'),
    ll: pick('Little Litany'),
    a2: pick('Second Antiphon'),
    ordered: json.blocks,
  };
}

describe('Feature contract: antiphon Glory placement', () => {

  it('INV-1: default OFF — the First Antiphon keeps its "Glory… now and ever…"', async () => {
    const { a1, ll } = await sections('oca');
    const dox = a1.filter(b => b.type === 'doxology');
    assert.equal(dox.length, 1, 'expected exactly one doxology in the First Antiphon');
    assert.match(dox[0].text, GLORY_AND_NOW);
    assert.equal(a1[a1.length - 1].type, 'response',
      'the refrain should still follow the Glory');
    assert.ok(!ll.some(b => b.type === 'doxology'),
      'the Little Litany must not carry a Glory when the rubric is off');
  });

  it('INV-2: ON — the First Antiphon ends with its refrain and no doxology', async () => {
    const { a1 } = await sections('st-john-damascus-tyler');
    assert.ok(!a1.some(b => b.type === 'doxology'),
      'the First Antiphon still carries a doxology');
    assert.equal(a1[a1.length - 1].type, 'response',
      'the First Antiphon should close with its refrain');
    assert.match(a1[a1.length - 1].text, /Through the intercessions of the Theotokos/);
  });

  it('INV-3: ON — a bare Glory closes the Little Litany, before Psalm 145', async () => {
    const { ll, a2, ordered } = await sections('st-john-damascus-tyler');
    const dox = ll.filter(b => b.type === 'doxology');
    assert.equal(dox.length, 1, 'expected exactly one Glory across both Little Litanies');
    assert.match(dox[0].text, GLORY_ONLY,
      'the relocated Glory must be the doxology alone — "now and ever" belongs to the Second Antiphon');

    // Position, not section membership: the Glory must be the block immediately
    // before the Second Antiphon begins.
    const firstA2 = ordered.findIndex(b => b.section === 'Second Antiphon');
    assert.ok(firstA2 > 0, 'Second Antiphon not found');
    const before = ordered[firstA2 - 1];
    assert.equal(before.section, 'Little Litany',
      'the block before Psalm 145 should belong to the Little Litany');
    assert.equal(before.type, 'doxology',
      'the Glory should be the LAST thing in the Little Litany, immediately before Psalm 145');
    assert.match(before.text, GLORY_ONLY);
    assert.ok(a2.length && a2[0].type === 'verse', 'Second Antiphon should start with a psalm verse');
  });

  it('INV-4: ON — "Now and ever" still closes the Second Antiphon before Only-begotten Son', async () => {
    const { a2 } = await sections('st-john-damascus-tyler');
    const dox = a2.filter(b => b.type === 'doxology');
    assert.equal(dox.length, 1);
    assert.match(dox[0].text, /^Now and ever/);
    const last = a2[a2.length - 1];
    assert.match(last.text, /Only-begotten Son/,
      '"Only-begotten Son" must still follow the Now-and-ever');
  });

  it('INV-5: the Glory is never sung twice, and never lost', async () => {
    for (const tr of ['oca', 'st-john-damascus-tyler']) {
      const { a1, ll, a2 } = await sections(tr);
      const all = [...a1, ...ll, ...a2].filter(b => b.type === 'doxology');
      const glories = all.filter(b => /Glory to the Father/.test(b.text || ''));
      assert.equal(glories.length, 1,
        `${tr}: expected exactly one "Glory to the Father" across the antiphons, got ${glories.length}`);
    }
  });
});
