'use strict';

/**
 * Feature contract: the Sunday Lord-I-Call split is APPOINTED, not left over.
 *
 * The split used to be "the Menaion takes however many sticheron rows the
 * database happens to hold, and the Resurrection gets the remainder":
 *
 *     const menaionCount        = licStichera.length;
 *     const resurrectionalCount = totalStichera - menaionCount;
 *
 * So any Sunday carrying a second stichera-bearing commemoration silently
 * demoted the Resurrection. On 2026-10-04 (Hieromartyr Hierotheus) that
 * rendered 4 + 6 — four of Hierotheus and two of Ven. Paul the Simple, whom the
 * published order does not sing at all — where the order appoints 7 + 3.
 *
 * It was sung that way at Great Vespers on 2026-10-03, six of ten stichera
 * wrong, and noticed by a person in church. `audit:date` was 0/0/0 on it, and
 * D21 was suppressing the date as unfixable.
 *
 * Saint rank cannot decide this: `commemorations.rank` is NULL for all 2,638
 * rows and orthocal's feast_level gives 07-12 Proclus (correctly 4+6) and
 * 10-25 Marcian (should be 7+3) the same level 0. The published OCA order
 * states the count per date and does separate them.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const { orderResurrectionCount } = require(path.join(ROOT, 'server-lib', 'sources', 'order-of-services'));
const { getLiturgicalSeason } = require(path.join(ROOT, 'calendar-rules'));

const PORT = 3139;  // unique across the suite — enforced by test/contracts/port-ledger.test.js
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    }).on('error', reject);
  });
}

/** Numbered Lord-I-Call stichera, split resurrectional vs Menaion. The Glory
 *  doxastikon follows "Glory…" and is never a numbered sticheron. */
function licSplit(blocks) {
  const res = [], men = [];
  let pastGlory = false;
  for (const b of blocks || []) {
    if ((b.section || '') !== 'Lord, I Have Cried') continue;
    if (b.type === 'doxology') { pastGlory = true; continue; }
    if (b.type !== 'hymn' || pastGlory) continue;
    const label = b.label || '';
    if (/theotokion|dogmatik/i.test(label)) continue;
    (/resurrection/i.test(label) ? res : men).push(b);
  }
  return { res, men };
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch (_) { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

describe('Feature contract: Sunday Lord-I-Call appointed split', () => {
  it('INV-1: 2026-10-04 renders the 7 + 3 the order appoints', async () => {
    assert.equal(orderResurrectionCount('2026-10-04'), 7, 'precondition: the order says 7');
    const { res, men } = licSplit((await get('/api/service?date=2026-10-03')).json.blocks);
    assert.equal(res.length, 7, `resurrectional: expected 7, got ${res.length}`);
    assert.equal(men.length, 3, `Menaion: expected 3, got ${men.length}`);
  });

  it('INV-2: Ven. Paul the Simple is not sung on 2026-10-04', async () => {
    // The order names him zero times. He took two slots because he happened to
    // have stichera rows, which is not a reason to sing a saint.
    const r = await get('/api/service?date=2026-10-03');
    const lic = (r.json.blocks || []).filter(b => (b.section || '') === 'Lord, I Have Cried');
    const blob = lic.map(b => `${b.label || ''} ${b.text || ''}`).join(' ');
    assert.ok(!/Paul the Simple/i.test(blob), 'Paul the Simple must not appear at Lord I Call');
  });

  it('INV-3: the Menaion stichera belong to the principal, in order', async () => {
    const { men } = licSplit((await get('/api/service?date=2026-10-03')).json.blocks);
    assert.ok(men.every(b => /Hierotheus/i.test(b.label || '')), 'all three must be Hierotheus');
    assert.ok(men.every(b => b.tone === 4), `the order appoints Tone 4, got ${men.map(b => b.tone)}`);
  });

  it('INV-4: a Sunday the order appoints at 4 still renders 4 — no over-correction', async () => {
    // The regression this change would most plausibly cause. D21's own comment
    // warned that ~12 Sundays correctly render 4+6 and are indistinguishable
    // from the broken ones BY RANK; capping the Menaion at 3 for that signature
    // would have broken twelve to fix three. The order file is what separates
    // them, so each of these must be checked against its own appointed count.
    for (const [sat, sun] of [['2026-07-11', '2026-07-12'], ['2026-07-25', '2026-07-26'],
                              ['2026-01-17', '2026-01-18'], ['2026-10-17', '2026-10-18']]) {
      const want = orderResurrectionCount(sun);
      assert.equal(want, 4, `precondition: ${sun} order should say 4, says ${want}`);
      const { res } = licSplit((await get(`/api/service?date=${sat}`)).json.blocks);
      assert.equal(res.length, 4, `${sun}: expected 4 resurrectional, got ${res.length}`);
    }
  });

  it('INV-5: licNoLeadingRepeat still wins for the parish that set it', async () => {
    // This parish declines to DOUBLE a resurrectional sticheron to fill the
    // count. The appointed count governs the MENAION; it must not override that.
    //
    // Until 2026-11-25 this asserted Tyler's 6 + 3 here, because Tone 1 was
    // thought to publish only 6 distinct. The Tyler sheet for Great Vespers
    // 2026-11-28 numbers the Tone 1 block 10-4 ending on "Let us praise the
    // Word, coeternal with the Father", and the orders for 10-04 and 11-29 both
    // appoint 7 — so Tone 1's `glory` text is the 7th numbered sticheron
    // (`_alsoNumberedSticheron`, see D25). Seven DISTINCT is now available, and
    // the invariant this test exists for is "no repeat", not "six".
    const { res, men } = licSplit(
      (await get('/api/service?date=2026-10-03&translation=st-john-damascus-tyler')).json.blocks);
    assert.equal(men.length, 3, 'the Menaion is still appointed at 3');
    const texts = res.map(b => (b.text || '').replace(/\s+/g, ' ').trim());
    assert.equal(new Set(texts).size, texts.length,
      `the parish must not repeat a resurrectional sticheron: ${texts.map(t => t.slice(0, 30)).join(' | ')}`);
    assert.equal(res.length, 7, `expected 7 distinct (Tone 1 now sources its 7th), got ${res.length}`);
  });

  it('INV-5b: 2026-11-28 sings 7 + 3 Paramon and ONE "Glory… now and ever…" over the Dogmatikon', async () => {
    // reference/orders/2026-1129: "7 stichera of the Resurrection, Tone 1 /
    // 3 stichera of St. Paramon, Tone 4 / Glory… now and ever… Dogmatic
    // Theotokion, Tone 1". Found 2026-11-25 against the Tyler 11.28.26 packet:
    // a mis-keyed Acacius sticheron sat in Paramon's third slot, a Menaion
    // Theotokion sang at Glory, and the Tone 1 7th sang at Glory instead of
    // numbered. Asserted by POSITION, for base and parish alike.
    for (const t of ['', '&translation=st-john-damascus-tyler']) {
      const blocks = (await get(`/api/service?date=2026-11-28${t}`)).json.blocks;
      const { res, men } = licSplit(blocks);
      const tag = t ? 'tyler' : 'base';
      assert.equal(new Set(res.map(b => b.text)).size, 7, `${tag}: 7 distinct resurrectional`);
      assert.equal(res.length, 7, `${tag}: no repeated resurrectional sticheron`);
      assert.equal(men.length, 3, `${tag}: 3 Menaion stichera`);
      for (const m of men) assert.match(m.text, /Paramon/, `${tag}: every Menaion sticheron is St Paramon's — got "${m.text.slice(0, 40)}"`);
      const lic = blocks.filter(b => (b.section || '') === 'Lord, I Have Cried' && b.type !== 'prayer' && b.type !== 'verse');
      const tail = lic.slice(lic.findIndex(b => b.type === 'doxology'));
      assert.equal(tail.length, 2, `${tag}: exactly one doxology then one hymn after the stichera`);
      assert.match(tail[0].text, /Glory to the Father.*now and ever/is, `${tag}: Glory and Now are combined`);
      assert.match(tail[1].label || '', /Dogmatik/i, `${tag}: the Dogmatikon closes the section`);
    }
  });

  it('INV-6: a Sunday with no order file still renders', async () => {
    // Some Sundays in 2026 have no published order. A missing oracle must fall
    // back to the previous behaviour, never crash or empty the section.
    //
    // The probe DISCOVERS such a Sunday rather than naming one. It used to
    // assert the precondition on a hard-coded 2026-11-15, and the weekly
    // `rubrics:fetch` cron then published that very order (main 8313f10) —
    // orderResurrectionCount went 7, not null, and the precondition failed on a
    // test whose actual subject was still fine. The uncovered set shrinks from
    // the front every week, so any fixed date here has a shelf life.
    const unordered = [];
    for (const d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() === 2026; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() !== 0) continue;                      // Sundays only
      const iso = d.toISOString().slice(0, 10);
      if (orderResurrectionCount(iso) !== null) continue;      // order published
      // Pascha and the Pentecostarion sing their own Lord-I-Call; this
      // invariant is about the ordinary Resurrection/Menaion split.
      if (getLiturgicalSeason(new Date(d)) !== 'ordinaryTime') continue;
      unordered.push(iso);
    }
    if (!unordered.length) {
      // Every 2026 Sunday has an order — the fallback path is unreachable for
      // this year and the invariant has nothing left to probe here. Fail loudly
      // rather than pass vacuously: re-point it at a year the cron has not
      // reached.
      assert.fail('no unordered ordinary-time Sunday left in 2026 — re-point INV-6 at a later year');
    }
    for (const sunday of unordered) {
      const eve = new Date(Date.UTC(...sunday.split('-').map((n, i) => (i === 1 ? +n - 1 : +n))));
      eve.setUTCDate(eve.getUTCDate() - 1);                    // Vespers is sung the evening before
      const iso = eve.toISOString().slice(0, 10);
      const { res, men } = licSplit((await get(`/api/service?date=${iso}`)).json.blocks);
      assert.ok(res.length + men.length >= 6,
        `${sunday} (eve ${iso}): expected a populated Lord I Call, got ${res.length}+${men.length}`);
    }
  });

  it('INV-7: D21 and the assembler share one parser', async () => {
    // If the rule re-implemented the parse, it could pass while the assembler
    // read the order differently — the audit would be checking its own copy.
    const fs = require('node:fs');
    const rule = fs.readFileSync(
      path.join(ROOT, 'audit', 'rules', 'D-structure', 'D21-sunday-lic-split-vs-order.js'), 'utf8');
    assert.match(rule, /require\(.*order-of-services.*\)/, 'D21 must import the shared parser');
    assert.ok(!/stichera of the Resurrection/i.test(rule.replace(/^\s*\/\/.*$/gm, '')),
      'D21 must not carry its own copy of the regex outside comments');
  });

  it('INV-8: the Hierotheus stichera carry the OCA text the parish sings', async () => {
    // Corrected 2026-10-04 (corrections_log #12). These three were the right
    // hymns at the right tone in the WRONG TRANSLATION — st-sergius.org wording
    // ("Receiving the grace of the all-holy Spirit, * O all-glorious
    // Hierotheus") against the OCA text the choir sings. The Resurrection
    // stichera beside them come from the OCA Obikhod, so one service carried two
    // translations and the register shifted audibly at v3.
    //
    // Transcribed from the scanned packet pages, not OCR. Pinned because the
    // rescrape harness could silently restore the st-sergius.org rows.
    const r = await get('/api/service?date=2026-10-03');
    const { men } = licSplit(r.json.blocks);
    assert.equal(men.length, 3, 'precondition: the appointed three');

    const joined = men.map(b => b.text || '').join('\n');
    assert.match(joined, /Having received the grace of the Holy Spirit/);
    assert.match(joined, /well-pleasing and divinely-sanctified gift/);
    assert.match(joined, /the twelve Apostles at the most glorious dormition/);

    // The st-sergius.org wording and its podoben phrase marks must be gone.
    assert.ok(!/all-holy Spirit/.test(joined), 'st-sergius.org wording still present');
    assert.ok(!/\*/.test(joined), `podoben asterisks leaked into OCA text: ${joined.slice(0, 80)}`);
  });
});
