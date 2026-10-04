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

const PORT = 3106;
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
    // Tyler sings 6 + 3, not 7 + 3: Tone 1 publishes only 6 distinct
    // resurrectional stichera and this parish declines to double the first.
    // The appointed count governs the MENAION; it must not override that.
    const { res, men } = licSplit(
      (await get('/api/service?date=2026-10-03&translation=st-john-damascus-tyler')).json.blocks);
    assert.equal(men.length, 3, 'the Menaion is still appointed at 3');
    assert.equal(res.length, 6, `expected the parish 6-count, got ${res.length}`);
  });

  it('INV-6: a Sunday with no order file still renders', async () => {
    // 10 of 52 Sundays in 2026 have no published order. A missing oracle must
    // fall back to the previous behaviour, never crash or empty the section.
    assert.equal(orderResurrectionCount('2026-11-15'), null, 'precondition: no order file');
    const { res, men } = licSplit((await get('/api/service?date=2026-11-14')).json.blocks);
    assert.ok(res.length + men.length >= 6, `expected a populated Lord I Call, got ${res.length}+${men.length}`);
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
});
