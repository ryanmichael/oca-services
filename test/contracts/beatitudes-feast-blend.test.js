/**
 * Feature contract: Beatitudes that blend the Octoechos with a feast canon
 *
 * Worked example: 2026-08-16, the Translation of the Image Not-Made-by-Hands
 * on a Sunday inside the Afterfeast of the Dormition.
 *
 * reference/orders/2026-0816-order-services.txt appoints, at the Beatitudes:
 *
 *   4 troparia of the Resurrection, Tone 2
 *   2 troparia from Ode 1 of the 1st Canon of the Feast, Tone 1
 *   2 troparia from Ode 1 of the 2nd Canon of the Feast, Tone 4
 *   4 troparia from Ode 6 of the Canon of the Image, Tone 4
 *
 * Before 2026-08-15 the date rendered the plain Octoechos set — 6 resurrection
 * troparia plus the Octoechos Glory and Theotokion — with no feast or Image
 * troparia at all, because FEAST_BEATITUDES_OVERRIDES held exactly one entry
 * and the single-file blend mechanism reads ode3/ode6 only, while this order
 * wants ode1 from one book and ode6 from another.
 *
 * KNOWN GAP, asserted below so it cannot be silently "fixed" by padding: the
 * 1st Canon's Ode 1 troparia are not in the corpus at all. The Dormition canon
 * in variable-sources/menaion/august-15.json carries irmos + irmos2 for every
 * ode and no troparia. So 10 of the appointed 12 render. The two canons are
 * different compositions (Cosmas, Tone 1; John of Damascus, Tone 4) and the
 * order names them separately, so the hole must not be filled from the 2nd.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3101;
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

/** The sung troparia of the Third Antiphon, in order. */
const troparia = (blocks) => blocks
  .filter(b => b.section === 'Third Antiphon' && b.type === 'hymn');

describe('Feature contract: blended Beatitudes on a feast-window Sunday', () => {

  it('INV-1: 8-16 sings 4 Resurrection, then the Dormition, then the Image', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-16&format=json');
    const t = troparia(json.blocks);
    assert.equal(t.length, 10,
      '10 of the appointed 12 — the Dormition 1st-canon pair is not in the corpus');

    const res = t.filter(x => /Resurrection/.test(x.label || ''));
    assert.equal(res.length, 4, 'the order appoints 4 Resurrection troparia, not the full 6');
    assert.ok(res.every(x => x.tone === 2), 'Resurrection troparia are Tone 2');

    const dorm = t.filter(x => /Dormition/.test(x.label || ''));
    assert.equal(dorm.length, 2, '2 troparia from Ode 1 of the Dormition 2nd canon');
    assert.ok(dorm.every(x => x.tone === 4), 'the 2nd canon of the Dormition is Tone 4');

    const image = t.filter(x => /Image/.test(x.label || ''));
    assert.equal(image.length, 4, '4 troparia from Ode 6 of the canon of the Image');
    assert.ok(image.every(x => x.tone === 4),
      'Canon I of the Image is Tone 4; the Tone 6 second canon must not leak in');
  });

  it('INV-2: the Resurrection troparia come first and the Image last', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-16&format=json');
    const labels = troparia(json.blocks).map(x => x.label || '');
    const firstFeast = labels.findIndex(l => !/Resurrection/.test(l));
    assert.equal(firstFeast, 4, 'the Octoechos block is contiguous and leads');
    assert.match(labels[labels.length - 1], /Image/,
      'the Image supplies the tail, so its Theotokion lands at "Now and ever…"');
  });

  it('INV-3: the Image Theotokion holds the Now-and-ever slot', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-16&format=json');
    const blocks = json.blocks.filter(b => b.section === 'Third Antiphon');
    const nowIdx = blocks.findIndex(b => b.type === 'doxology' && /^Now and ever/.test(b.text || ''));
    assert.ok(nowIdx > -1, 'the Now-and-ever doxology is present');
    const after = blocks[nowIdx + 1];
    assert.ok(after && after.type === 'hymn', 'a hymn follows the Now-and-ever, not nothing');
    // Must name the Image, not merely "Theotokion": the plain Octoechos
    // fallback also ends in a hymn labelled Theotokion, so a bare /Theotokion/
    // assertion passes on exactly the regression this guards against.
    assert.match(after.label || '', /Image/,
      'the Now-and-ever hymn is the IMAGE\'s Theotokion, not the Octoechos one');
    assert.match(after.label || '', /Theotokion/);
    assert.equal(after.tone, 4, 'Canon I of the Image is Tone 4');
  });

  it('INV-4: the Octoechos Glory and Theotokion are dropped, not doubled', async () => {
    const { json } = await get('/api/liturgy?date=2026-08-16&format=json');
    const t = troparia(json.blocks);
    assert.equal(t.filter(x => x.source === 'octoechos').length, 4,
      'only the 4 resurrection troparia survive from the Octoechos');
    assert.equal(t.filter(x => /^Glory$/i.test(x.label || '')).length, 0,
      'the Octoechos Trinitarian Glory troparion is not sung when the feast supplies the tail');
  });

  it('INV-7: each troparion falls on the stichos the order appoints', async () => {
    // The invariant the first version of this contract was missing. It asserted
    // the COUNT and the SEQUENCE of the troparia, both of which were right, and
    // passed while all four Resurrection troparia sat two stichoi late —
    // reported from the kliros on 2026-08-16.
    //
    // The renderer right-aligns troparia into the twelve slots, so a list short
    // of its appointed length slides everything before the gap. Ten troparia
    // where twelve are appointed must therefore hold the two missing slots open
    // (see `missing` in FEAST_BEATITUDES_BLENDS), not shift.
    const { json } = await get('/api/liturgy?date=2026-08-16&format=json');
    const blocks = json.blocks.filter(b => b.section === 'Third Antiphon');

    // Map each sung troparion to the verse or doxology it follows.
    const onStichos = new Map();
    let current = null;
    for (const b of blocks) {
      if (b.type === 'verse' || b.type === 'doxology') current = b.text || '';
      else if (b.type === 'hymn' && current !== null) onStichos.set(current, b.label || '');
    }
    const at = (fragment) => {
      const key = [...onStichos.keys()].find(k => k.includes(fragment));
      return key === undefined ? null : onStichos.get(key);
    };
    const sung = (fragment) =>
      [...onStichos.keys()].some(k => k.includes(fragment));

    assert.match(at('poor in spirit') || '', /Resurrection/,
      'the first Beatitude verse carries the first Resurrection troparion');
    assert.match(at('mourn') || '', /Resurrection/);
    assert.match(at('meek') || '', /Resurrection/);
    assert.match(at('hunger') || '', /Resurrection/);

    // The two the corpus lacks: appointed here, and deliberately silent.
    assert.equal(sung('merciful'), false,
      'the Dormition 1st-canon slot is held open, not filled by a shifted troparion');

    assert.match(at('peacemakers') || '', /Dormition/,
      'the Dormition 2nd-canon pair begins on the seventh stichos');
    assert.match(at('persecuted') || '', /Dormition/);
    assert.match(at('revile') || '', /Image/);
    assert.match(at('Rejoice') || '', /Image/);
  });

  it('INV-5: the blend does not leak to a neighbouring Sunday in the same window', async () => {
    // 8-23 is the Leavetaking of the Dormition — same window, no Image, and its
    // order appoints no blended Beatitudes.
    const { json } = await get('/api/liturgy?date=2026-08-23&format=json');
    const t = troparia(json.blocks);
    assert.equal(t.filter(x => /Image/.test(x.label || '')).length, 0,
      'the Image is proper to 8-16 alone');
    assert.ok(t.every(x => x.source === 'octoechos'),
      '8-23 still renders the plain Octoechos Beatitudes');
  });

  it('INV-6: an ordinary Sunday still renders the full Octoechos set', async () => {
    const { json } = await get('/api/liturgy?date=2026-09-13&format=json');
    const t = troparia(json.blocks);
    assert.ok(t.length >= 6,
      'a Sunday with no blend keeps all its resurrection troparia — the 6→4 trim ' +
      'is scoped to the blend and must never become global');
    assert.ok(t.every(x => x.source === 'octoechos'));
  });
});
