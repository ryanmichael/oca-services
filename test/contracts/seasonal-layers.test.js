'use strict';

/**
 * Feature contract: dated seasonal layers — a parish's second set of texts for
 * a window of dates (server-lib/overlays/seasonal-layers.js).
 *
 * Added 2026-11-26. St John of Damascus (Tyler) sings "Liturgy #2" (Greek-chant
 * antiphons and Beatitudes in the Royster translation, Zakkak's It Is Truly
 * Meet, …) from 2026-11-29 until Great Lent — choir blasts 2026-11-10 and
 * 2026-11-16, set docs/choir-packets/2026-11-16/pdf/_unclassified/
 * "Liturgy 2 Greek Antiphons.pdf". Liturgy #1 returns at Clean Monday.
 *
 * Every assertion is by POSITION in the assembled service, and each window
 * assertion is paired with one just outside it, so a layer that leaked to every
 * date — or never switched on — fails here.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3150;
const TYLER = 'st-john-damascus-tyler';
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, json }); });
    }).on('error', reject);
  });
}

const cache = new Map();
async function liturgy(date, translation = TYLER) {
  const k = `${date}|${translation}`;
  if (!cache.has(k)) {
    const q = translation ? `&translation=${translation}` : '';
    const r = await get(`/api/liturgy?date=${date}${q}`);
    assert.equal(r.status, 200, `liturgy ${date} ${translation}`);
    cache.set(k, r.json);
  }
  return cache.get(k);
}
const block = (svc, id) => svc.blocks.find(b => b.id === id);
const text  = (svc, id) => (block(svc, id) || {}).text;

before(async () => {
  serverProcess = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try { if ((await get('/api/days?from=2026-11-29&to=2026-11-29')).status === 200) return; } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

describe('Seasonal layers — St John of Damascus "Liturgy #2"', () => {
  it('INV-1: the window is 2026-11-29 .. 2027-03-14 inclusive, and only for the parish that set it', async () => {
    const on = d => liturgy(d).then(s => s.seasonalLayers.map(l => l.id));
    assert.deepEqual(await on('2026-11-22'), [], 'the Sunday before');
    assert.deepEqual(await on('2026-11-29'), ['greek-chant-royster-liturgy'], 'first day');
    assert.deepEqual(await on('2027-03-14'), ['greek-chant-royster-liturgy'], 'Forgiveness Sunday, last day');
    assert.deepEqual(await on('2027-03-21'), [], 'Lent: Liturgy #1 returns');
    const base = await liturgy('2026-11-29', null);
    assert.deepEqual(base.seasonalLayers, [], 'the OCA base never takes a parish window');
  });

  it('INV-2: First Antiphon — no "Through the intercessions" refrain, closes "…bless His holy name. Blessed art Thou, O Lord"', async () => {
    for (const [d, inWindow] of [['2026-11-29', true], ['2026-11-22', false]]) {
      const s = await liturgy(d);
      const a1 = s.blocks.filter(b => b.section === 'First Antiphon');
      const last = a1[a1.length - 1];
      if (inWindow) {
        assert.equal(last.type, 'verse', `${d}: the antiphon ends on its last verse, not a refrain`);
        assert.match(last.text, /all that is within me bless His holy name\.\nBlessed art Thou, O Lord\.$/);
        assert.ok(!a1.some(b => /intercessions of the Theotokos/.test(b.text)), `${d}: refrain leaked`);
      } else {
        assert.match(last.text, /Through the intercessions of the Theotokos/, `${d}: Liturgy #1 keeps its refrain`);
      }
    }
  });

  it('INV-3: Second Antiphon — "Glory…" before Psalm 145, which omits "Blessed is he who hath the God of Jacob"', async () => {
    const s = await liturgy('2026-11-29');
    const i = s.blocks.findIndex(b => b.id === 'a2-v0');
    assert.match(s.blocks[i - 1].text, /^Glory to the Father, and to the Son, and to the Holy Spirit\.$/);
    const a2 = s.blocks.filter(b => b.section === 'Second Antiphon' && b.type === 'verse').map(b => b.text);
    assert.equal(a2.length, 4);
    assert.ok(!a2.some(t => /God of Jacob/.test(t)));
    assert.match(a2[1], /^Trust not in princes, in the sons of men/);
    const before = await liturgy('2026-11-22');
    assert.ok(before.blocks.some(b => b.section === 'Second Antiphon' && /God of Jacob/.test(b.text)), 'Liturgy #1 keeps the verse');
  });

  it('INV-4: Beatitudes in the Royster wording, opening and closing verses in place', async () => {
    const s = await liturgy('2026-11-29');
    assert.equal(text(s, 'beat-open'), 'In Thy Kingdom remember us, O Lord, when Thou comest in Thy Kingdom.');
    assert.equal(text(s, 'beat-v2'), 'Blessed are those who mourn, for they shall be comforted.');
    assert.match(text(s, 'beat-v6'), /^Blessed are the pure in heart/);
    assert.match(text(s, 'beat-v7'), /called the sons of God\.$/);
    assert.equal(text(s, 'beat-v10'), 'Rejoice and be exceedingly glad, for great is your reward in Heaven.');
    assert.match(text(await liturgy('2026-11-22'), 'beat-v2'), /^Blessed are they that mourn/);
  });

  it('INV-5: Sunday entrance hymn "O come… Save us, O Son of God"; feast and weekday entrance hymns untouched', async () => {
    const s = await liturgy('2026-11-29');
    const eh = block(s, 'entrance-hymn');
    assert.match(eh.text, /^O come, let us worship and fall down before Christ\. Save us, O Son of God, who art risen from the dead/);
    assert.equal(eh.seasonalLayer, 'greek-chant-royster-liturgy');
    // Theophany (2027-01-06) has its own entrance verse; Circumcision (2027-01-01, a Friday) the weekday form.
    for (const d of ['2027-01-06', '2027-01-01']) {
      const f = await liturgy(d);
      assert.equal(f.seasonalLayers.length, 1, `${d} is inside the window`);
      assert.ok(!/^O come, let us worship/.test(text(f, 'entrance-hymn')), `${d}: a non-Sunday entrance hymn was replaced`);
    }
  });

  it('INV-6: Trisagion transliteration, Anaphora responses, and Zakkak It Is Truly Meet', async () => {
    const s = await liturgy('2026-11-29');
    assert.equal(text(s, 'tris-text-2'), 'Svyati Boshe, Svyati Krepki, Svyati Bezsmertni, pomilui nas.');
    assert.equal(text(s, 'sc-5'), 'It is meet and right to worship Father, Son, and Holy Spirit, the Trinity, one in essence and undivided.');
    assert.match(text(s, 'sanctus'), /Lord of Sabaoth!.*Blessed is He that cometh in the Name of the Lord!/);
    assert.match(text(s, 'anamnesis-r'), /^We hymn Thee, we bless Thee, we give thanks unto Thee, O our God/);
    assert.match(text(s, 'megalynarion'), /than the Seraphim, who without corruption gavest birth to God the Word/);
    // A feast's own Hymn to the Theotokos is never replaced (Nativity, inside the window).
    assert.match(text(await liturgy('2026-12-25'), 'megalynarion'), /^Magnify, O my soul/);
    // Outside the window the parish's standing wording is back.
    const after = await liturgy('2027-03-28');
    assert.equal(after.seasonalLayers.length, 0);
    assert.match(text(await liturgy('2026-11-22'), 'anamnesis-r'), /^We praise Thee/);
  });

  it('INV-7: "O Lord, born of the Virgin" at communion, after the Nativity-Fast stichera, before the silent prayer', async () => {
    const s = await liturgy('2026-11-29');
    const ids = s.blocks.map(b => b.id);
    const lastSeason = ids.lastIndexOf('ch-season-7');
    const label = ids.indexOf('ch-born-of-virgin-label');
    const silent = ids.indexOf('ch-silent-rubric');
    assert.ok(lastSeason > 0 && label === lastSeason + 1, 'follows the seasonal stichera directly');
    assert.ok(silent > label, 'precedes the silent prayer');
    const group = s.blocks.slice(label, silent);
    assert.deepEqual(group.map(b => b.type), ['rubric', 'hymn', 'doxology', 'hymn', 'doxology', 'hymn']);
    assert.match(group[1].text, /^O Lord, born of the Virgin, regard not my transgressions/);
    assert.equal(group[1].tone, 6);
    assert.match(group[5].text, /^Great is the multitude of my transgressions, O Theotokos/);
    assert.ok(!(await liturgy('2026-11-22')).blocks.some(b => b.id.startsWith('ch-born-of-virgin')), 'not before the window');
  });

  it('INV-8: a malformed window is reported, never silently applied', () => {
    const { validateSeasonalLayers, activeSeasonalLayers } = require('../../server-lib/overlays/seasonal-layers');
    assert.deepEqual(validateSeasonalLayers([{ layer: 'greek-chant-royster-liturgy', from: '2026-11-29', to: '2027-03-14' }]), []);
    assert.equal(validateSeasonalLayers([{ layer: 'no-such-layer', from: '2026-11-29', to: '2027-03-14' }]).length, 1);
    assert.equal(validateSeasonalLayers([{ layer: 'greek-chant-royster-liturgy', from: '2027-03-14', to: '2026-11-29' }]).length, 1);
    assert.equal(validateSeasonalLayers([{ layer: 'greek-chant-royster-liturgy', from: '11-29', to: '2027-03-14' }]).length, 1);
    assert.deepEqual(activeSeasonalLayers({ seasonalLayers: [{ layer: 'greek-chant-royster-liturgy', from: '11-29', to: '2027-03-14' }] }, '2026-12-06', 'liturgy'), []);
  });
});
