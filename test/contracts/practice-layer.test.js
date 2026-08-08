/**
 * Feature contract: the parish practice layer
 *
 * Declarative, non-destructive shape operations over canonical text — which
 * stichoi a parish actually sings, as distinct from what the words are.
 *
 * Worked example: St. John of Damascus (Tyler) sings an abridged First and
 * Second Antiphon, confirmed with the parish 2026-08-08. The First Antiphon
 * closes with a reprise of its opening stichos.
 *
 * THE POINT OF THIS LAYER IS INV-3 AND INV-5. A parish selection must never be
 * able to delete canon, and a selection that stops resolving must fail toward
 * MORE text rather than less. c95da45 shipped a short antiphon because a
 * replacement array is indistinguishable from a transcription gap; here the
 * canonical array is untouched and only the intent is stored, so the failure
 * mode is visible instead of silent.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const { applyPractice, applySelect, fingerprint } = require(
  path.join(ROOT, 'server-lib', 'practice'));

const PORT = 3087; // distinct: practice 3087, royster 3089, faithful-litany 3090,
                   // hours-precede 3091, lic 3092, afterfeast 3093, vespers 3094,
                   // polyeleos 3095, sunday-kontakia 3096, confess 3097,
                   // patron 3098, smoke 3099, dev 3000
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
    cwd: ROOT,
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

const TYLER = 'st-john-damascus-tyler';
const SUNDAY = '2026-06-21';   // ordinary Sunday — typical antiphons render

async function antiphonUnits(translation, section) {
  const { json } = await get(`/api/liturgy?date=${SUNDAY}&translation=${translation}`);
  assert.ok(json && json.blocks, `no blocks for ${translation}`);
  return json.blocks
    .filter(b => b.section === section && b.type === 'verse')
    .map(b => b.text || '');
}

// A stand-in canonical array with the same stichos shape as a real antiphon.
const CANON = [
  'alpha one\nalpha two\nalpha three',
  'beta one\nbeta two',
  'gamma one',
];

describe('Feature contract: parish practice layer', () => {

  it('INV-1: Tyler renders the abridged antiphons, First closing with its reprise', async () => {
    // Wording is Royster (the `dmitri-royster` layer), not the `oca` text beneath:
    // "who cleanseth all thy transgressions" where oca reads "Who is gracious unto
    // all thine iniquities". Selection and wording are separate concerns and both
    // have to land for the parish to see what the choir is singing.
    const first = await antiphonUnits(TYLER, 'First Antiphon');
    assert.equal(first.length, 4, 'First Antiphon should render 4 sung units');
    assert.match(first[0], /^Bless the Lord, O my soul, blessed art Thou, O Lord\./);
    assert.match(first[0], /forget not all His benefits/,          'Royster 1.3');
    assert.match(first[1], /who cleanseth all thy transgressions/, 'Royster 2.1');
    assert.match(first[1], /thy life from destruction/,            'Royster 2.2');
    assert.match(first[2], /^Compassionate and merciful is the Lord; long-suffering and of great mercy/);
    // The closing unit is stichos 1.1 sung again — not a truncated verse 9.
    assert.equal(first[3], 'Bless the Lord, O my soul, blessed art Thou, O Lord.');
    // The oca wording must NOT survive underneath.
    assert.doesNotMatch(first.join('\n'), /Who is gracious unto all thine iniquities/,
      'oca wording leaked through the Royster layer');

    // Omitted stichoi must be absent.
    const firstAll = first.join('\n');
    assert.doesNotMatch(firstAll, /Who fulfilleth thy desire/,     '2.3 should be omitted');
    assert.doesNotMatch(firstAll, /His ways known unto Moses/,     'verse 3 should be omitted');
    assert.doesNotMatch(firstAll, /Not unto the end will He be angered/, '4.2 should be omitted');

    const second = await antiphonUnits(TYLER, 'Second Antiphon');
    assert.equal(second.length, 5, 'Second Antiphon should render 5 sung units');
    assert.match(second[2], /who hath the God of Jacob for his helper/, 'Royster 3.1');
    assert.match(second[3], /^The Lord shall be King for ever/,          'Royster 7.1');
    assert.match(second[4], /from generation to generation/,             'Royster 8.1');
    const secondAll = second.join('\n');
    assert.doesNotMatch(secondAll, /Who keepeth truth unto eternity/, 'verse 4 should be omitted');
    assert.doesNotMatch(secondAll, /looseth the fettered/,            'verse 5 should be omitted');
    assert.doesNotMatch(secondAll, /preserveth the proselytes/,       'verse 6 should be omitted');
  });

  it('INV-2: a parish without practice entries is completely unaffected', async () => {
    const first  = await antiphonUnits('oca', 'First Antiphon');
    const second = await antiphonUnits('oca', 'Second Antiphon');
    assert.equal(first.length,  10, 'oca First Antiphon must keep all 10 verses');
    assert.equal(second.length,  8, 'oca Second Antiphon must keep all 8 verses');
    assert.match(first.join('\n'),  /His ways known unto Moses/);
    assert.match(second.join('\n'), /preserveth the proselytes/);
  });

  it('INV-3: canon survives — the canonical text is never mutated', async () => {
    // Order matters: request Tyler FIRST, then oca. If the transform mutated the
    // shared cached fixed-text tree rather than cloning, oca would come back short.
    await antiphonUnits(TYLER, 'First Antiphon');
    const ocaAfter = await antiphonUnits('oca', 'First Antiphon');
    assert.equal(ocaAfter.length, 10,
      'oca lost verses after a Tyler request — the practice transform mutated shared state');

    // And Tyler is still abridged on a repeat request (not cumulatively re-cut).
    const tylerAgain = await antiphonUnits(TYLER, 'First Antiphon');
    assert.equal(tylerAgain.length, 4, 'Tyler selection is not stable across requests');
  });

  it('INV-4: select keeps verse grouping, drops emptied verses, appends reprise', () => {
    const r = applySelect(CANON, { keep: ['1.1', '1.3', '3.1'], reprise: ['1.1'] });
    assert.equal(r.error, undefined);
    assert.deepEqual(r.value, [
      'alpha one\nalpha three',  // verse 1 keeps 1.1 + 1.3, grouping preserved
      'gamma one',               // verse 2 emptied and dropped; verse 3 survives
      'alpha one',               // reprise appended as its own unit
    ]);
  });

  it('INV-5: an unresolvable address fails toward MORE text, never less', () => {
    const texts = { thing: { verses: CANON.slice() } };
    const entry = {
      service: 'liturgy', target: 'thing.verses', op: 'select',
      keep: ['1.1', '9.9'],   // 9.9 does not exist
    };
    const { texts: out, warnings } = applyPractice(texts, [entry], 'liturgy');
    assert.deepEqual(out.thing.verses, CANON,
      'a broken address must leave the canonical text untouched, not apply a partial cut');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /does not resolve/);
    assert.match(warnings[0], /canonical text renders unchanged/);
  });

  it('INV-6: applyPractice never mutates its input', () => {
    const original = CANON.slice();
    const texts = { thing: { verses: original } };
    const snapshot = JSON.stringify(texts);
    const { texts: out } = applyPractice(
      texts,
      [{ target: 'thing.verses', op: 'select', keep: ['1.1'] }],
      'liturgy');
    assert.equal(JSON.stringify(texts), snapshot, 'input tree was mutated');
    assert.notEqual(out, texts, 'expected a new object');
    assert.deepEqual(out.thing.verses, ['alpha one']);
  });

  it('INV-7: a stale fingerprint warns but still applies (addresses are the real gate)', () => {
    const texts = { thing: { verses: CANON.slice() } };
    const { texts: out, warnings } = applyPractice(
      texts,
      [{ target: 'thing.verses', op: 'select', keep: ['1.1'], fingerprint: 'deadbeef' }],
      'liturgy');
    assert.deepEqual(out.thing.verses, ['alpha one'], 'should still apply');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /fingerprint changed/);
    // And the recorded fingerprint for the real text is stable.
    assert.equal(fingerprint(CANON), fingerprint(CANON.slice()));
  });

  it('INV-8: entries are scoped by service and ignore unknown ops', () => {
    const texts = { thing: { verses: CANON.slice() } };
    const wrongService = applyPractice(
      texts, [{ service: 'vespers', target: 'thing.verses', op: 'select', keep: ['1.1'] }], 'liturgy');
    assert.deepEqual(wrongService.texts.thing.verses, CANON, 'vespers entry applied to liturgy');
    assert.equal(wrongService.warnings.length, 0);

    const unknownOp = applyPractice(
      texts, [{ target: 'thing.verses', op: 'transmogrify', keep: ['1.1'] }], 'liturgy');
    assert.deepEqual(unknownOp.texts.thing.verses, CANON, 'unknown op changed the text');
    assert.match(unknownOp.warnings[0], /unknown op/);
  });
});
