/**
 * Feature contract: Parish Menaion override
 * Spec: features/parish-menaion-override.md
 *
 * One test per INV-*. The render-level tests read the TEXT and the ANNOUNCED
 * TONE, not the label — a Tone 8 hymn under a "Tone 6" announcement is a
 * failure this project has shipped before (feedback_assert_structure_not_labels).
 * The guard tests drive the applier directly, so they can falsify the sha
 * check without mutating oca.db.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  sha256, applyToStichera, applyToTroparia, collectMenaionOverrides,
} = require('../../server-lib/sources/menaion-overrides');
const { loadVariantLibrary, resolveVariant } = require('../../server-lib/variants');

const PORT = 3114; // distinct: 3113 was the last taken
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
    try { await get('/'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
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

const TYLER = '&parish=st-john-damascus-tyler&translation=st-john-damascus-tyler';
const EVE = '2026-10-10';
const SUN = '2026-10-11';

async function vespers(date, extra = '') {
  const r = await get(`/api/service?date=${date}${extra}`);
  assert.equal(r.status, 200);
  return r.json.blocks;
}
async function liturgy(date, extra = '') {
  const r = await get(`/api/liturgy?date=${date}${extra}`);
  assert.equal(r.status, 200);
  return r.json.blocks;
}
const licHymns = bs => bs.filter(b => b.section === 'Lord, I Have Cried' && b.type === 'hymn');

describe('Parish Menaion override', () => {
  it('INV-1: the parish renders its own sticheron and its own kontakion', async () => {
    const h = licHymns(await vespers(EVE, TYLER));
    assert.match(h[5].text, /^You expelled the vicious heretics from the Savior's fold/);

    const k = (await liturgy(SUN, TYLER)).filter(b => b.section === 'Kontakia' && b.type === 'hymn');
    assert.ok(
      k.some(x => /^The apostles' preaching and the fathers' doctrines/.test(x.text)),
      'the parish kontakion of the Fathers'
    );
  });

  it('INV-2: the OCA base is untouched by the parish pick', async () => {
    const h = licHymns(await vespers(EVE));
    assert.match(h[5].text, /^The seven honorable councils of the Fathers/,
      'base keeps the OCA repeat at slot 6');

    const k = (await liturgy(SUN)).filter(b => b.section === 'Kontakia' && b.type === 'hymn');
    assert.ok(k.some(x => /^The Son, Who shone forth ineffably/.test(x.text)),
      'base keeps the OCA Tone 6 kontakion');
    assert.ok(!k.some(x => /apostles' preaching/.test(x.text)),
      'the parish variant must not leak into the base');
  });

  it('INV-3: the override carries its tone, and the rubric announces THAT tone', async () => {
    const bs = await liturgy(SUN, TYLER);
    const i = bs.findIndex(b => b.section === 'Kontakia' && b.type === 'hymn'
      && /^The apostles' preaching/.test(b.text || ''));
    assert.ok(i > 0, 'parish kontakion present');
    assert.equal(bs[i].tone, 8, 'the hymn is Tone 8');
    const rubric = bs[i - 1];
    assert.equal(rubric.type, 'rubric');
    assert.match(rubric.text, /Tone 8:?$/, `announcement must say Tone 8, got: ${rubric.text}`);
  });

  it('INV-4: targeting is positional — the identical sticheron at slot 5 is NOT replaced', async () => {
    const h = licHymns(await vespers(EVE, TYLER));
    assert.match(h[4].text, /^The seven honorable councils of the Fathers/,
      'slot 5 keeps the base text even though it is byte-identical to the replaced slot');
    assert.notEqual(h[4].text, h[5].text, 'and the two slots now differ');
  });

  it('INV-5: the sha guard detaches when the base text changes', () => {
    const comm = { title: 'X' };
    const ovr = [{
      key: 'k', variantId: 'v',
      target: {
        kind: 'menaion',
        commemoration: { month: 1, day: 1, title: 'X' },
        hymn: { table: 'stichera', section: 'lordICall', order: 2 },
        expect: [sha256('BASE')],
      },
      value: { tone: 6, text: 'PARISH' },
    }];
    const match  = applyToStichera(ovr, 1, 1, comm, [{ section: 'lordICall', order: 2, tone: 1, text: 'BASE' }]);
    assert.equal(match[0].text, 'PARISH', 'applies when the base matches');
    assert.equal(match[0].tone, 6);

    const drifted = applyToStichera(ovr, 1, 1, comm, [{ section: 'lordICall', order: 2, tone: 1, text: 'BASE CHANGED' }]);
    assert.equal(drifted[0].text, 'BASE CHANGED', 'detaches — base renders, parish text is NOT forced on');

    const wrongSlot = applyToStichera(ovr, 1, 1, comm, [{ section: 'lordICall', order: 3, tone: 1, text: 'BASE' }]);
    assert.equal(wrongSlot[0].text, 'BASE', 'does not apply to another slot with identical text');

    const wrongDay = applyToStichera(ovr, 2, 2, comm, [{ section: 'lordICall', order: 2, tone: 1, text: 'BASE' }]);
    assert.equal(wrongDay[0].text, 'BASE', 'does not apply on another date');
  });

  it('INV-5b: troparia targeting matches on type, and guards the same way', () => {
    const comm = { title: 'X' };
    const ovr = [{
      key: 'k', variantId: 'v',
      target: {
        kind: 'menaion',
        commemoration: { month: 1, day: 1, title: 'X' },
        hymn: { table: 'troparia', type: 'kontakion' },
        expect: [sha256('BASE')],
      },
      value: { tone: 8, text: 'PARISH' },
    }];
    const rows = [
      { type: 'troparion', tone: 4, text: 'BASE' },
      { type: 'kontakion', tone: 6, text: 'BASE' },
    ];
    const out = applyToTroparia(ovr, 1, 1, comm, rows);
    assert.equal(out[0].text, 'BASE', 'the troparion is left alone');
    assert.equal(out[1].text, 'PARISH');
    assert.equal(out[1].tone, 8);
  });

  it('INV-6/7: picks resolve, and a parish without them is unaffected', async () => {
    const library = loadVariantLibrary();
    const picks = [
      { variant_key: 'fathers-council-lic-sixth', variant_id: 'expelled-heretics' },
      { variant_key: 'pre-communion-prayer',      variant_id: 'royster' },
    ];
    const collected = collectMenaionOverrides(library, picks, resolveVariant);
    assert.equal(collected.length, 1, 'only the menaion-kind pick is collected');
    assert.equal(collected[0].target.kind, 'menaion');

    // A different translation (no menaion picks) keeps the base hymns, and the
    // count of stichera is unchanged — overrides substitute, never add/remove.
    const base  = licHymns(await vespers(EVE));
    const other = licHymns(await vespers(EVE, '&translation=oca'));
    assert.equal(other.length, base.length);
    assert.match(other[5].text, /^The seven honorable councils of the Fathers/);
  });
});
