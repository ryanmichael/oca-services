/**
 * Regression contract: an Afterfeast must not bury a co-celebrated polyeleos saint
 *
 * Worked example: 2026-08-09, Glorification of St. Herman of Alaska falling
 * inside the Afterfeast of the Transfiguration, on a Sunday.
 *
 * "Afterfeast " matches MOVEABLE_CYCLE_TITLE, so the principal-saint picker
 * pins the Afterfeast row and every rank-driven proper hanging off the saint
 * silently vanishes. Surfaced 2026-08-07 by the weekly LLM judge against
 * reference/orders/2026-0809-order-services.txt, which found the saint absent
 * from Vespers concluding troparia, Liturgy troparia/kontakia, the second
 * prokeimenon/alleluia/koinonikon, and the Lord-I-Call sticheron split.
 *
 * Three distinct mechanisms have to stay wired for this to keep working:
 *   1. calendar/fixed-feasts.js POLYELEOS_SAINTS       — the rank
 *   2. menaion-principal.js PRINCIPAL_OVERRIDES        — the principal rebind
 *   3. stichera order<0 as Now-and-ever, not a numbered slot
 * Break any one and a test below fails.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3093; // distinct from polyeleos (3095), vespers (3094), dev (3000)
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

const HERMAN_TROPARION = /O joyful North Star of the Church of Christ/;
const HERMAN_KONTAKION = /The eternal light of Christ our Savior/;

describe('Regression contract: Afterfeast must not bury a polyeleos saint (8-09 St. Herman)', () => {

  it('INV-1: the day is ranked polyeleos, not sixStichera', () => {
    const { getFeastRank } = require('../../calendar/fixed-feasts');
    assert.equal(getFeastRank(new Date('2026-08-09T12:00:00Z')), 'polyeleos',
      'St. Herman of Alaska must carry polyeleos rank on 8-9');
  });

  it('INV-2: the principal override rebinds away from the Afterfeast', () => {
    const { applyPrincipalOverride } = require('../../server-lib/sources/menaion-principal');
    const candidates = [
      { id: 1603, title: 'Afterfeast of the Transfiguration of our Lord' },
      { id: 1604, title: 'Glorification of Venerable Herman of Alaska, Wonderworker of All America' },
    ];
    const picked = applyPrincipalOverride(8, 9, candidates, candidates[0]);
    assert.equal(picked.id, 1604,
      'the override must rebind 8-9 from the Afterfeast to St. Herman');
  });

  it('INV-3: Saturday Vespers sings St. Herman at the concluding-troparia Glory', async () => {
    // Vespers date-shifts: the civil evening of 8-08 carries 8-09 content.
    const { json } = await get('/api/service?date=2026-08-08&service=vespers');
    const troparia = json.blocks.filter(b => b.section === 'Troparia');
    assert.ok(troparia.some(b => HERMAN_TROPARION.test(b.text || '') && b.tone === 7),
      'St. Herman troparion (Tone 7) must appear in the Vespers concluding troparia');
  });

  it('INV-4: Lord-I-Call gives the saint his own stichera, and the Now-and-ever is not a numbered slot', async () => {
    const { json } = await get('/api/service?date=2026-08-08&service=vespers');
    const hymns = json.blocks.filter(
      b => b.section === 'Lord, I Have Cried' && b.type === 'hymn'
    );
    const tone8 = hymns.filter(h => h.tone === 8);
    assert.equal(tone8.length, 3,
      'all three of St. Herman\'s Tone-8 stichera must be sung, not truncated');

    // "In Thy goodness…" is the Afterfeast's Now-and-ever sticheron (order -1).
    // If it reappears among the numbered hymns, an order<0 filter regressed and
    // it is eating a slot the saint should own.
    const numbered = hymns.slice(0, -2); // exclude Glory + Now
    assert.ok(!numbered.some(h => /In Thy goodness Thou hast sanctified/.test(h.text || '')),
      'the Afterfeast Now-and-ever sticheron must not occupy a numbered slot');
  });

  it('INV-5: aposticha Now-and-ever takes the Feast sticheron, not the Octoechos Theotokion', async () => {
    const { json } = await get('/api/service?date=2026-08-08&service=vespers');
    const apost = json.blocks.filter(b => b.section === 'Aposticha');
    const now = apost[apost.length - 1];
    assert.ok(/Thou wast transfigured in glory on Mount Tabor/.test(now.text || ''),
      'the Afterfeast sticheron (Tone 2) must close the aposticha');
  });

  it('INV-6: Liturgy carries the saint troparion, kontakion, and second propers', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-09');
    const text = json.blocks.map(b => b.text || '').join('\n');

    assert.ok(HERMAN_TROPARION.test(text), 'St. Herman troparion missing from Liturgy');
    assert.ok(HERMAN_KONTAKION.test(text), 'St. Herman kontakion missing from Liturgy');
    assert.ok(/Precious in the sight of the Lord/.test(text),
      'second prokeimenon (Tone 7, St. Herman) missing');
    assert.ok(/Galatians 5[.:]22/.test(text),
      'second epistle (Galatians 5:22-6:2) missing');
    assert.ok(/The righteous shall be in everlasting remembrance/.test(text),
      'second communion hymn missing');
  });

  it('INV-7: the festal megalynarion replaces "It is truly meet" for the whole afterfeast', async () => {
    const MEGALYNARION = /Magnify, O my soul, the Lord Who was transfigured/;
    const TRULY_MEET   = /It is truly meet to bless thee/;

    // Aug 6 (the feast) through Aug 13 (the leavetaking) inclusive; the days on
    // either side must be untouched, so a broadened window fails here.
    for (const date of ['2026-08-06', '2026-08-09', '2026-08-13']) {
      const { json } = await get(`/api/liturgy?date=${date}`);
      const text = json.blocks.map(b => b.text || '').join('\n');
      assert.ok(MEGALYNARION.test(text), `${date} must sing the festal megalynarion`);
      assert.ok(!TRULY_MEET.test(text),  `${date} must not also sing "It is truly meet"`);
    }
    for (const date of ['2026-08-05', '2026-08-14']) {
      const { json } = await get(`/api/liturgy?date=${date}`);
      const text = json.blocks.map(b => b.text || '').join('\n');
      assert.ok(!MEGALYNARION.test(text),
        `${date} is outside the afterfeast and must not sing the megalynarion`);
    }
  });

  it('INV-8: the megalynarion window follows the old calendar too', async () => {
    // Old-style Aug 6-13 is civil Aug 19-26 (13-day Julian offset). A window
    // computed off the raw civil date instead of fixedFeastDate fails here.
    const MEGALYNARION = /Magnify, O my soul, the Lord Who was transfigured/;
    for (const [date, want] of [['2026-08-18', false], ['2026-08-19', true],
                                ['2026-08-26', true],  ['2026-08-27', false]]) {
      const { json } = await get(`/api/liturgy?date=${date}&style=old`);
      const text = json.blocks.map(b => b.text || '').join('\n');
      assert.equal(MEGALYNARION.test(text), want,
        `old-style ${date}: expected megalynarion=${want}`);
    }
  });

  // ── The feast window is not a lesser saint ────────────────────────────────
  // When a saint outranks the afterfeast/forefeast, the feast's own hymns are
  // still sung — the troparion after the Resurrection troparion, the kontakion
  // at "Now and ever…". Before the fix the Vespers Now slot fell back to the
  // Octoechos dismissal Theotokion and the Liturgy Now slot to the generic
  // Kontakion-Theotokion ("Protection of Christians"), and the Feast troparion
  // was dropped from the Liturgy entirely by the includeLesserSaints default.

  const FEAST_TROPARION = /Thou wast [Tt]ransfigured on the Mount/;
  const FEAST_KONTAKION = /On the Mountain Thou wast Transfigured/;

  it('INV-9: Vespers sings the Feast troparion at "Now and ever", not the dismissal Theotokion', async () => {
    // Vespers is date-shifted: 8-08 civil evening carries 8-09 content.
    const { json } = await get('/api/service?date=2026-08-08');
    const troparia = json.blocks.filter(b => /Troparia/i.test(b.section || ''));
    const now = troparia[troparia.length - 1];
    assert.ok(FEAST_TROPARION.test(now.text || ''),
      'the last Troparia block must be the Feast troparion');
    assert.ok(!/Since thou art the treasure of our Resurrection/.test(
      troparia.map(b => b.text || '').join('\n')),
      'the Tone-7 resurrectional dismissal Theotokion must not be sung');
  });

  it('INV-10: Liturgy sings Resurrection → Feast → Saint troparia in that order', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-09');
    const hymns = json.blocks
      .filter(b => /Troparia/i.test(b.section || '') && b.type === 'hymn')
      .map(b => b.text || '');
    assert.equal(hymns.length, 3, 'expected exactly three Liturgy troparia');
    assert.ok(/When the stone had been sealed/.test(hymns[0]), 'first: Resurrection');
    assert.ok(FEAST_TROPARION.test(hymns[1]),                  'second: the Feast');
    assert.ok(/O joyful North Star/.test(hymns[2]),            'third: St. Herman');
  });

  it('INV-11: the Feast kontakion holds the Liturgy "Now and ever", displacing "Protection of Christians"', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-09');
    const kont = json.blocks.filter(b => /Kontakia/i.test(b.section || ''));
    const text = kont.map(b => b.text || '').join('\n');
    assert.ok(!/Protection of Christians that cannot be put to shame/.test(text),
      'the generic Kontakion-Theotokion must yield to the Feast kontakion');
    // …and it must come after the "Now and ever" connector, not before it.
    const nowIdx   = kont.findIndex(b => /^Now and ever/.test(b.text || ''));
    const feastIdx = kont.findIndex(b => FEAST_KONTAKION.test(b.text || ''));
    assert.ok(nowIdx !== -1 && feastIdx > nowIdx,
      'the Feast kontakion must follow the "Now and ever" connector');
    // St. Herman keeps the Glory slot — the Feast must not steal it.
    const gloryIdx  = kont.findIndex(b => /^Glory to the Father/.test(b.text || ''));
    const hermanIdx = kont.findIndex(b => /The eternal light of Christ our Savior/.test(b.text || ''));
    assert.ok(gloryIdx !== -1 && hermanIdx > gloryIdx && hermanIdx < nowIdx,
      'St. Herman must hold the Glory kontakion');
  });

  it('INV-12: an ordinary afterfeast day (feast IS the principal) is untouched', async () => {
    // 8-10 has no saint outranking the window, so the rule must not double-print
    // the Feast troparion/kontakion that the principal loop already emits.
    const { json } = await get('/api/liturgy?date=2026-08-10');
    const trop = json.blocks.filter(b => /Troparia/i.test(b.section || '') && b.type === 'hymn');
    const kont = json.blocks.filter(b => /Kontakia/i.test(b.section || '') && b.type === 'hymn');
    assert.equal(trop.filter(b => FEAST_TROPARION.test(b.text || '')).length, 1,
      'the Feast troparion must be sung exactly once');
    assert.equal(kont.filter(b => FEAST_KONTAKION.test(b.text || '')).length, 1,
      'the Feast kontakion must be sung exactly once');
  });
});
