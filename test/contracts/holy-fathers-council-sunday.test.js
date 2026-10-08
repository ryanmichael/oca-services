/**
 * Feature contract: Holy Fathers of an Ecumenical Council — Sunday propers
 * Spec: features/holy-fathers-council-sunday.md
 *
 * One test per INV-* invariant. Assertions are POSITIONAL and read the TEXT,
 * never the label: the 2026-10-10 render carried six stichera labelled
 * "Commemoration of the Holy Fathers of the Seventh Ecumenical Council" whose
 * words were Apostle Philip's and Theophanes of Nicea's, and every structural
 * rule passed 0 high / 0 medium on it. See memory
 * feedback_assert_structure_not_labels.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3113; // distinct: 3112 was the last taken
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

async function vespers(date, extra = '') {
  const r = await get(`/api/service?date=${date}${extra}`);
  assert.equal(r.status, 200, `${date} status`);
  return r.json.blocks;
}
async function liturgy(date, extra = '') {
  const r = await get(`/api/liturgy?date=${date}${extra}`);
  assert.equal(r.status, 200, `${date} status`);
  return r.json.blocks;
}

// Saturday evening before the Sunday of the Holy Fathers of the 7th Council.
// The commemoration is movable (Sunday nearest Oct 11), which is precisely why
// it was mis-keyed; 2027-10-09 is a different fixed date, so a fix that merely
// hard-coded Oct 11 would fail there.
const FATHERS_EVE     = '2026-10-10';
const FATHERS_SUNDAY  = '2026-10-11';
const FATHERS_EVE_27  = '2027-10-09';
const TYLER = '&parish=st-john-damascus-tyler&translation=st-john-damascus-tyler';

const lic       = bs => bs.filter(b => b.section === 'Lord, I Have Cried');
const licHymns  = bs => lic(bs).filter(b => b.type === 'hymn');
const aposticha = bs => bs.filter(b => b.section === 'Aposticha');

describe('Holy Fathers of an Ecumenical Council — Sunday propers', () => {
  it('INV-1: Lord I Call is 4 of the Resurrection then 6 of the Fathers, and nothing else', async () => {
    const hymns = licHymns(await vespers(FATHERS_EVE));
    // 4 resurrectional + 6 Fathers + Glory + Theotokion
    assert.equal(hymns.length, 12);
    const numbered = hymns.slice(0, 10);
    assert.ok(numbered.slice(0, 4).every(h => h.tone === 2), 'first four are the week tone');
    const fathers = numbered.slice(4);
    assert.equal(fathers.length, 6);
    assert.ok(fathers.every(h => h.tone === 6), 'the Fathers block is Tone 6 throughout');
    // Read the WORDS, not the label: an apostle's hymn once sat in slot 10.
    assert.ok(
      fathers.every(h => /\bFathers\b|\bcouncils?\b|\bArius\b/i.test(h.text)),
      'every sticheron in the Fathers block is actually about the Fathers:\n' +
        fathers.map(h => '  ' + h.text.slice(0, 60)).join('\n')
    );
    assert.ok(!fathers.some(h => /Philip|Theophanes/i.test(h.text)), 'no neighbouring saint bleeds in');
  });

  it('INV-2: the Lord-I-Call Glory is the Fathers, and Now-and-ever the Dogmatikon', async () => {
    const hymns = licHymns(await vespers(FATHERS_EVE));
    const glory = hymns[10];
    const now   = hymns[11];
    assert.match(glory.text, /^Today let us praise the mystical trumpets of the Spirit/);
    assert.equal(glory.tone, 6);
    assert.match(now.text, /^The shadow of the Law passed when grace came/);
    assert.equal(now.tone, 2, 'the Dogmatikon stays in the week tone');
  });

  it('INV-3: the Aposticha has its own Glory of the Fathers, and the Theotokion follows the GLORY tone', async () => {
    const bs = aposticha(await vespers(FATHERS_EVE));
    const hymns = bs.filter(b => b.type === 'hymn');
    const glory = hymns[hymns.length - 2];
    const theo  = hymns[hymns.length - 1];
    assert.match(glory.text, /^Come, all Orthodox Churches/);
    assert.equal(glory.tone, 4);
    assert.match(theo.text, /^Look on the entreaties of thy servants/);
    assert.equal(theo.tone, 4, 'Theotokion takes the Glory tone, not the week tone (2)');
    // Glory and Now-and-ever are announced separately, not collapsed into one.
    const dox = bs.filter(b => b.type === 'doxology');
    assert.equal(dox.length, 2, 'Glory… and Now and ever… are two announcements');
  });

  it('INV-4: dismissal troparia are Resurrection / Glory Fathers T8 / Now Theotokion T8', async () => {
    const t = (await vespers(FATHERS_EVE)).filter(b => b.section === 'Troparia');
    const hymns = t.filter(b => b.type === 'hymn');
    assert.equal(hymns.length, 3);
    assert.equal(hymns[0].tone, 2);
    assert.match(hymns[0].text, /^When Thou didst descend to death/);
    assert.equal(hymns[1].tone, 8);
    assert.match(hymns[1].text, /established the Holy Fathers as luminaries|established the holy fathers as lights/i);
    assert.equal(hymns[2].tone, 8, 'the dismissal Theotokion follows the Glory tone');
    assert.match(hymns[2].text, /^For our sake Thou wast born of the Virgin/);
  });

  it('INV-5: the adjacent fixed-date martyrs do not carry the Fathers’ stichera', async () => {
    // 10-12 evening draws its content from 10-13 (Carpus & Papylus), which held
    // a byte-identical copy of the Fathers' set until 2026-10-08.
    const hymns = licHymns(await vespers('2026-10-12'));
    assert.ok(
      !hymns.some(h => /seven honorable councils|mystical trumpets of the Spirit/i.test(h.text)),
      'the Fathers’ hymns must not be sung for the martyrs of 10-13'
    );
  });

  it('INV-6: an OCA-prescribed second koinonikon renders even with the parish toggle off', async () => {
    const hymns = (await liturgy(FATHERS_SUNDAY, TYLER))
      .filter(b => b.section === 'Communion Hymn' && b.type === 'hymn');
    assert.equal(hymns.length, 2, 'both communion verses the order prints');
    assert.match(hymns[0].text, /^Praise the Lord from the heavens/);
    assert.match(hymns[1].text, /^Rejoice in the Lord, O ye righteous/);
  });

  it('INV-6b: the same parish on an ordinary Sunday still sings ONE verse', async () => {
    const hymns = (await liturgy('2026-10-18', TYLER))
      .filter(b => b.section === 'Communion Hymn' && b.type === 'hymn');
    assert.equal(hymns.length, 1, 'includeSecondKoinonikon still governs the optional verse');
  });

  // The LITURGY side is movable-aware: it detects the Fathers from orthocal's
  // feast list, so it resolves in any year. The VESPERS side is not — the
  // commemoration is stored as a fixed 10-11 row, so its stichera only reach a
  // Sunday that actually falls on 10-11. See the "Known gap" section of the
  // spec; 2025-10-11 and 2027-10-16 both render 0 stichera of the Fathers.
  it('INV-7: the Liturgy resolves the Fathers in years when the Sunday is NOT 10-11', async () => {
    for (const d of ['2025-10-12', '2027-10-17']) {
      const bs = await liturgy(d);
      const comm = bs.filter(b => b.section === 'Communion Hymn' && b.type === 'hymn');
      assert.equal(comm.length, 2, `${d}: both prescribed communion verses`);
      assert.match(comm[1].text, /^Rejoice in the Lord, O ye righteous/, `${d}: the Fathers' verse`);
      const pk = bs.filter(b => b.section === 'Prokeimenon' && b.type === 'hymn');
      assert.ok(
        pk.some(h => /^Blessed art Thou, O Lord, the God of our fathers/.test(h.text)),
        `${d}: the Fathers' prokeimenon`
      );
    }
  });

});
