'use strict';

/**
 * Feature contract: a Menaion service set may carry only part of a service.
 *
 * `menaionServiceSet` began as a whole-shape mechanism — Tyler's 10-1 set
 * re-specifies Lord I Call, the Aposticha and the Troparia together. 10-8 needs
 * one hymn changed and nothing else, and re-specifying the whole service to
 * reach it would risk the parts that already match the parish's own books.
 *
 * Why 10-8 exists at all: the OCA publishes TWO troparia for Venerable Pelagia
 * the Penitent. oca.org/saints/troparia/<year>/10/08/ gives her proper
 * troparion, Tone 4, "Like a fragrant rose growing among thorns"; the OCA Music
 * Department's 2006 sheet sets the general troparion for a woman monastic,
 * Tone 8. Both are OCA, and ours was never wrong — Tyler simply sings the Music
 * Department's (choir director, 2026-10-02).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3104;
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

const section = (r, name) =>
  (r.json.blocks || []).filter((b) => (b.section || '') === name);
const hymns = (r, name) => section(r, name).filter((b) => b.type === 'hymn');

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch (_) { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

// 2026-10-07 eve serves October 8.
const EVE = '2026-10-07';

describe('Feature contract: partial Menaion service set', () => {
  it('INV-1: the set swaps the troparion and nothing else in that section', async () => {
    const r = await get(`/api/service?date=${EVE}&translation=st-john-damascus-tyler`);
    const t = hymns(r, 'Troparia');
    assert.equal(t.length, 2, 'troparion + dismissal Theotokion');
    assert.equal(t[0].tone, 8, 'the general troparion is Tone 8');
    assert.match(t[0].text, /image of God was truly preserved/);
    assert.ok(!/fragrant rose/.test(t[0].text), 'the Tone 4 proper must not also render');
  });

  it('INV-2: the dismissal Theotokion follows the new tone', async () => {
    // for-date.js re-keys the Theotokion to the troparion's tone, but it has
    // already run by the time a set applies, so applyServiceSet repeats it.
    // Without that the Tone 4 Theotokion would sit under a Tone 8 troparion.
    const r = await get(`/api/service?date=${EVE}&translation=st-john-damascus-tyler`);
    const t = hymns(r, 'Troparia');
    assert.equal(t[1].tone, 8, 'Theotokion in the tone of the troparion above it');
  });

  it('INV-3: a parish without the pick keeps the OCA default', async () => {
    const r = await get(`/api/service?date=${EVE}`);
    const t = hymns(r, 'Troparia');
    assert.match(t[0].text, /fragrant rose/, 'the default is her proper Tone 4');
    assert.equal(t[0].tone, 4);
  });

  it('INV-4: a Lord-I-Call-less set leaves Lord I Call alone', async () => {
    // The 10-8 set carries no lordICall block. Before partial sets were legal,
    // applyServiceSet bailed out entirely when one was missing — so a bug here
    // shows up as Lord I Call changing, or as the whole set failing to apply.
    //
    // Compared against the OCA base EXCEPT the closing Theotokion, which Tyler
    // sings in the week's tone under `licTheotokionWeekTone` (shipped 43166d3).
    // That rubric is a separate, already-contracted divergence; folding it in
    // here would make this test fail for a reason it is not about.
    const tyler = await get(`/api/service?date=${EVE}&translation=st-john-damascus-tyler`);
    const base  = await get(`/api/service?date=${EVE}`);
    const a = hymns(tyler, 'Lord, I Have Cried').map((b) => b.text);
    const b = hymns(base,  'Lord, I Have Cried').map((b) => b.text);
    assert.equal(a.length, b.length, 'the set must not add or drop a sticheron');
    assert.ok(a.length > 4, `precondition: a populated Lord I Call, got ${a.length}`);
    assert.deepEqual(a.slice(0, -1), b.slice(0, -1),
      'every sticheron up to the Theotokion must be untouched by a troparion-only set');
  });

  it('INV-5: the whole-shape set on 10-1 still applies in full', async () => {
    // The only other consumer of this code. Tyler serves the Protection as
    // Daily Vespers from the Raphaela Menaion; a partial-set regression here
    // would silently fall back to the OCA Vigil.
    const r = await get('/api/service?date=2026-09-30&translation=st-john-damascus-tyler');
    assert.equal(r.json.serviceName, 'Daily Vespers');
    const lic = hymns(r, 'Lord, I Have Cried');
    assert.ok(lic.length > 0, 'the set still supplies Lord I Call');
    assert.ok(lic.some((b) => /Protection|Theotokos/i.test(b.text || '')),
      'the Protection stichera still render');
  });

  it('INV-6: Pelagia\'s Lord-I-Call stichera carry the text the parish sings', async () => {
    // Converted 2026-10-05 from the scanned pages of the 10-01 packet
    // (daily-vespers-2026-10-08.pdf), read visually, not from OCR.
    // files.oca.org publishes nothing for 10-08 — an ordinary weekday — so the
    // parish booklet is the authority, as it was for St Hierotheus.
    //
    // Pinned because the rescrape harness could silently restore the
    // st-sergius.org rows.
    const r = await get(`/api/service?date=${EVE}&translation=st-john-damascus-tyler`);
    const lic = hymns(r, 'Lord, I Have Cried');
    const joined = lic.map(b => b.text || '').join('\n');

    assert.match(joined, /O most glorious wonder; the woman of great courage/);
    assert.match(joined, /Truly thou art like a new Thekla/);
    assert.match(joined, /Rejoice, O all-honored Pelagia/);
    assert.match(joined, /Where sin increased, as the Apostle teaches/);

    // The st-sergius.org wording and its podoben asterisks must be gone from
    // the saint's own stichera. The weekday Octoechos hymns beside them are
    // still st-sergius.org and still carry asterisks — that is chunk 4, and
    // asserting on the whole section would wrongly fail until it lands.
    const pelagia = lic.filter(b => /Pelagia|Thekla|glorious wonder|sin increased/.test(b.text || ''));
    assert.equal(pelagia.length, 4, `expected her 3 stichera + Glory, got ${pelagia.length}`);
    for (const b of pelagia) {
      assert.ok(!/\*/.test(b.text), `podoben asterisks survived: ${b.text.slice(0, 50)}`);
      assert.ok(!/hath trampled the enemy underfoot/.test(b.text), 'st-sergius.org wording survived');
    }
  });
});
