'use strict';

/**
 * Feature contract: the Entry of the Theotokos, Great Vespers 2026-11-20 and
 * Liturgy 2026-11-21 — four defects found reviewing the Tyler choir packet
 * docs/choir-packets/2026-11-16/. audit:date passed all four.
 *
 *   INV-1  Aposticha takes the feast's PROPER verses (Ps. 44:13, 44:14), not
 *          the ordinary Ps. 122 table. Oracle: reference/scrape/2025-11-21.docx.
 *   INV-2  The Litya's Tone 5 (Leo the Master) is the Glory doxastichon, under
 *          "Glory... now and ever", after exactly three stichera. It was keyed
 *          order=4 (stichera.id 9662) and printed as a fourth sticheron.
 *   INV-3  The Magnificat prokeimenon is authored in the Thee/Thy register
 *          ("doth magnify ... hath rejoiced"), on every feast that uses it.
 *          The pronoun converter is one-way (tt -> yy), so a yy-authored string
 *          can never render right for a tt parish. (Third-person doth/hath
 *          deliberately survive into yy, so a tt/yy diff is NOT the detector
 *          here — the tt text itself is asserted.)
 *   INV-4  Tyler serves this eve as Great Vespers ALONE (greatVespersAloneOn
 *          = 11-21): Vespers dismissal, no "Matins follows", no /api/vigil.
 *          The OCA base and Tyler's own 9-07 vigil keep the vigil ending.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3144;  // unique across the suite — enforced by test/contracts/port-ledger.test.js
const TYLER = 'translation=st-john-damascus-tyler&parish=st-john-damascus-tyler';
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

async function blocks(urlPath) {
  const r = await get(urlPath);
  assert.equal(r.status, 200, `${urlPath} -> ${r.status}`);
  return r.json.blocks;
}

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

describe('Entry of the Theotokos — Vespers 2026-11-20', () => {
  it('INV-1 Aposticha verses are Ps. 44, in position before stichera 2 and 3', async () => {
    const b = await blocks('/api/service?date=2026-11-20');
    const ap = b.filter((x) => x.section === 'Aposticha');
    const ids = ap.map((x) => x.id);
    const v1 = ap[ids.indexOf('apost-hymn-1') - 1];
    const v2 = ap[ids.indexOf('apost-hymn-2') - 1];
    assert.equal(v1.type, 'verse');
    assert.match(v1.text, /Virgins shall be brought to the King after her/);
    assert.equal(v2.type, 'verse');
    assert.match(v2.text, /brought with gladness and rejoicing/);
    assert.ok(!ap.some((x) => /lift up mine eyes|Have mercy upon us, O Lord/.test(x.text)),
      'the ordinary Ps. 122 verses must not appear');
  });

  it('INV-2 Litya: three stichera, then "Glory... now and ever", then the Tone 5', async () => {
    const b = await blocks('/api/service?date=2026-11-20');
    const lit = b.filter((x) => x.section === 'The Litya' && (x.type === 'hymn' || x.type === 'doxology'));
    const doxIdx = lit.findIndex((x) => x.type === 'doxology');
    assert.equal(doxIdx, 3, 'the doxology follows exactly three stichera');
    assert.match(lit[doxIdx].text, /now and ever/i, 'the Glory takes the Now');
    assert.equal(lit[doxIdx + 1].tone, 5);
    assert.match(lit[doxIdx + 1].text, /^The day of joy has dawned/);
  });

  it('INV-4 Tyler ends with the Vespers dismissal; base and Tyler 9-07 keep the vigil', async () => {
    const tyler = await blocks(`/api/service?date=2026-11-20&${TYLER}`);
    assert.ok(!tyler.some((x) => x.id === 'vigil-to-matins'), 'no hand-over to Matins');
    assert.ok(tyler.some((x) => x.id === 'dis-proper'), 'Vespers dismissal present');
    assert.ok(tyler.some((x) => x.section === 'The Litya'), 'Litya kept');
    assert.ok(tyler.some((x) => x.id === 'bob-psalm33'), 'Blessing of the Loaves kept');

    const base = await blocks('/api/service?date=2026-11-20');
    assert.equal(base.at(-1).id, 'vigil-to-matins', 'OCA base is still a vigil');
    const nativity = await blocks(`/api/service?date=2026-09-07&${TYLER}`);
    assert.equal(nativity.at(-1).id, 'vigil-to-matins', 'Tyler kept a full vigil on 9-07');

    assert.equal((await get(`/api/vigil?date=2026-11-20&${TYLER}`)).status, 404);
    assert.equal((await get('/api/vigil?date=2026-11-20')).status, 200);
  });
});

describe('Magnificat prokeimenon register', () => {
  // Entry, Meeting, Nativity of the Theotokos, Dormition
  for (const date of ['2026-11-21', '2026-02-02', '2026-09-08', '2026-08-15']) {
    it(`INV-3 ${date} is authored doth/hath and still renders under ?pronoun=yy`, async () => {
      const tt = (await blocks(`/api/liturgy?date=${date}&pronoun=tt`)).find((x) => x.id === 'prok-refrain');
      const yy = (await blocks(`/api/liturgy?date=${date}&pronoun=yy`)).find((x) => x.id === 'prok-refrain');
      assert.ok(tt, 'prokeimenon present');
      assert.match(tt.text, /^My soul doth magnify the Lord, and my spirit hath rejoiced/);
      const ttV = (await blocks(`/api/liturgy?date=${date}&pronoun=tt`)).find((x) => x.id === 'prok-verse');
      assert.match(ttV.text, /He hath regarded the low estate/);
      assert.ok(yy, 'prokeimenon present under yy');
    });
  }
});
