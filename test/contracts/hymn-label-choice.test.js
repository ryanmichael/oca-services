/**
 * Feature contract: choosing between a hymn row's label and its slot's
 * Spec: features/hymn-label-choice.md
 *
 * The rule lives in assemblers/_shared/hymn-label.js and is used by both
 * lord-i-call.js and aposticha.js. Before 2026-08-29 the two had separate,
 * partial copies and neither recognised the bare-descriptor label family.
 *
 * Run: node --test test/contracts/hymn-label-choice.test.js
 *      npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { labelSubject, preferRowLabel } = require('../../assemblers/_shared/hymn-label');

const PORT = 3096;
let serverProcess;
const TYLER = 'st-john-damascus-tyler';

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

/** Hymn blocks of a section, in order. */
function hymnsIn(blocks, sectionRe) {
  return blocks.filter(b => b.type === 'hymn' && sectionRe.test(b.section || ''));
}

describe('Feature contract: hymn label choice (row label vs slot label)', () => {

  it('INV-1: 8-29 Lord-I-Call labels track the SUBJECT of each hymn, not the principal', async () => {
    // reference/orders/2026-0830-order-services.txt: 4 Resurrection, 3 of the
    // Forerunner, 3 of the Saints. All seven menaion hymns printed under
    // "Saint Alexander, Patriarch of Constantinople" before this rule.
    const { json } = await get(`/api/service?date=2026-08-29&translation=${TYLER}`);
    const hs = hymnsIn(json.blocks, /Lord, I/);

    // Anchor on the TEXT so the assertion cannot pass on a relabelled wrong hymn.
    const forerunner = hs.find(b => /Incited by her iniquitous mother/.test(b.text || ''));
    const hierarch   = hs.find(b => /O all-blessed Alexander/.test(b.text || ''));
    assert.ok(forerunner, 'expected the Forerunner sticheron "Incited by her iniquitous mother"');
    assert.ok(hierarch,   'expected the hierarch sticheron "O all-blessed Alexander"');

    assert.match(forerunner.label || '', /forerunner/i,
      `Forerunner hymn must not be labelled for the hierarchs; got: ${forerunner.label}`);
    assert.doesNotMatch(forerunner.label || '', /Alexander/,
      `Forerunner hymn must not name Alexander; got: ${forerunner.label}`);
    assert.doesNotMatch(hierarch.label || '', /forerunner/i,
      `hierarch hymn must not be labelled for the Forerunner; got: ${hierarch.label}`);
  });

  it('INV-2: 8-29 the Aposticha Glory is the Forerunner, not the principal hierarch', async () => {
    // The order appoints "Glory... Forerunner, Tone 4" on the Aposticha.
    const { json } = await get(`/api/service?date=2026-08-29&translation=${TYLER}`);
    const glory = hymnsIn(json.blocks, /Aposticha/)
      .find(b => /Herod celebrated an unseemly birthday/.test(b.text || ''));
    assert.ok(glory, 'expected the Aposticha Glory "Herod celebrated an unseemly birthday"');
    assert.match(glory.label || '', /forerunner/i,
      `expected a Forerunner label on the Aposticha Glory; got: ${glory.label}`);
  });

  it('INV-3: a bare descriptor never displaces the principal\'s own title', async () => {
    // 2026-10-16 (Vespers for 10-17): the slot mixes Prophet Hosea's stichera
    // with a venerable martyr's. Hosea's must keep his NAME — "the holy
    // prophet" is correct but strictly less informative, and handing it to the
    // principal's own hymns is the downgrade this rule exists to avoid.
    const { json } = await get(`/api/service?date=2026-10-16&translation=${TYLER}`);
    const hs = hymnsIn(json.blocks, /Lord, I/);
    const labels = hs.map(b => b.label || '');
    assert.ok(labels.some(l => /Hosea/.test(l)),
      `expected Hosea's own hymns to keep his name; got: ${labels.join(' | ')}`);
    assert.ok(labels.some(l => /venerable martyr/i.test(l)),
      `expected the other saint's hymns to carry their own descriptor; got: ${labels.join(' | ')}`);
  });

  it('INV-4: the Aposticha "Now and ever" keeps its structural label against a mis-keyed row', async () => {
    // 2026-11-27: stichera row 9466 is plainly a Theotokion ("Thou art mine aid
    // and protection, O all-immaculate one") but carries the mis-keyed label
    // "the venerable martyr". The Now slot's heading is structural.
    const { json } = await get(`/api/service?date=2026-11-27&translation=${TYLER}`);
    const now = hymnsIn(json.blocks, /Aposticha/)
      .find(b => /Thou art mine aid and protection/.test(b.text || ''));
    assert.ok(now, 'expected the Theotokion "Thou art mine aid and protection"');
    assert.doesNotMatch(now.label || '', /venerable martyr/i,
      `a mis-keyed row descriptor must not print over the Theotokion; got: ${now.label}`);
  });

  it('INV-5: an explicit "(for X)" label still wins at "Now and ever"', async () => {
    // 2026-08-16 legitimately sings the Dormition's sticheron at Now-and-ever
    // while the Glory is the Image's. Narrowing INV-4 must not cost this.
    const { json } = await get(`/api/service?date=2026-08-15&translation=${TYLER}`);
    const labels = hymnsIn(json.blocks, /Aposticha/).map(b => b.label || '');
    assert.ok(labels.some(l => /Dormition/i.test(l)),
      `expected the Dormition named at Now-and-ever; got: ${labels.join(' | ')}`);
    assert.ok(labels.some(l => /Image/i.test(l)),
      `expected the Image named at the Glory; got: ${labels.join(' | ')}`);
  });

  it('INV-6: labelSubject reads both label forms, and rejects slot markers', () => {
    assert.equal(labelSubject('(for the Image)'), 'the image');
    assert.equal(labelSubject('(for the Dormition, by the Emperor Leo the Wise)'), 'the dormition');
    assert.equal(labelSubject('the holy forerunner'), 'the holy forerunner');
    assert.equal(labelSubject('the venerable one'), 'the venerable one');
    // "Glory" is a slot marker, not a subject — admitting it would make every
    // slot holding a Glory row look mixed.
    assert.equal(labelSubject('Glory'), null);
    assert.equal(labelSubject('Theotokion'), null);
    assert.equal(labelSubject(''), null);
    assert.equal(labelSubject(null), null);
  });

  it('INV-7: preferRowLabel keeps the slot title for the slot\'s own subject', () => {
    // Same subject → the title is more informative.
    assert.equal(preferRowLabel('the holy prophet', 'Prophet Hosea'), 'Prophet Hosea');
    assert.equal(preferRowLabel('the holy martyrs', '33 Holy Martyrs of Melitene'),
      '33 Holy Martyrs of Melitene');
    // Containment: "feast" is inside "Afterfeast".
    assert.equal(preferRowLabel('the feast', 'Afterfeast of the Elevation of the Cross'),
      'Afterfeast of the Elevation of the Cross');
    // Different subject → the descriptor is the only true thing available.
    assert.equal(preferRowLabel('the venerable martyr', 'Prophet Hosea'), 'the venerable martyr');
    assert.equal(preferRowLabel('the holy forerunner', 'Saint Alexander, Patriarch of Constantinople'),
      'the holy forerunner');
    // No content words at all can never outrank a title.
    assert.equal(preferRowLabel('the venerable one', 'Venerable Euthymius the New'),
      'Venerable Euthymius the New');
    // Genre words are not subjects: two labels sharing "stichera" are not the
    // same subject (2026-03-25 collapsed to a bare "Stichera" without this).
    assert.equal(preferRowLabel('24 stichera by Simeon the Translator', 'Stichera'),
      '24 stichera by Simeon the Translator');
  });
});
