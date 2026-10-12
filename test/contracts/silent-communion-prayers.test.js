/**
 * Feature contract: silent pre-Communion prayer during the Communion Hymn
 * Spec: features/silent-communion-prayers.md
 *
 * While the clergy commune, the Communion Hymn section printed seven choir-cue
 * rubrics — dead space for anyone not in the choir. With
 * `liturgy.silentCommunionPrayers` the cues give way to the prayer of
 * St. John Chrysostom, for the faithful to pray silently.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('path');
const { spawn } = require('node:child_process');

const PORT = 3117; // distinct: 3116 was the last taken
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    }).on('error', reject);
  });
}
async function waitForServer(maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try { const r = await get('/api/days?from=2026-10-11&to=2026-10-11'); if (r.status === 200) return; } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('server did not start');
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
const DATE   = '2026-10-11'; // Sunday of the Holy Fathers of the 7th Council
const SILENT = 'ch-silent-chrysostom-roof';

async function blocks(url) {
  const r = await get(url);
  assert.equal(r.status, 200, `${url} status`);
  return r.json.blocks || [];
}
const inSection = (bl, section) => bl.filter(b => b.section === section);

describe('silent pre-Communion prayer', () => {
  it('INV-1 — off by default: the OCA base keeps its choir cues and prints no prayer', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=tt`);
    const ch = inSection(bl, 'Communion Hymn');
    assert.ok(ch.some(b => b.id === 'ch-cycle-intro'),
      'base should still emit the Troparia/Kontakia cue intro');
    assert.ok(ch.some(b => /^ch-cycle-(trop|kont)-/.test(b.id)),
      'base should still emit per-hymn cue rubrics');
    assert.equal(ch.filter(b => b.id.startsWith('ch-silent-')).length, 0,
      'base must not print the silent prayer');
  });

  it('INV-2 — on for Tyler the prayer REPLACES the cues, never accompanies them', async () => {
    const ch = inSection(await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`), 'Communion Hymn');
    assert.ok(ch.some(b => b.id === SILENT), 'the prayer should be present');
    const cues = ch.filter(b => /^ch-cycle-/.test(b.id)).map(b => b.id);
    assert.deepEqual(cues, [],
      `every cue rubric must be gone, found: ${cues.join(', ')}`);
  });

  it('INV-3 — it sits in Communion Hymn after the koinonikon, and before Communion Prayer', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`);
    const idx = id => bl.findIndex(b => b.id === id);
    const prayerAt = idx(SILENT);
    assert.ok(prayerAt > -1, 'prayer block present');
    assert.equal(bl[prayerAt].section, 'Communion Hymn', 'section');

    // After every koinonikon hymn of the section, not interleaved with them.
    const koinonika = inSection(bl, 'Communion Hymn')
      .filter(b => b.type === 'hymn').map(b => idx(b.id));
    assert.ok(koinonika.length > 0, 'at least one koinonikon');
    assert.ok(Math.max(...koinonika) < prayerAt,
      'the prayer must follow the koinonikon, not precede it');

    // The section as a whole still precedes the call to the chalice.
    const firstCommunionPrayer = bl.findIndex(b => b.section === 'Communion Prayer');
    assert.ok(firstCommunionPrayer > -1, 'Communion Prayer section present');
    assert.ok(prayerAt < firstCommunionPrayer,
      'Communion Hymn must still come before Communion Prayer');
  });

  it('INV-4 — prayed by all, and the rubric immediately before it says silently', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`);
    const at = bl.findIndex(b => b.id === SILENT);
    assert.equal(bl[at].speaker, 'all', 'speaker');
    assert.equal(bl[at].type, 'prayer', 'type');

    // Walk back over the attribution rubric to the instruction itself, so the
    // test pins the POSITION of the "silently" rubric rather than merely that
    // one exists somewhere in the section.
    const preceding = bl.slice(0, at).reverse()
      .filter(b => b.section === 'Communion Hymn' && b.type === 'rubric')
      .slice(0, 2).map(b => b.text);
    assert.ok(preceding.some(t => /\bsilent/i.test(t)),
      `a rubric just before the prayer must say it is prayed silently, saw: ${JSON.stringify(preceding)}`);
    assert.ok(preceding.some(t => /Chrysostom/i.test(t)),
      `the attribution must render as its own rubric, saw: ${JSON.stringify(preceding)}`);
  });

  it('INV-5 — all ten paragraphs survive, first and last anchored', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`);
    const text = bl.find(b => b.id === SILENT).text;
    const paras = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    assert.equal(paras.length, 10, 'paragraph count');
    assert.match(paras[0], /^O Lord my God, I know that I am not worthy nor sufficiently pleasing/);
    assert.match(paras[9], /well-pleasing to Thee\. Amen\.$/);
  });

  it('INV-6 — the three prayers said ALOUD at Communion Prayer are untouched', async () => {
    const cp = inSection(await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`), 'Communion Prayer');
    // Case-insensitive and joined: Tyler's HTM overlay reads "Of thy mystical
    // Supper" and keeps the three prayers monolithic (no blank lines), so they
    // arrive as ONE block rather than three. Asserting on the section's text
    // rather than its block count keeps this about the prayers, not the overlay.
    const texts = cp.map(b => b.text).join(' ');
    assert.match(texts, /I believe, O Lord, and I confess/i);
    assert.match(texts, /mystical Supper/i);
    assert.match(texts, /(neither to|not unto) (my )?judgment/i);
  });

  it('INV-7 — a modern-register parish gets it converted, with no archaic forms left', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=yy${TYLER}`);
    const b = bl.find(x => x.id === SILENT);
    assert.ok(b, 'prayer must still render in modern register');
    const archaic = b.text.match(/\b(Thou|Thee|Thy|Thine|didst|shouldst|wilt|Thyself)\b/g);
    assert.equal(archaic, null, `archaic forms left after yy conversion: ${archaic && archaic.join(', ')}`);
    assert.equal(b.text.split(/\n\s*\n/).filter(s => s.trim()).length, 10,
      'conversion must not drop a paragraph');
  });

  it('INV-8 — called without fixed texts or rubrics (Typika) it neither throws nor emits the prayer', () => {
    const { _litCommunionHymn } = require('../../assemblers/liturgy-parts/communion');
    const koinonikon = { label: 'Communion Hymn', text: 'Praise the Lord from the heavens.' };
    let out;
    assert.doesNotThrow(() => { out = _litCommunionHymn(koinonikon); });
    assert.equal(out.filter(b => b.id.startsWith('ch-silent-')).length, 0);
    // And with rubrics on but no fixed texts, it must fall through rather than crash.
    assert.doesNotThrow(() => {
      out = _litCommunionHymn(koinonikon, null, undefined,
        { liturgy: { silentCommunionPrayers: true } });
    });
    assert.equal(out.filter(b => b.id.startsWith('ch-silent-')).length, 0);
  });
});
