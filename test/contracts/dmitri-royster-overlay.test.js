/**
 * Feature contract: the Archbishop Dmitri (Royster) translation layer
 *
 * `fixed-texts/translations/dmitri-royster/` carries the English translation of
 * Archbishop Dmitri (Royster), late Archbishop of Dallas and the South, as used
 * in the Diocese of the South choir books. Transcribed 2026-08-07 from the
 * St. John of Damascus (Tyler) parish choir book (docs/Fixed Divine Liturgy -
 * St John/, 15pp scanned).
 *
 * Cascade:  base → sts-sluzhebnik → oca → dmitri-royster → st-john-damascus-tyler
 *
 * Two of the texts could NOT go in the layer: `cherubic-hymn` and
 * `pre-communion.prayer-chrysostom` have active rows in `parish_variant_picks`,
 * and the parish overlay is the cascade LEAF — a pick masks anything the layer
 * says. Those live in the variant library as `royster-bortniansky` / `royster`
 * and are pinned to Tyler. INV-5 pins that they actually win.
 *
 * THE IMPORTANT ONE IS INV-3. The source scan is incomplete for both typical
 * antiphons (First skips mm. 35-80; Second has a paste-up seam skipping
 * mm. 36-71), so the layer deliberately ships NO antiphon keys. Authoring them
 * from the visible text would replace the `oca` layer's 10- and 8-verse arrays
 * with ~4 verses each and silently delete canon — which is exactly what
 * happened in c95da45 (Tyler's First Antiphon lost Ps 102:3-21 to a
 * folder-transcribed short form, caught only when the user noticed at Liturgy).
 * INV-3 fails the moment anyone adds those keys without the missing pages.
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
const PORT = 3089; // distinct: royster 3089, faithful-litany 3090, hours-precede 3091,
                   // lic-no-leading-repeat 3092, afterfeast/beatitudes 3093, vespers 3094,
                   // polyeleos 3095, sunday-kontakia 3096, confess 3097, patron 3098,
                   // smoke 3099, dev 3000
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
// An ordinary Sunday — no Great Feast, so the typical (Typica) antiphons render.
const ORDINARY_SUNDAY = '2026-06-21';

async function liturgyText(date, translation) {
  const { json } = await get(`/api/liturgy?date=${date}&translation=${translation}`);
  assert.ok(json && json.blocks, `no blocks for ${date} / ${translation}`);
  return json.blocks.map(b => b.text || '').join('\n');
}

describe('Feature contract: Archbishop Dmitri (Royster) translation layer', () => {

  it('INV-1: the layer supplies its own Only-Begotten Son, Creed and Beatitudes', async () => {
    const text = await liturgyText(ORDINARY_SUNDAY, TYLER);
    // Distinctive Royster readings, each differing from the `oca` layer beneath.
    assert.match(text, /Only-begotten Son and Immortal Word of God/,   'Only-Begotten Son');
    assert.match(text, /of His Kingdom there shall be no end/,          'Creed');
    assert.match(text, /I confess one baptism for the forgiveness of sins/, 'Creed (baptism clause)');
    assert.match(text, /Blessed are the clean of heart/,                'Beatitudes (clean of heart)');
    assert.match(text, /shall be called the children of God/,           'Beatitudes (children of God)');
  });

  it('INV-2: the `oca` readings the layer replaces are gone (no double-render)', async () => {
    const text = await liturgyText(ORDINARY_SUNDAY, TYLER);
    assert.doesNotMatch(text, /Whose Kingdom shall have no end/,   'oca Creed still present');
    assert.doesNotMatch(text, /I acknowledge one Baptism/,          'oca Creed baptism clause still present');
    assert.doesNotMatch(text, /Blessed are the pure in heart/,      'oca Beatitudes still present');
    assert.doesNotMatch(text, /called the sons of God/,             'oca Beatitudes still present');
  });

  it('INV-3: the layer ships NO typical-antiphon keys, and Tyler keeps the full oca arrays', async () => {
    // (a) Structural guard — the file itself must not declare them. This is the
    //     tripwire: it fires at authoring time, before anything renders.
    const layer = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'fixed-texts', 'translations', 'dmitri-royster', 'liturgy-fixed.json'), 'utf8'));
    for (const key of ['typical-antiphon-1', 'typical-antiphon-2']) {
      assert.ok(!(key in layer),
        `dmitri-royster must not declare ${key} — the source scan is incomplete for it ` +
        `(see manifest._transcription.notTranscribed). Adding it from the visible text ` +
        `replaces the full oca array and deletes canon, as in c95da45.`);
    }

    // (b) Behavioural guard — the canonical text must still exist in the
    //     cascade. Tyler DOES sing an abridged antiphon (confirmed with the
    //     parish 2026-08-08), but that abridgement is a parish practice entry,
    //     not a translation-layer edit: the words are untouched and every verse
    //     is still there for anyone who selects `oca`. See
    //     features/practice-layer.md and its INV-3.
    const oca = await liturgyText(ORDINARY_SUNDAY, 'oca');
    for (const [label, re] of [
      ['Ps 102:2 (forget not)',        /forget not all/],
      ['Ps 102 mid-psalm (Moses)',     /He hath made His ways known unto Moses/],
      ['Ps 145 mid-psalm (prisoners)', /prisoners|fettered|bowed down|looseth/],
    ]) {
      assert.match(oca, re,
        `canonical ${label} is gone — an abridgement deleted text instead of selecting it`);
    }
  });

  it('INV-4: Tyler renders traditional register, matching the choir books', async () => {
    // The Royster sources are archaic throughout ("blessed art Thou", "thine own
    // immaculate Body"). Tyler's defaultPronoun was flipped yy->tt on 2026-08-07
    // so the rendered text matches what the choir actually sings; under `yy` the
    // `-eth` verbs survive conversion and produce "who cleanseth all your...".
    const text = await liturgyText(ORDINARY_SUNDAY, TYLER);
    // Litany responses — present in every Liturgy regardless of the day's propers.
    assert.match(text, /by Thy grace/,          'expected Thee/Thou register');
    assert.match(text, /To Thee, O Lord/,       'expected Thee/Thou register');
    assert.doesNotMatch(text, /by Your grace/,  'modern register leaked through');
    assert.doesNotMatch(text, /To You, O Lord/, 'modern register leaked through');
  });

  it('INV-5: the pinned Royster variants beat the parish-leaf masking rule', async () => {
    // cherubic-hymn + pre-communion have parish_variant_picks rows. The parish
    // overlay is the cascade leaf, so a stale pick would mask the layer entirely.
    const text = await liturgyText(ORDINARY_SUNDAY, TYLER);
    assert.match(text, /We, the Cherubim mystically representing/,     'Royster Cherubic');
    assert.match(text, /That the King of all we may receive/,          'Royster Cherubic pt2');
    assert.match(text, /of whom I am first/,                           'Royster pre-communion');
    assert.match(text, /thine own immaculate Body/,                    'Royster pre-communion');
    // The superseded 2026-06-19 service-folder transcriptions must not render.
    assert.doesNotMatch(text, /Let us who mystically, mystically/, 'superseded russian-doubled-1 still rendering');
    assert.doesNotMatch(text, /of whom I am chief/,                'superseded htm pre-communion still rendering');
  });

  it('INV-6: the layer changes nothing for parishes that do not extend it', async () => {
    const oca = await liturgyText(ORDINARY_SUNDAY, 'oca');
    assert.doesNotMatch(oca, /Only-begotten Son and Immortal Word/, 'Royster text leaked into oca');
    assert.doesNotMatch(oca, /Blessed are the clean of heart/,      'Royster text leaked into oca');
    assert.match(oca, /Blessed are the pure in heart/,              'oca lost its own Beatitudes');
  });
});
