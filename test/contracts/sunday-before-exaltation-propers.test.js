/**
 * Feature contract: Sunday Before the Exaltation + 9-13 Founding of the Church
 * Spec: features/sunday-before-exaltation-propers.md
 *
 * One test per INV-* invariant. Assertions are POSITIONAL (which hymn is
 * first, what follows what under which announcement) — the 2026-09-13 render
 * had the right block shape with the wrong hymns in it, and every count-based
 * check passed. See memory feedback_assert_structure_not_labels.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3106; // distinct: see sibling contract tests for the port ledger (3105 was the last taken)
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

async function liturgy(date, extra = '') {
  const r = await get(`/api/liturgy?date=${date}${extra}`);
  assert.equal(r.status, 200, `${date} status`);
  assert.equal(r.json.date, date);
  return r.json.blocks;
}

const isAnnounce = b => b.type === 'prayer' && /^The reading (from|of) the/.test(b.text || '');
const isRef      = b => b.type === 'rubric' && /^[1-3]? ?[A-Z][a-z]+ \d+\.\d+/.test(b.text || '');

// The Sunday Before the Exaltation in three years — tones 6, 5 (2025-09-07)
// and 4 (2027-09-12) — so the Octoechos pair cannot coincide with the
// Sunday-Before set by accident (in 2026 the Tone-6 prokeimenon text is the
// same; the alleluia is not).
const SUNDAYS_BEFORE = ['2026-09-13', '2025-09-07', '2027-09-12'];

describe('Feature contract: Sunday Before the Exaltation', () => {

  it('INV-1: the FIRST prokeimenon is Tone 6 "O Lord, save Thy people" — not the Octoechos-tone one', async () => {
    for (const date of SUNDAYS_BEFORE) {
      const blocks = await liturgy(date);
      const prok = blocks.filter(b => b.section === 'Prokeimenon' && b.type === 'hymn');
      assert.match(prok[0].text, /^O Lord, save Thy people, and bless Thine inheritance/, `${date} first prokeimenon`);
      assert.equal(prok[0].tone, 6, `${date} prokeimenon tone`);
    }
  });

  it('INV-2: the Alleluia is Tone 1 and its FIRST verse is Ps 88:18b', async () => {
    for (const date of SUNDAYS_BEFORE) {
      const blocks = await liturgy(date);
      const rubric = blocks.find(b => b.section === 'Alleluia' && b.type === 'rubric');
      const verses = blocks.filter(b => b.section === 'Alleluia' && b.type === 'verse');
      assert.match(rubric.text, /Tone 1\b/, `${date} alleluia rubric`);
      assert.match(verses[0].text, /^V\. I have exalted one chosen out of My people/, `${date} first alleluia verse`);
      assert.match(verses[1].text, /^V\. For My hand shall defend him/, `${date} second alleluia verse`);
    }
  });

  it('INV-3: the Sunday-cycle Epistle follows Galatians 6:11-18 under the SAME announcement', async () => {
    for (const date of SUNDAYS_BEFORE) {
      const ep = (await liturgy(date)).filter(b => b.section === 'Epistle Reading');
      const anns = ep.filter(isAnnounce);
      assert.match(anns[0].text, /Galatians/, `${date} first announcement`);
      const galIdx = ep.findIndex(b => isRef(b) && /^Galatians 6\.11-18/.test(b.text));
      assert.ok(galIdx >= 0, `${date} Galatians reference`);
      const after = ep.slice(galIdx + 1);
      const nextRef = after.findIndex(isRef);
      const nextAnn = after.findIndex(isAnnounce);
      assert.ok(nextRef >= 0, `${date} has a continuation pericope`);
      assert.ok(nextAnn < 0 || nextRef < nextAnn, `${date} continuation precedes any second announcement`);
      // The continuation is the cycle reading, not the saint's: it is NOT Galatians
      // and NOT the co-commemorated reading (Hebrews on 9-13).
      assert.doesNotMatch(after[nextRef].text, /^Galatians|^Hebrews/, `${date} continuation is the cycle pericope`);
      // And its text is read, not bracketed as missing.
      assert.equal(after[nextRef + 1].type, 'prayer');
      assert.doesNotMatch(after[nextRef + 1].text, /^\[/, `${date} continuation text present`);
    }
  });

  it('INV-4: the Sunday-cycle Gospel follows John 3:13-17 before the closing "Glory to Thee" and any second announcement', async () => {
    for (const date of SUNDAYS_BEFORE) {
      const g = (await liturgy(date)).filter(b => b.section === 'Gospel Reading');
      const johnIdx = g.findIndex(b => isRef(b) && /^John 3\.13-17/.test(b.text));
      assert.ok(johnIdx >= 0, `${date} John 3:13-17 reference`);
      const after = g.slice(johnIdx + 1);
      const ref = after.findIndex(isRef);
      const ann = after.findIndex(isAnnounce);
      const end = after.findIndex(b => b.type === 'response' && /Glory to Thee, O Lord/.test(b.text));
      assert.ok(ref >= 0, `${date} has a continuation Gospel`);
      assert.ok(ann < 0 || ref < ann, `${date} continuation precedes any second announcement`);
      assert.ok(end >= 0 && ref < end, `${date} continuation precedes the closing Glory to Thee`);
      assert.match(after[ref].text, /^Matthew/, `${date} continuation is the Matthew cycle pericope`);
    }
  });

  it('INV-8: the Sunday AFTER the Exaltation and an ordinary Sunday are untouched', async () => {
    // 2026-09-20, Sunday After — different set; must NOT get the Sunday-Before
    // prokeimenon or a Tone-1 Ps 88 alleluia.
    const after = await liturgy('2026-09-20');
    const verses = after.filter(b => b.section === 'Alleluia' && b.type === 'verse');
    assert.doesNotMatch(verses[0].text, /I have exalted one chosen/, 'Sunday After must not take the Sunday-Before alleluia');
    const ep = after.filter(b => b.section === 'Epistle Reading');
    assert.equal(ep.filter(b => b.id === 'ep-cont-ref').length, 0, 'no continuation outside the detector');
    // 2026-08-30, ordinary Sunday, Tone 4.
    const ord = await liturgy('2026-08-30');
    assert.equal(ord.filter(b => b.id === 'ep-cont-ref' || b.id === 'gos-cont-ref').length, 0);
  });
});

describe('Feature contract: 9-13 Founding of the Church of the Resurrection', () => {

  it('INV-5: Founding troparion after the Resurrection and before the Forefeast; Founding kontakion present', async () => {
    const blocks = await liturgy('2026-09-13');
    const trops = blocks.filter(b => b.section === 'Troparia' && b.type === 'rubric').map(b => b.text);
    const iRes  = trops.findIndex(t => /Resurrection/.test(t));
    const iFnd  = trops.findIndex(t => /Founding of the Church of the Resurrection/.test(t));
    const iFore = trops.findIndex(t => /Forefeast/.test(t));
    assert.ok(iFnd >= 0, 'Founding troparion rendered');
    assert.ok(iRes >= 0 && iRes < iFnd, 'Resurrection troparion first');
    assert.ok(iFore >= 0 && iFnd < iFore, 'Founding before Forefeast');
    const fndTrop = blocks[blocks.findIndex(b => b.section === 'Troparia' && /Founding of the Church/.test(b.text || '')) + 1];
    assert.equal(fndTrop.tone, 4);
    assert.match(fndTrop.text, /^Thou hast revealed the beauty of the holy dwelling place/);
    const konts = blocks.filter(b => b.section === 'Kontakia' && b.type === 'rubric').map(b => b.text);
    assert.ok(konts.some(t => /Founding of the Church of the Resurrection/.test(t)), 'Founding kontakion rendered');
  });

  it('INV-6: Founding prokeimenon, alleluia and koinonikon each follow the day’s', async () => {
    const blocks = await liturgy('2026-09-13');
    const prok = blocks.filter(b => b.section === 'Prokeimenon' && b.type === 'hymn');
    const iP = prok.findIndex(b => /^Holiness befits Thy house, O Lord, forevermore/.test(b.text));
    assert.ok(iP >= 1, 'Founding prokeimenon after the day’s');
    assert.equal(prok[iP].tone, 4);
    const verses = blocks.filter(b => b.section === 'Alleluia' && b.type === 'verse');
    const iA = verses.findIndex(b => /^V\. Thy foundations are in the holy mountains/.test(b.text));
    assert.ok(iA >= 2, 'Founding alleluia after both Sunday-Before verses');
    assert.match(verses[iA + 1].text, /^V\. Glorious things are spoken of thee, O city of God/);
    const comm = blocks.filter(b => b.section === 'Communion Hymn' && b.type === 'hymn' && b.speaker === 'choir');
    assert.match(comm[0].text, /^Praise the Lord from the heavens/);
    assert.match(comm[1].text, /^I have loved the beauty of Thy house, O Lord/);
  });

  it('INV-7: a parish with includeSecondKoinonikon=false sees one koinonikon', async () => {
    const blocks = await liturgy('2026-09-13', '&translation=st-john-damascus-tyler');
    const comm = blocks.filter(b => b.section === 'Communion Hymn' && b.type === 'hymn' && b.speaker === 'choir');
    assert.equal(comm.length, 1);
    // …but still sings the Founding troparion, kontakion, prokeimenon and alleluia.
    assert.ok(blocks.some(b => b.section === 'Troparia' && /Founding of the Church/.test(b.text || '')));
    assert.ok(blocks.some(b => b.section === 'Prokeimenon' && /^Holiness befits/.test(b.text || '')));
  });

  it('INV-5b: 9-13 on a weekday still renders the Founding hymns and second set', async () => {
    // 2027-09-13 is a Monday.
    const blocks = await liturgy('2027-09-13');
    assert.ok(blocks.some(b => b.section === 'Troparia' && /Founding of the Church/.test(b.text || '')), 'troparion');
    assert.ok(blocks.some(b => b.section === 'Prokeimenon' && /^Holiness befits/.test(b.text || '')), 'prokeimenon');
    assert.ok(blocks.some(b => b.section === 'Alleluia' && /Thy foundations are in the holy mountains/.test(b.text || '')), 'alleluia');
  });
});
