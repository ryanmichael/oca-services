'use strict';

/**
 * Feature contract: Nov 15 sings the Martyrs of Edessa, in a ten-slot ladder.
 *
 * Found 2026-11-12 reviewing the choir packet for Great Vespers of 11-14.
 * Two defects in one service, neither of which any check caught.
 *
 * 1. WRONG SAINT. Orthocal's `saints[]` for 11-15 reads ['Begin Nativity Fast',
 *    'Our Venerable Father Paisius Velichkovsky'] and omits the Martyrs
 *    ENTIRELY — identically in all four vendored years. The principal picker
 *    keeps our default only when it appears somewhere in orthocal's pool, so it
 *    rebound to Paisius, who has a troparion but NO stichera and a saint_type.
 *    The sticheraData chain then skipped its donor branch (gated on
 *    `!primary.saint_type`) and fell through to the General Menaion MONASTIC
 *    set: four generic Tone 8 hymns under Paisius's name, while commemoration
 *    2342's own proper Tone 4 stichera sat unused in the same database.
 *
 *    That gate is NOT a bug and is deliberately left alone — singing
 *    category-appropriate generics for the right principal beats borrowing
 *    another saint's propers. The defect was purely WHICH saint led.
 *
 * 2. ONE STICHERON SHORT. reference/orders/2026-1115-order-services.txt
 *    appoints "7 stichera of the Resurrection, Tone 7"; the base Octoechos
 *    holds six, so `licNoLeadingRepeat` capped the ladder at nine and every
 *    verse number sat one slot late — the packet's (10) was our v9.
 *
 * The invariants assert POSITION and CONTENT, never the label: a label check
 * passes while generic hymns are sung under the right saint's name, which is
 * exactly what shipped.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3142; // unique across the suite — enforced by port-ledger.test.js
const TYLER = '&translation=st-john-damascus-tyler';
const EVE = '/api/service?date=2026-11-14&service=vespers';

function get(u) {
  return new Promise((res, rej) => {
    http.get(`http://localhost:${PORT}${u}`, (r) => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} res(j); });
    }).on('error', rej);
  });
}
async function waitForServer(maxMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try { await get('/'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
}
let serverProcess;
before(async () => {
  serverProcess = spawn('node', ['server.js'],
    { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await waitForServer();
});
after(() => { if (serverProcess) serverProcess.kill(); });

const blocks = async (u) => (await get(u)).blocks;
const lic = (bs) => bs.filter(b => /^lic-hymn-v\d+$/.test(b.id));

// The General Menaion monastic set that WAS being sung. Its presence is the
// defect's fingerprint.
const GENERIC_MONASTIC = /A holy, precious, divine and luminous lamp/i;

describe('Feature contract: Nov 15, the Martyrs of Edessa', () => {

  it('INV-1: the Menaion stichera are the Martyrs\' own, not General Menaion', async () => {
    // FALSIFIED BY: removing ['11-15','Gurias'] from PRINCIPAL_OVERRIDES — the
    // generic monastic set returns and both assertions flip.
    const men = lic(await blocks(EVE + TYLER)).filter(b => b.source === 'menaion');
    assert.equal(men.length, 3, 'the order appoints 3 stichera of the Martyrs');
    for (const b of men) {
      assert.equal(b.tone, 4, 'Tone 4 for the Martyrs, per the order and the packet');
      assert.doesNotMatch(b.text, GENERIC_MONASTIC,
        'a General Menaion generic is being sung in a proper sticheron slot');
    }
    assert.match(men.map(b => b.text).join(' '), /Abibus|Samonas|Gurias/,
      'the Martyrs must be named in their own stichera');
  });

  it('INV-2: the Glory is the Martyrs\' Tone 2 doxastikon', async () => {
    // "Glory... Martyrs, Tone 2" — order line 21, and packet p.5.
    const g = (await blocks(EVE + TYLER)).find(b => b.id === 'lic-glory-hymn');
    assert.ok(g, 'a Glory must be sung');
    assert.equal(g.tone, 2);
    assert.match(g.text, /^Edessa rejoice/i, 'the Martyrs\' own doxastikon');
  });

  it('INV-3: the ladder is TEN slots, 7 Resurrection + 3 Martyrs', async () => {
    // Position, not count alone: the first sticheron must sit at verse 10. When
    // the ladder was nine, every hymn sat one verse late with the right
    // membership and the right order — invisible to a count check.
    // FALSIFIED BY: dropping the 7th hymn from the parish Octoechos overlay.
    const bs = await blocks(EVE + TYLER);
    const hymns = lic(bs);
    assert.equal(hymns.length, 10, 'the order appoints ten');
    assert.equal(hymns.filter(b => b.source === 'octoechos').length, 7);
    assert.equal(hymns.filter(b => b.source === 'menaion').length, 3);

    const verses = bs.filter(b => /^lic-verse-\d+$/.test(b.id));
    assert.match(verses[0].text, /\(10\)/, 'the ladder must START at verse 10');
    assert.match(hymns[0].text, /^Come, let us rejoice in the Lord/,
      'and the first Resurrection sticheron must sit on it');
  });

  it('INV-4: the seven Resurrection stichera are DISTINCT for the parish', async () => {
    // The parish sets licNoLeadingRepeat, so filling seven slots by repeating
    // the first is exactly what it forbids. Before the 7th was sourced, the
    // ladder shrank to nine instead.
    const res = lic(await blocks(EVE + TYLER)).filter(b => b.source === 'octoechos');
    const seen = new Set(res.map(b => b.text.slice(0, 60)));
    assert.equal(seen.size, 7, 'no Resurrection sticheron may be repeated');
    assert.match(res[6].text, /^You were placed in the tomb/,
      'the seventh is the one the base Octoechos does not hold');
  });

  it('INV-5: the OCA base also sings the Martyrs', async () => {
    // The principal override is NOT parish-scoped, and should not be: orthocal
    // omits the Martyrs for everyone, not just Tyler.
    const bs = await blocks(EVE);
    const g = bs.find(b => b.id === 'lic-glory-hymn');
    assert.match(g.text, /^Edessa rejoice/i);
    assert.doesNotMatch(lic(bs).map(b => b.text).join(' '), GENERIC_MONASTIC);
  });
});
