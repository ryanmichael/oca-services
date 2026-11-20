'use strict';

/**
 * Feature contract: the Sunday afterfeast of a Great Feast, worked example
 * 2026-11-22 (Afterfeast of the Entry + Apostles Philemon, Archippus, Apphia,
 * Onesimus). Three defects found reviewing the Tyler choir packet
 * docs/choir-packets/2026-11-19/; audit:date passed all three.
 * Oracle: reference/orders/2026-1122-order-services.txt.
 *
 *   INV-1  Great Vespers alone (Sat eve 11-21): Resurrection T8 / Glory…
 *          Apostles T3 / Now and ever… Feast T4. The Apostles were absent.
 *   INV-2  Aposticha: ONE "Glory… now and ever…" over the feast's Tone 2
 *          ("Today the unblemished Virgin…", stichera.id 10843), no Theotokion.
 *          It printed the Tone 4 Litya Glory + a generic Theotokion.
 *   INV-3  Liturgy troparia carry the Apostles after the Feast; the Apostles'
 *          kontakion takes "Glory…", the Feast's "Now and ever…".
 *   INV-4  Liturgy: Resurrection + Feast prokeimenon / alleluia / koinonikon,
 *          the festal megalynarion — on every Theotokos-feast afterfeast Sunday
 *          (class, measured against the orders), past Tyler's toggle.
 *   INV-5  Precedence: a polyeleos saint in the window keeps the second set
 *          (8-09 St. Herman); a co-celebration overlay keeps its own (8-16);
 *          a Sunday outside any window gets nothing.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3145;  // unique across the suite — enforced by test/contracts/port-ledger.test.js
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
const byId = (b, id) => b.find((x) => x.id === id);
const idx = (b, id) => b.findIndex((x) => x.id === id);

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

describe('Great Vespers 2026-11-21 (content 11-22)', () => {
  for (const q of ['', `&${TYLER}`]) {
    it(`INV-1 troparia: Resurrection, Glory Apostles, Now Feast ${q ? '(Tyler)' : '(base)'}`, async () => {
      const b = await blocks(`/api/service?date=2026-11-21${q}`);
      const t = b.filter((x) => x.section === 'Troparia' && x.type === 'hymn');
      assert.equal(t.length, 3);
      assert.equal(t[0].tone, 8);
      assert.match(t[0].text, /^Thou didst descend from on high/);
      assert.equal(t[1].tone, 3);
      assert.match(t[1].text, /^Holy Apostles Philemon, Archippus/);
      assert.match(b[b.indexOf(t[1]) - 1].text, /^Glory to the Father/);
      assert.ok(!/now and ever/i.test(b[b.indexOf(t[1]) - 1].text), 'Apostles take Glory alone');
      assert.equal(t[2].tone, 4);
      assert.match(t[2].text, /^Today is the prelude of the good will of God/);
      assert.match(b[b.indexOf(t[2]) - 1].text, /^Now and ever/);
    });

    it(`INV-2 Aposticha: one Glory…now and ever over the Tone 2 feast sticheron ${q ? '(Tyler)' : '(base)'}`, async () => {
      const b = await blocks(`/api/service?date=2026-11-21${q}`);
      const g = byId(b, 'apost-glory-hymn');
      assert.ok(g, 'Aposticha Glory present');
      assert.equal(g.tone, 2);
      assert.match(g.text, /^Today the unblemished Virgin is led to the Temple/);
      assert.match(b[idx(b, 'apost-glory-hymn') - 1].text, /Glory to the Father.*now and ever/i);
      assert.ok(!byId(b, 'apost-now-hymn'), 'no separate Theotokion');
      assert.ok(!b.some((x) => x.section === 'The Litya'), 'the Litya Glory row stays inert');
    });
  }
});

describe('Divine Liturgy 2026-11-22', () => {
  it('INV-3 base: Apostles troparion after the Feast; kontakia Resurrection, Glory Apostles, Now Feast', async () => {
    const b = await blocks('/api/liturgy?date=2026-11-22');
    const tr = b.filter((x) => /^trop-rubric-/.test(x.id)).map((x) => x.text);
    assert.match(tr[0], /Resurrection/);
    assert.match(tr[1], /Afterfeast of the Entry/);
    assert.match(tr.at(-1), /Philemon and Archippus/);
    const ko = b.filter((x) => /^kont-(rubric|conn)-/.test(x.id)).map((x) => x.text);
    const gl = ko.findIndex((t) => /^Glory to the Father/.test(t));
    const nw = ko.findIndex((t) => /^Now and ever/.test(t));
    assert.match(ko[gl + 1], /Philemon and Archippus/);
    assert.match(ko[nw + 1], /Afterfeast of the Entry/);
  });

  it('INV-3 Tyler: St John after the Feast, Apostles last; St John kontakion before Glory', async () => {
    const b = await blocks(`/api/liturgy?date=2026-11-22&${TYLER}`);
    const tr = b.filter((x) => /^trop-rubric-/.test(x.id)).map((x) => x.text);
    assert.deepEqual(tr.map((t) => /Resurrection/.test(t) ? 'R' : /Afterfeast/.test(t) ? 'F'
      : /John of Damascus/.test(t) ? 'J' : /Philemon/.test(t) ? 'A' : '?'), ['R', 'F', 'J', 'A']);
    const ko = b.filter((x) => /^kont-(rubric|conn)-/.test(x.id)).map((x) => x.text);
    assert.deepEqual(ko.map((t) => /^Glory/.test(t) ? 'g' : /^Now/.test(t) ? 'n' : /Resurrection/.test(t) ? 'R'
      : /John of Damascus/.test(t) ? 'J' : /Philemon/.test(t) ? 'A' : /Afterfeast/.test(t) ? 'F' : '?'),
      ['R', 'J', 'g', 'A', 'n', 'F']);
  });

  for (const q of ['', `&${TYLER}`]) {
    it(`INV-4 Entry propers beside the Sunday's ${q ? '(Tyler, toggle off)' : '(base)'}`, async () => {
      const b = await blocks(`/api/liturgy?date=2026-11-22${q}`);
      assert.match(byId(b, 'prok-refrain').text, /^Pray and make your vows/);
      assert.ok(idx(b, 'prok-2-refrain') > idx(b, 'prok-refrain2'), 'feast prokeimenon follows the Sunday one');
      assert.match(byId(b, 'prok-2-refrain').text, /^My soul doth magnify the Lord/);
      assert.ok(!byId(b, 'prok-2-verse'), 'refrain only, no stichos');
      assert.equal(byId(b, 'all-2-v0') ? true : false, true, 'feast alleluia present');
      assert.match(byId(b, 'all-2-v0').text, /Hearken, O daughter/);
      assert.match(byId(b, 'megalynarion').text, /^The angels beheld the entrance/);
      assert.match(byId(b, 'ch-text').text, /^Praise the Lord from the heavens/);
      assert.ok(idx(b, 'ch-2-text') > idx(b, 'ch-text'));
      assert.match(byId(b, 'ch-2-text').text, /^I will receive the cup of salvation/);
    });
  }
});

describe('Afterfeast-Sunday class', () => {
  // [date, megalynarion opening] — Dormition, Meeting, Nativity of the Theotokos, Entry
  const CASES = [
    ['2025-08-17', /^The Angels, as they looked upon the Dormition/],
    ['2026-02-08', /^O Virgin Theotokos, hope of all Christians/],
    ['2027-09-12', /^Magnify, O my soul, the most glorious birth/],
    ['2025-11-23', /^The angels beheld the entrance/],
  ];
  for (const [date, meg] of CASES) {
    it(`INV-4 ${date}: Magnificat prokeimenon, feast alleluia, festal megalynarion, "the cup"`, async () => {
      const b = await blocks(`/api/liturgy?date=${date}`);
      assert.match(byId(b, 'prok-2-refrain')?.text || '', /^My soul doth magnify the Lord/);
      assert.ok(byId(b, 'all-2-v0'), 'feast alleluia');
      assert.match(byId(b, 'megalynarion').text, meg);
      assert.match(byId(b, 'ch-2-text')?.text || '', /^I will receive the cup of salvation/);
    });
  }

  it('INV-5 2026-08-09: the polyeleos saint (St. Herman) keeps the second set; feast keeps the megalynarion', async () => {
    const b = await blocks('/api/liturgy?date=2026-08-09');
    assert.match(byId(b, 'prok-2-refrain').text, /^Precious in the sight of the Lord/);
    assert.match(byId(b, 'ch-2-text').text, /^The righteous shall be in everlasting remembrance/);
    assert.match(byId(b, 'megalynarion').text, /^Magnify, O my soul, the Lord Who was transfigured/);
  });

  it('INV-5 2026-08-16: the Image overlay keeps its own second set', async () => {
    const b = await blocks('/api/liturgy?date=2026-08-16');
    assert.match(byId(b, 'ch-2-text').text, /^O Lord, we shall walk in the light/);
  });

  it('INV-5 2026-11-15 (no window): no feast propers, "It is truly meet"', async () => {
    const b = await blocks('/api/liturgy?date=2026-11-15');
    assert.ok(!byId(b, 'prok-2-refrain'));
    assert.ok(!byId(b, 'ch-2-text'));
    assert.match(byId(b, 'megalynarion').text, /^It is truly meet/);
  });
});
