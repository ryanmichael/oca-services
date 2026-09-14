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

async function vespers(date, extra = '') {
  const r = await get(`/api/service?date=${date}${extra}`);
  assert.equal(r.status, 200, `${date} status`);
  assert.equal(r.json.date, date);
  assert.equal(r.json.serviceType, 'greatVespers', `${date} serviceType`);
  return r.json.blocks;
}

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

// Ordered hymn+doxology stream of a section, so position can be asserted.
const stream = (blocks, sec) => blocks.filter(b => b.section === sec && (b.type === 'hymn' || b.type === 'doxology'));
const isGloryOnly = b => b.type === 'doxology' && /^Glory to the Father/.test(b.text) && !/now and ever/i.test(b.text);
const isNow       = b => b.type === 'doxology' && /now and ever/i.test(b.text);

describe('Feature contract: 9-12 eve Great Vespers (Forefeast + Founding)', () => {

  it('INV-9: Lord I Call — 3 Founding (T6) then 3 Forefeast "Rejoice" (T5), Glory Founding, Now Dogmatikon', async () => {
    const lic = stream(await vespers('2026-09-12'), 'Lord, I Have Cried');
    const hymns = lic.filter(b => b.type === 'hymn');
    const texts = hymns.map(b => b.text);
    const fnd  = texts.map((t, i) => /^(Dedication is to be honored|Be dedicated anew|O Christ, the pre-eternal Word)/.test(t) ? i : -1).filter(i => i >= 0);
    const fore = texts.map((t, i) => /^Rejoice, O (life-bearing Cross|Cross of the Lord|guide of the blind)/.test(t) ? i : -1).filter(i => i >= 0);
    assert.deepEqual(fnd, [4, 5, 6], 'Founding at slots 5-7 (after 4 Resurrection)');
    assert.deepEqual(fore, [7, 8, 9], 'Forefeast at slots 8-10');
    assert.ok(fore.every(i => hymns[i].tone === 5), 'Forefeast in Tone 5');
    const g = lic.findIndex(isGloryOnly);
    assert.match(lic[g + 1].text, /^Celebrating the memory of the dedication/);
    const n = lic.findIndex(isNow);
    assert.match(lic[n + 1].text, /^Who will not bless thee/, 'Now is the Tone 6 Dogmatikon');
  });

  it('INV-10: three OT lessons render', async () => {
    const blocks = await vespers('2026-09-12');
    const refs = blocks.filter(b => b.section === 'Old Testament Readings' && b.type === 'rubric' && /^\S+.* \d+:\d+/.test(b.text)).map(b => b.text);
    assert.deepEqual(refs, ['3 Kings 8:22-23, 27-30', 'Proverbs 3:19-34', 'Proverbs 9:1-11']);
  });

  it('INV-11: Aposticha — 4 Resurrection stichera, Glory Founding T2, Now Forefeast T2, no troparion as sticheron', async () => {
    const ap = stream(await vespers('2026-09-12'), 'Aposticha');
    const res = ap.filter(b => b.type === 'hymn' && b.source === 'octoechos');
    assert.equal(res.length, 4, 'four Tone-6 Resurrection aposticha');
    assert.match(res[3].text, /^Having been crucified as Thou didst will/);
    const g = ap.findIndex(isGloryOnly), n = ap.findIndex(isNow);
    assert.ok(g > 0 && n > g, 'Glory then Now, after the stichera');
    assert.match(ap[g + 1].text, /^We glorify Thee, O Lord, as we celebrate the dedication/);
    assert.equal(ap[g + 1].tone, 2);
    assert.match(ap[n + 1].text, /^The Cross of the Giver of life/);
    assert.equal(ap[n + 1].tone, 2);
    assert.ok(!ap.some(b => /^By sharing in the ways of the Apostles/.test(b.text)), 'Cornelius troparion not sung as a sticheron');
  });

  it('INV-12: troparia — Resurrection / Glory Founding / Now Forefeast', async () => {
    const tr = stream(await vespers('2026-09-12'), 'Troparia');
    assert.match(tr[0].text, /^The Angelic Powers were at Thy tomb/);
    assert.ok(isGloryOnly(tr[1]));
    assert.match(tr[2].text, /^Thou hast revealed the beauty of the holy dwelling place/);
    assert.ok(isNow(tr[3]));
    assert.match(tr[4].text, /^We offer in supplication/);
    assert.equal(tr.length, 5);
  });

  it('INV-13: a Great-Feast window principal takes Now on a Saturday eve; lesser window and weekday shapes unchanged', async () => {
    // 8-22 eve: Leavetaking of the Dormition, no saint → combined Glory-now, no Theotokion.
    const lv = stream(await vespers('2026-08-22'), 'Troparia');
    assert.equal(lv.length, 3);
    assert.match(lv[1].text, /^Glory to the Father.*now and ever/);
    assert.match(lv[2].label, /^Leavetaking of the Dormition/);
    // 9-19 eve: Afterfeast of the Elevation → same shape (saint at Glory tracked by D21).
    const af = stream(await vespers('2026-09-19'), 'Troparia');
    assert.match(af[af.length - 1].label, /^Afterfeast of the Elevation/);
    assert.ok(!af.some(b => /Dismissal Theotokion/.test(b.label || '')), 'no Theotokion after the Feast');
    // 8-29 eve: Afterfeast of the Beheading is NOT a Great Feast → Theotokion still closes.
    const bh = stream(await vespers('2026-08-29'), 'Troparia');
    assert.match(bh[bh.length - 1].label, /Dismissal Theotokion/);
    assert.match(bh[2].label, /^Afterfeast of the Beheading/);
    // 8-12 eve (weekday): Tikhon leads, Now: Leavetaking of the Transfiguration.
    const r = await get('/api/service?date=2026-08-12');
    const wk = stream(r.json.blocks, 'Troparia');
    assert.match(wk[0].label, /Tikhon/);
    assert.ok(isNow(wk[1]));
    assert.match(wk[2].label, /^Leavetaking of the Transfiguration/);
    assert.equal(wk.length, 3);
  });

  it('INV-14: every tone ships four Saturday aposticha stichera ending in a full sentence', async () => {
    const o = require('../../variable-sources/octoechos.json');
    for (let t = 1; t <= 8; t++) {
      const hymns = o[`tone${t}`].saturday.vespers.aposticha.hymns;
      assert.equal(hymns.length, 4, `tone ${t}`);
      for (const h of hymns) assert.match(h.text.trim(), /[.!?”"’']$/, `tone ${t} "${h.text.slice(-30)}"`);
    }
  });
});

describe('Feature contract: 9-14 Exaltation festal Liturgy', () => {

  it('INV-15: Third Antiphon is Psalm 98 with the troparion; First Antiphon is the DLMT cut', async () => {
    const blocks = await liturgy('2026-09-14');
    const third = blocks.filter(b => b.section === 'Third Antiphon' && b.type === 'verse').map(b => b.text);
    assert.match(third[0], /^The Lord reigns, let the people tremble!/);
    assert.ok(third.every(v => /Lord reigns|great in Zion|holy court/.test(v)), 'every Third-Antiphon verse is from Psalm 98');
    assert.ok(!third.some(v => /joyful noise/.test(v)), 'Psalm 99 ("O make a joyful noise") is not the feast antiphon');
    const resp = blocks.filter(b => b.section === 'Third Antiphon' && b.type === 'response');
    assert.match(resp[0].text, /^O Lord, save Thy people/);
    const first = blocks.filter(b => b.section === 'First Antiphon' && b.type === 'verse').map(b => b.text);
    assert.match(first[0], /^God, my God, attend to me!/);
    assert.equal(first.length, 4);
  });

  it('INV-16: the eisodikon "Extol the Lord our God…" is intoned at the entrance; the kontakion carries "Glory… now and ever…"', async () => {
    const blocks = await liturgy('2026-09-14');
    const ent = blocks.filter(b => b.section === 'Entrance Hymn');
    assert.match(ent[0].text, /^Extol the Lord our God: worship at His footstool/);
    assert.equal(ent[0].type, 'verse');
    const k = blocks.filter(b => b.section === 'Kontakia' && (b.type === 'doxology' || b.type === 'hymn'));
    assert.equal(k[0].type, 'doxology');
    assert.match(k[0].text, /^Glory to the Father.*Now and ever/);
    assert.match(k[1].text, /^As Thou wast voluntarily raised upon the Cross/);
  });

  it('INV-17: the parish picks its own antiphon cut (sjd-mission-cross) without changing the default', async () => {
    const t = await liturgy('2026-09-14', '&translation=st-john-damascus-tyler');
    const first = t.filter(b => b.section === 'First Antiphon' && b.type === 'verse').map(b => b.text);
    assert.match(first[0], /^My God, my God, look upon me/);
    assert.match(first[1], /^The words of my transgressions/);
    const third = t.filter(b => b.section === 'Third Antiphon' && b.type === 'verse').map(b => b.text);
    assert.deepEqual(third.map(v => v.slice(0, 20)), ['The Lord reigneth, l', 'The Lord is great in', 'Let them give thanks']);
    // Parish keeps the feast's structure: entrance verse, troparion, Glory-now kontakion.
    assert.ok(t.some(b => b.section === 'Entrance Hymn' && /^Extol the Lord/.test(b.text)));
  });
});
