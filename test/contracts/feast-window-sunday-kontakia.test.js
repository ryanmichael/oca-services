/**
 * Feature contract: a Sunday inside a feast window, with and without a
 * co-celebrated saint
 *
 * Worked example: 2026-08-16, the Translation of the Image Not-Made-by-Hands
 * falling on a Sunday inside the Afterfeast of the Dormition.
 *
 * The window's own hymns claim "Now and ever…" — that much was already true
 * when the window was a NOTABLE commemoration (`feastCycleComm`, which
 * deliberately excludes the principal). It was not true when the window WAS the
 * principal, which is the ordinary case on an afterfeast Sunday. There the
 * Sunday-kontakia restructure found no feastCycle kontakion, handed "Now and
 * ever…" to the generic Kontakion-Theotokion, and dropped the window's
 * kontakion off the end entirely.
 *
 * Two OCA order documents settle the shape independently:
 *
 *   reference/orders/2026-0823-order-services.txt  (Leavetaking of the Dormition)
 *     Glory… Kontakion of the Resurrection, Tone 3
 *     Now and ever… Kontakion of the Feast, Tone 2
 *
 *   reference/orders/2026-0816-order-services.txt  (the Image)
 *     Troparion of the Resurrection / of the Image / of the Feast
 *     Kontakion of the Resurrection
 *     Glory… Kontakion of the Image, Tone 2
 *     Now and ever… Kontakion of the Feast, Tone 2
 *
 * Neither prints a Kontakion-Theotokion. Surfaced 2026-08-09 by the weekly
 * judge, which reported seven high-severity findings on the 8-16 Liturgy.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3099;
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
  await waitForServer();
});

after(() => { if (serverProcess) serverProcess.kill(); });

/** Rubric + connector lines of a section, in order. */
const linesOf = (blocks, section) => blocks
  .filter(b => b.section === section && (b.type === 'rubric' || b.type === 'doxology'))
  .map(b => b.text || '');

const GLORY = /^Glory to the Father/;
const NOW   = /^Now and ever/;

describe('Feature contract: feast-window Sunday troparia and kontakia', () => {

  it('INV-1: 8-16 troparia read Resurrection, Image, Feast', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-16&format=json');
    const lines = linesOf(json.blocks, 'Troparia');
    assert.match(lines[0], /Troparion of the Resurrection/);
    assert.match(lines[1], /Image Not-Made-by-Hands/,
      'the co-celebrated saint goes IN FRONT of the window, which is sung last');
    assert.match(lines[2], /Afterfeast of the Dormition/);
  });

  it('INV-2: 8-16 kontakia are Resurrection, Glory… Image, Now and ever… Feast', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-16&format=json');
    const lines = linesOf(json.blocks, 'Kontakia');
    assert.match(lines[0], /Kontakion of the Resurrection/);
    assert.match(lines[1], GLORY);
    assert.match(lines[2], /Image Not-Made-by-Hands/);
    assert.match(lines[3], NOW);
    assert.match(lines[4], /Afterfeast of the Dormition/);
  });

  it('INV-3: the window kontakion is never displaced by the Kontakion-Theotokion', async () => {
    // The exact regression: the generic "Protection of Christians…" took
    // "Now and ever…" and the Dormition kontakion vanished from the service.
    for (const date of ['2026-08-16', '2026-08-23', '2026-09-20', '2026-11-22']) {
      const { json } = await get(`/api/liturgy?date=${date}&format=json`);
      const lines = linesOf(json.blocks, 'Kontakia');
      const nowIdx = lines.findIndex(l => NOW.test(l));
      assert.ok(nowIdx >= 0, `${date}: no "Now and ever…" in the kontakia`);
      assert.doesNotMatch(lines[nowIdx + 1] || '', /Kontakion-Theotokion/,
        `${date}: the Theotokion-Kontakion took the slot the feast window owns`);
      assert.match(lines[nowIdx + 1] || '',
        /Afterfeast|Leavetaking|Forefeast|Midfeast|Postfeast/,
        `${date}: "Now and ever…" must be followed by the feast window's kontakion`);
    }
  });

  it('INV-4: 8-23 puts the Resurrection kontakion at "Glory…" when nothing else claims it', async () => {
    // Verbatim from reference/orders/2026-0823-order-services.txt.
    const { json } = await get('/api/liturgy?date=2026-08-23&format=json');
    const lines = linesOf(json.blocks, 'Kontakia');
    assert.match(lines[0], GLORY);
    assert.match(lines[1], /Kontakion of the Resurrection/);
    assert.match(lines[2], NOW);
    assert.match(lines[3], /Leavetaking of the Dormition/);
  });

  it('INV-5: the Dormition megalynarion runs the whole afterfeast, not just Aug 15', async () => {
    for (const date of ['2026-08-16', '2026-08-23']) {
      const { json } = await get(`/api/liturgy?date=${date}&format=json`);
      const text = json.blocks
        .filter(b => /Hymn to the Theotokos/i.test(b.section || ''))
        .map(b => b.text || '').join(' ');
      assert.match(text, /The Angels, as they looked upon the Dormition/, date);
      assert.match(text, /The limits of nature are overcome/,
        `${date}: the OCA order prints BOTH halves under "Instead of It is truly meet"`);
      assert.doesNotMatch(text, /It is truly meet to bless thee/, date);
    }
  });

  it('INV-6: the Image communion hymn renders without an opt-in', async () => {
    // The OCA order PRINTS both communion verses for 8-16, so this one is
    // prescribed rather than the opt-in extra a cocelebrated overlay usually
    // carries — hence `prescribed: true` on the overlay entry.
    const { json } = await get('/api/liturgy?date=2026-08-16&format=json');
    const text = json.blocks
      .filter(b => /Communion Hymn/i.test(b.section || '') && b.type === 'hymn')
      .map(b => b.text || '').join(' ');
    assert.match(text, /Praise the Lord from the heavens/);
    assert.match(text, /we shall walk in the light of Thy countenance/,
      'the Image communion verse is prescribed by the order, not optional');
  });

  it('INV-7: an ordinary Sunday outside any window still ends with the Theotokion', async () => {
    // Guard against the fix leaking: 2026-06-21 is a plain Sunday, where the
    // generic Kontakion-Theotokion legitimately holds "Now and ever…".
    const { json } = await get('/api/liturgy?date=2026-06-21&format=json');
    const lines = linesOf(json.blocks, 'Kontakia');
    const nowIdx = lines.findIndex(l => NOW.test(l));
    assert.ok(nowIdx >= 0);
    assert.match(lines[nowIdx + 1] || '', /Kontakion-Theotokion/);
  });
});

describe('Feature contract: a ranked saint co-commemorated with a feast window', () => {

  // 8-13 (Leavetaking of the Transfiguration + St Tikhon of Zadonsk) and 9-21
  // (Leavetaking of the Elevation + Apostle Quadratus) are the two B! findings
  // from the 2026-08-08 rank sweep that a PRINCIPAL_OVERRIDES entry could not
  // fix: neither saint has stichera, so rebinding the principal would swap the
  // feast's proper stichera for General-Menaion generics. Their troparia and
  // kontakia were in the DB the whole time and rendered nowhere.

  it('INV-8: 8-13 sings St Tikhon before the Leavetaking', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-13&format=json');
    const trop = linesOf(json.blocks, 'Troparia').filter(l => /^Troparion/.test(l));
    assert.match(trop[0], /Tikhon/, 'the saint is sung first');
    assert.match(trop[1], /Leavetaking of the Transfiguration/,
      'the feast window is sung last — it holds "Now and ever…"');
    const kont = linesOf(json.blocks, 'Kontakia').filter(l => /^Kontakion/.test(l));
    assert.match(kont[0], /Tikhon/);
    assert.match(kont[1], /Leavetaking of the Transfiguration/);
  });

  it('INV-9: 9-21 sings Apostle Quadratus, and invents no kontakion he lacks', async () => {
    const { json } = await get('/api/liturgy?date=2026-09-21&format=json');
    const trop = linesOf(json.blocks, 'Troparia').filter(l => /^Troparion/.test(l));
    assert.match(trop[0], /Quadratus/);
    assert.match(trop[1], /Leavetaking of the Elevation/);
    // Quadratus has a troparion in the DB but no kontakion. Rendering only what
    // exists is the contract; a fabricated kontakion would be worse than none.
    const kont = linesOf(json.blocks, 'Kontakia').filter(l => /^Kontakion/.test(l));
    assert.equal(kont.length, 1);
    assert.match(kont[0], /Leavetaking of the Elevation/);
  });

  it('INV-11: 8-16 sings the Image\'s second prokeimenon and alleluia', async () => {
    // The order appoints two of each: Resurrection Tone 2, then the Image
    // Tone 4. Until 2026-08-15 only the Sunday pair rendered, because the OCA
    // order names the Image's by incipit alone ("Sing to the Lord a new
    // song…") and no fuller text was on hand. The text now comes from the AT
    // LITURGY section of the St Sergius menaion, the same book as the Image's
    // troparion and kontakion.
    const { json } = await get('/api/liturgy?date=2026-08-16&format=json');

    const prok = json.blocks.filter(b => b.section === 'Prokeimenon');
    const prokSung = prok.filter(b => b.type === 'hymn');
    assert.ok(prokSung.some(b => b.tone === 2), 'the Sunday Tone 2 prokeimenon still leads');
    const image = prokSung.find(b => b.tone === 4);
    assert.ok(image, 'the Image\'s Tone 4 prokeimenon is sung');
    assert.match(image.text, /new song/,
      'and it is the "new song" text the order names — NOT the Matins ' +
      'prokeimenon, which is a different verse in the same tone');

    const all = json.blocks.filter(b => b.section === 'Alleluia');
    assert.ok(all.some(b => /^Tone 4/.test(b.text || '') && b.type === 'rubric'),
      'the Image\'s Tone 4 alleluia is announced');
    assert.ok(all.some(b => b.type === 'verse' && /light of Thy face/.test(b.text || '')),
      'and its verse is sung');
  });

  it('INV-10: the co-commemoration list does not leak to other window dates', async () => {
    // 8-12 is inside the same Transfiguration window with no listed saint; it
    // must still render the feast alone.
    const { json } = await get('/api/liturgy?date=2026-08-12&format=json');
    const trop = linesOf(json.blocks, 'Troparia').filter(l => /^Troparion/.test(l));
    assert.ok(trop.every(l => !/Tikhon/.test(l)),
      'a co-commemoration bled onto a neighbouring date in the same window');
  });
});
