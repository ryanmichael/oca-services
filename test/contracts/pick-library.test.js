/**
 * Feature contract: the pick catalog and the practice library
 *
 * Two things are pinned here.
 *
 * 1. THE UI CANNOT DRIFT FROM THE DATA AGAIN. The settings page used to carry
 *    hand-written <select> markup, and three of five variant keys had one. Tyler's
 *    trilingual Trisagion was live in production and invisible in their own
 *    settings page. Controls are now rendered from /api/pick-library, so adding a
 *    library file adds a control. INV-3 fails if anyone hand-adds markup back.
 *
 * 2. Practice presets resolve, and the resolution precedence between library
 *    presets (Bucket C) and bespoke inline entries (Bucket D) is fixed: an inline
 *    entry REPLACES a preset for the same target. If they stacked instead, the
 *    second `select` would run against an already-selected array and silently
 *    drop text — the failure this whole layer exists to prevent.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const { loadPracticeLibrary, resolveParishPractice, resolvePreset } =
  require(path.join(ROOT, 'server-lib', 'practice', 'library'));
const { fingerprint, explode } = require(path.join(ROOT, 'server-lib', 'practice'));

const PORT = 3086; // distinct: pick-library 3086, practice 3087, royster 3089, …
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

describe('Feature contract: pick catalog + practice library', () => {

  it('INV-1: /api/pick-library serves both libraries with labels and services', async () => {
    const { status, json } = await get('/api/pick-library');
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.variants) && Array.isArray(json.practice));

    for (const kind of ['variants', 'practice']) {
      for (const e of json[kind]) {
        assert.ok(e.key,   `${kind} entry missing key`);
        assert.ok(e.label, `${kind} entry ${e.key} missing label`);
        assert.notEqual(e.label, e.key,
          `${kind} entry ${e.key} has no _label — the settings page would show a raw key ` +
          `to a choir director`);
        assert.ok(e.service, `${kind} entry ${e.key} missing service`);
        assert.ok(Array.isArray(e.options) && e.options.length, `${e.key} has no options`);
      }
    }
  });

  it('INV-2: every non-retired library key is offered, including ones added since the page was written', async () => {
    const { json } = await get('/api/pick-library');
    const variantKeys  = json.variants.map(e => e.key);
    const practiceKeys = json.practice.map(e => e.key);

    // trisagion is the regression case: pinned by Tyler in production, absent
    // from the settings page for months because nobody hand-added the markup.
    assert.ok(variantKeys.includes('trisagion'), 'trisagion missing from the catalog');
    assert.ok(variantKeys.includes('cherubic-hymn'));
    assert.ok(variantKeys.includes('pre-communion-prayer'));
    assert.ok(variantKeys.includes('blessed-is-the-man'));
    assert.ok(practiceKeys.includes('typical-antiphon-1'));
    assert.ok(practiceKeys.includes('typical-antiphon-2'));

    // A key whose every option is retired must NOT be offered: the superseded
    // `typical-antiphon-1` TEXT variant (short-4-verse, retired by c95da45)
    // would otherwise collide with the practice key of the same name.
    assert.ok(!variantKeys.includes('typical-antiphon-1'),
      'a fully-deprecated variant key is still being offered');
  });

  it('INV-3: the settings page hand-writes no pick controls', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'parish-admin.html'), 'utf8');
    assert.ok(!/data-variant-key=/.test(html),
      'parish-admin.html hand-writes a variant <select> again — controls must come ' +
      'from /api/pick-library, or the page will silently drift from the library');
    assert.ok(!/data-pick-key=/.test(html),
      'parish-admin.html hand-writes a pick <select>; render it from the library instead');
    assert.ok(/data-pick-slots="liturgy"/.test(html), 'liturgy pick slot missing');
    assert.ok(/data-pick-slots="vespers"/.test(html), 'vespers pick slot missing');
  });

  it('INV-4: every preset carrying addresses carries a matching fingerprint', async () => {
    // Guards the shared-preset blast radius: one stale fingerprint would affect
    // every parish pinned to that preset, not just the one it was derived from.
    const { getLiturgyFixed } = require(path.join(ROOT, 'server-lib', 'overlays', 'cascade'));
    const { registerBaseFixed, fixedTextRegistry } =
      require(path.join(ROOT, 'server-lib', 'overlays', 'registry'));
    if (!fixedTextRegistry.liturgy) {
      registerBaseFixed('liturgy', require(path.join(ROOT, 'fixed-texts', 'liturgy-fixed.json')));
    }

    const registry = loadPracticeLibrary();
    for (const [key, entry] of Object.entries(registry)) {
      for (const preset of entry.all) {
        if (!preset.op) continue;

        assert.ok(preset.fingerprint, `${key}/${preset.id}: preset with addresses has no fingerprint`);
        // A preset is shared across parishes, but a fingerprint is only meaningful
        // against ONE resolution of the target. `_derivedFrom` names which overlay
        // the selection was derived against; without it the fingerprint is an
        // unfalsifiable number.
        assert.ok(preset._derivedFrom,
          `${key}/${preset.id}: has a fingerprint but no _derivedFrom — nothing records ` +
          `which resolution of ${entry.target.path} it was computed against`);

        const texts = getLiturgyFixed(preset._derivedFrom);
        const arr = entry.target.path.split('.').reduce((o, k) => (o == null ? o : o[k]), texts);
        assert.ok(Array.isArray(arr),
          `${key}/${preset.id}: target ${entry.target.path} is not an array under ` +
          `'${preset._derivedFrom}'`);

        assert.equal(preset.fingerprint, fingerprint(arr),
          `${key}/${preset.id}: fingerprint is stale against '${preset._derivedFrom}' — ` +
          `re-derive the selection from the parish source before updating it`);

        const { byAddress } = explode(arr);
        for (const addr of [].concat(preset.keep || [], preset.reprise || [])) {
          assert.ok(byAddress.has(addr), `${key}/${preset.id}: address ${addr} does not resolve`);
        }

        // Structural parity (dmitri-royster INV-3) means the addresses must also
        // resolve against the base `oca` text — so a preset stays usable by a
        // parish that does not extend the layer it was derived from.
        const ocaArr = entry.target.path.split('.')
          .reduce((o, k) => (o == null ? o : o[k]), getLiturgyFixed('oca'));
        const ocaAddrs = explode(ocaArr).byAddress;
        for (const addr of [].concat(preset.keep || [], preset.reprise || [])) {
          assert.ok(ocaAddrs.has(addr),
            `${key}/${preset.id}: address ${addr} resolves under '${preset._derivedFrom}' ` +
            `but not under 'oca' — the two have diverged structurally`);
        }
      }
    }
  });

  it('INV-5: a preset with no `op` is a real no-op, not an empty selection', () => {
    const registry = loadPracticeLibrary();
    const full = resolvePreset(registry, 'typical-antiphon-1', 'full');
    assert.ok(full, '"full" preset must exist so a parish can state the choice explicitly');
    assert.equal(full.op, undefined);

    const entries = resolveParishPractice(
      [{ practice_key: 'typical-antiphon-1', preset_id: 'full' }], [], registry);
    assert.deepEqual(entries, [], 'a no-op preset must contribute no practice entry');
  });

  it('INV-6: an inline entry REPLACES a preset for the same target, never stacks', () => {
    const registry = loadPracticeLibrary();
    const inline = {
      service: 'liturgy', target: 'typical-antiphon-1.verses',
      op: 'select', keep: ['1.1'],
    };
    const entries = resolveParishPractice(
      [{ practice_key: 'typical-antiphon-1', preset_id: 'krasnostovsky-abridged' }],
      [inline],
      registry);
    assert.equal(entries.length, 1,
      'preset and inline entry both survived — two selects on one target would run the ' +
      'second against an already-selected array and silently drop text');
    assert.deepEqual(entries[0].keep, ['1.1'], 'the inline entry must win');
  });

  it('INV-7: an unresolvable pick contributes nothing rather than throwing', () => {
    const registry = loadPracticeLibrary();
    const entries = resolveParishPractice(
      [{ practice_key: 'typical-antiphon-1', preset_id: 'no-such-preset' },
       { practice_key: 'no-such-key',        preset_id: 'whatever' }],
      [], registry);
    assert.deepEqual(entries, []);
    // drift:check is what makes this loud — see validateParishPractice.
  });
});
