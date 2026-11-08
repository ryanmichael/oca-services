'use strict';

/**
 * Feature contract: "Blessed is the Man" ends with the closing Alleluia, in
 * BOTH doxology forms, immediately before the Little Litany.
 *
 * A parishioner reported it missing at Great Vespers on 2026-11-07: before the
 * Little Litany the choir sang
 *
 *     Alleluia, alleluia, alleluia. Glory to Thee, O God.   (thrice)
 *
 * and our sheet did not have it. The block existed, but lived inside the
 * `else` of the doxology branch in assemblers/vespers-parts/kathisma.js, so
 * only the COMBINED "Glory…now and ever" form emitted it. Any parish whose
 * overlay supplies `gloryOnly`/`nowOnly` — HTM-Boston and Jordanville, which
 * is St John of Damascus (Tyler) — lost it silently. The split-doxology
 * overlay was authored to ADD the split form and removed this with it: another
 * variant REPLACING where it meant to select.
 *
 * Nothing guarded it before: grepping test/ and audit/ for
 * `kathisma-final-alleluia` or `finalAlleluia` returned nothing, which is why
 * an audit that reports 0/0/0 on this date never saw it.
 *
 * These invariants assert the POSITION — last block of the Kathisma section,
 * and the block the Little Litany follows — rather than mere presence. A
 * presence check passes if the block is emitted in the wrong place, and the
 * wrong place is exactly what a listener notices.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3127; // distinct from every other contract test and dev 3000
const TYLER = '&translation=st-john-damascus-tyler';

const { assembleBlessedIsTheMan } =
  require(path.join(ROOT, 'assemblers', 'vespers-parts', 'kathisma.js'));

/** Minimal fixed-texts for the assembler: the two doxology shapes. */
function fixtures(split) {
  const k = {
    refrain: 'Alleluia, alleluia, alleluia.',
    verses: ['Blessed is the man who walketh not in the counsel of the ungodly.'],
  };
  if (split) { k.gloryOnly = 'Glory to the Father, and to the Son, and to the Holy Spirit.';
               k.nowOnly   = 'Both now and ever and unto ages of ages. Amen.'; }
  else       { k.gloryNow  = 'Glory to the Father…now and ever and unto ages of ages. Amen.'; }
  return { kathisma: { blessedIsTheMan: k },
           responses: { alleluiaThrice: 'Alleluia, alleluia, alleluia, glory to Thee, O God.\n'.repeat(3).trim() } };
}

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (_) {} resolve({ json }); });
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

let serverProcess;
before(async () => {
  serverProcess = spawn('node', ['server.js'],
    { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await waitForServer();
});
after(() => { if (serverProcess) serverProcess.kill(); });

// A Saturday evening: Great Vespers, where Kathisma I is SUNG.
const SAT = '/api/service?date=2026-11-07&service=vespers';
const FULL = /glory to Thee, O God/i;

describe('Feature contract: the Kathisma closing Alleluia', () => {

  it('INV-1: the COMBINED doxology ends with the closing Alleluia', () => {
    // FALSIFIED BY: moving the push back inside the `else` — this still passes,
    // which is exactly why INV-2 exists and why presence alone is not enough.
    const blocks = assembleBlessedIsTheMan(fixtures(false));
    const last = blocks[blocks.length - 1];
    assert.equal(last.id, 'kathisma-final-alleluia', 'it must be the LAST block');
    assert.match(last.text, FULL);
  });

  it('INV-2: the SPLIT doxology ends with it too — the reported defect', () => {
    // FALSIFIED BY: returning the push to the `else` branch. This is the test
    // that would have caught 2026-11-07.
    const blocks = assembleBlessedIsTheMan(fixtures(true));
    const last = blocks[blocks.length - 1];
    assert.equal(last.id, 'kathisma-final-alleluia',
      'the split-doxology form dropped the closing Alleluia; it must be the LAST block here too');
    assert.match(last.text, FULL);
  });

  it('INV-3: it is NOT the short between-verses refrain', () => {
    // The two are easy to confuse — the bug hid behind a trailing
    // "Alleluia, alleluia, alleluia." that looked like the closing one.
    const blocks = assembleBlessedIsTheMan(fixtures(true));
    const last = blocks[blocks.length - 1];
    const refrain = fixtures(true).kathisma.blessedIsTheMan.refrain;
    assert.notEqual(last.text, refrain, 'the closing form is the LONGER one, sung thrice');
    assert.equal((last.text.match(/Alleluia, alleluia, alleluia/g) || []).length, 3, 'thrice');
    // And the short refrain still closes each half of the split doxology.
    assert.ok(blocks.some(b => b.id === 'kathisma-now-refrain' && b.text === refrain));
  });

  it('INV-4: in a real service the Little Litany follows it directly — base', async () => {
    const blocks = (await get(SAT)).json.blocks;
    assertSeam(blocks, 'base OCA');
  });

  it('INV-5: …and for a split-doxology parish, which is where it was lost', async () => {
    const blocks = (await get(SAT + TYLER)).json.blocks;
    assertSeam(blocks, 'st-john-damascus-tyler');
  });
});

/** POSITION, not presence: the last Kathisma-section block is the closing
 *  Alleluia, and the very next block begins the Little Litany. */
function assertSeam(blocks, who) {
  const kath = blocks.filter(b => b.section === 'Kathisma');
  assert.ok(kath.length, `${who}: no Kathisma section at all`);
  const last = kath[kath.length - 1];
  assert.equal(last.id, 'kathisma-final-alleluia',
    `${who}: the Kathisma must END with the closing Alleluia, not ${last.id}`);
  assert.match(last.text, FULL, `${who}: wrong text in the closing slot`);

  const i = blocks.indexOf(last);
  const next = blocks[i + 1];
  assert.ok(next, `${who}: nothing follows the Kathisma`);
  assert.match(next.id, /^ll-/,
    `${who}: the Little Litany must follow the closing Alleluia directly, got ${next.id}`);
}
