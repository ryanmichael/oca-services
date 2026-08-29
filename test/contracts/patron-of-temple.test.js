/**
 * Feature contract: Patron of Temple
 * Spec: features/patron-of-temple.md
 *
 * One test per INV-* invariant. If you change patron-of-temple behavior,
 * update both the feature file (behavior table + INV list) and these tests
 * in the same commit.
 *
 * Run: node --test test/contracts/patron-of-temple.test.js
 *      npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3098; // distinct from smoke (3099) and dev (3000)
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
const PATRON_TITLE = 'Venerable John of Damascus';

/** Return the ordered list of "label" rubric blocks within a section. */
function rubricLabelsIn(blocks, section) {
  return blocks
    .filter(b => b.section === section && /^(Troparion|Kontakion) of /.test(b.text || ''))
    .map(b => b.text);
}

function hymnBlocksIn(blocks, section) {
  return blocks.filter(b => b.section === section && b.type === 'hymn');
}

function findGloryIndex(blocks, section) {
  return blocks.findIndex(b => b.section === section && /^Glory to the Father/.test(b.text || ''));
}

function findNowIndex(blocks, section) {
  return blocks.findIndex(b => b.section === section && /^Now and ever/.test(b.text || ''));
}

// ── Contract tests ────────────────────────────────────────────────────────

describe('Feature contract: Patron of Temple', () => {

  it('INV-1: Sunday troparia order is Resurrection → Patron → Saint', async () => {
    // 2026-06-21 — Martyr Julian of Tarsus (OCA principal; simple-rank).
    const { json } = await get(`/api/liturgy?date=2026-06-21&translation=${TYLER}`);
    const labels = rubricLabelsIn(json.blocks, 'Troparia');

    const resIdx    = labels.findIndex(l => /Troparion of the Resurrection/.test(l));
    const patronIdx = labels.findIndex(l => l.includes(`Patron of the Temple, ${PATRON_TITLE}`));
    const saintIdx  = labels.findIndex(l => /Martyr Julian of Tarsus/.test(l));

    assert.ok(resIdx >= 0,    'expected Resurrection troparion rubric');
    assert.ok(patronIdx >= 0, 'expected Patron-of-Temple troparion rubric');
    assert.ok(saintIdx >= 0,  'expected day-saint troparion rubric');
    assert.ok(resIdx < patronIdx, `Resurrection (${resIdx}) must precede Patron (${patronIdx})`);
    assert.ok(patronIdx < saintIdx, `Patron (${patronIdx}) must precede Saint (${saintIdx})`);
  });

  it('INV-2: simple-rank Sunday — the day-saint kontakion takes Glory; patron kontakion above without connector; Now is Theotokion-Kontakion', async () => {
    // 2026-06-21 — Martyr Julian of Tarsus, no cocelebrated overlay.
    //
    // This assertion was inverted until 2026-08-29 (patron at Glory, saint
    // above). `reference/orders/2026-0621-order-services.txt` — the order for
    // this very fixture date — reads:
    //
    //   Kontakion of the Resurrection, Tone 2
    //   Kontakion of the Church (if of Patron Saint)
    //   Glory… Kontakion of St. Julian, Tone 2
    //   Now and ever… Kontakion of the Church (if of Theotokos), or
    //     "Steadfast Protectress…", Tone 6
    //
    // Archive-wide: 101 orders print the Church kontakion before the Glory,
    // 17 print it AT the Glory, and all 17 of those have no other day
    // kontakion competing for the slot.
    const { json } = await get(`/api/liturgy?date=2026-06-21&translation=${TYLER}`);
    const ks = json.blocks.filter(b => b.section === 'Kontakia');

    const gloryIdx = findGloryIndex(ks, 'Kontakia');
    const nowIdx   = findNowIndex(ks, 'Kontakia');
    assert.ok(gloryIdx >= 0, 'expected Glory connector in Kontakia');
    assert.ok(nowIdx > gloryIdx, 'expected Now connector after Glory in Kontakia');

    // Block immediately AFTER the Glory connector is the day-saint kontakion.
    const afterGloryLabel = ks[gloryIdx + 1]?.text || '';
    assert.match(afterGloryLabel, /Kontakion of Martyr Julian of Tarsus/,
      `expected Julian kontakion at Glory slot; got: ${afterGloryLabel}`);

    // Block immediately AFTER the Now connector is the Theotokion-Kontakion rubric label.
    const afterNowLabel = ks[nowIdx + 1]?.text || '';
    assert.match(afterNowLabel, /Kontakion-Theotokion/,
      `expected Kontakion-Theotokion at Now slot; got: ${afterNowLabel}`);

    // The patron kontakion appears BEFORE the Glory connector — read but not
    // Glory-tagged — and AFTER the Resurrection kontakion.
    const beforeGlory = ks.slice(0, gloryIdx).map(b => b.text || '');
    const patronIdx = beforeGlory.findIndex(t =>
      t.includes(`Kontakion of the Patron of the Temple, ${PATRON_TITLE}`));
    const resIdx    = beforeGlory.findIndex(t => /Kontakion of the Resurrection/.test(t));
    assert.ok(patronIdx >= 0, `expected patron kontakion above Glory; got: ${beforeGlory.join(' | ')}`);
    assert.ok(resIdx >= 0 && resIdx < patronIdx,
      `Resurrection kontakion (${resIdx}) must precede the patron (${patronIdx})`);
  });

  it('INV-3: principal-feast Sunday (cocelebrated overlay) — saint kontakion takes Glory; patron kontakion dropped', async () => {
    // 2026-06-14 — Synaxis of All Saints of North America (has cocelebrated-overlay entry).
    const { json } = await get(`/api/liturgy?date=2026-06-14&translation=${TYLER}`);
    const ks = json.blocks.filter(b => b.section === 'Kontakia');

    const gloryIdx = findGloryIndex(ks, 'Kontakia');
    const nowIdx   = findNowIndex(ks, 'Kontakia');
    assert.ok(gloryIdx >= 0, 'expected Glory in Kontakia');
    assert.ok(nowIdx > gloryIdx, 'expected Now after Glory');

    const afterGloryLabel = ks[gloryIdx + 1]?.text || '';
    assert.match(afterGloryLabel, /Saints of North America/,
      `expected NA-Saints kontakion at Glory; got: ${afterGloryLabel}`);

    // Patron kontakion must NOT appear anywhere in Kontakia section.
    const patronInKontakia = ks.find(b => /Patron of the Temple, Venerable John of Damascus/.test(b.text || ''));
    assert.equal(patronInKontakia, undefined,
      'patron kontakion must be dropped on a principal-feast Sunday');

    // Theotokion-Kontakion still closes.
    const afterNowLabel = ks[nowIdx + 1]?.text || '';
    assert.match(afterNowLabel, /Kontakion-Theotokion/, 'expected Theotokion-Kontakion at Now slot');
  });

  it('INV-4: feastOnly Sunday — patron logic skipped entirely (no patron troparion or kontakion)', async () => {
    // 2026-04-12 — Pascha. feastOnly: true; feast claims all hymn slots.
    const { json } = await get(`/api/liturgy?date=2026-04-12&translation=${TYLER}`);
    if (!json || !Array.isArray(json.blocks)) {
      // Pascha may route through a paschal-specific endpoint; if /api/liturgy
      // returns no blocks, the contract is vacuously satisfied for THIS route.
      // Document via assertion message rather than silently passing.
      assert.fail('Pascha /api/liturgy returned no blocks; reconsider INV-4 fixture date');
    }
    const hasPatronAnywhere = json.blocks.some(b =>
      /Patron of the Temple, Venerable John of Damascus/.test(b.text || ''));
    assert.equal(hasPatronAnywhere, false,
      'patron troparion/kontakion must not appear on a feastOnly day');
  });

  it('INV-5: no parish overlay — no patron blocks (baseline regression check)', async () => {
    // 2026-06-21 — same simple-rank date, but no translation overlay.
    const { json } = await get('/api/liturgy?date=2026-06-21');
    const hasPatronAnywhere = json.blocks.some(b =>
      /Patron of the Temple/.test(b.text || ''));
    assert.equal(hasPatronAnywhere, false,
      'no parish overlay should yield no patron-of-temple blocks');
  });
});
