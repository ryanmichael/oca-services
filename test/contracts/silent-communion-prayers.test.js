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
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

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

  it('INV-9 — the rubric says there is a wait and that it may be prayed quietly', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`);
    const at = bl.findIndex(b => b.id === SILENT);
    const instruction = bl.slice(0, at).reverse()
      .filter(b => b.section === 'Communion Hymn' && b.type === 'rubric')
      .slice(0, 2).map(b => b.text).join(' ');
    assert.match(instruction, /\bwait\b/i,
      `the rubric must say there is a wait, saw: ${JSON.stringify(instruction)}`);
    assert.match(instruction, /\bquietly\b/i,
      `the rubric must say it may be prayed quietly, saw: ${JSON.stringify(instruction)}`);
  });

  it('INV-10 — it renders at the `fine` density, a step smaller than compact', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`);
    const b = bl.find(x => x.id === SILENT);
    assert.equal(b.density, 'fine', 'density step on the block');

    // The class must actually reach the markup in BOTH renderers — the panel
    // (browser) and the print/static page (server) — or the density is inert.
    const src = fs.readFileSync(path.join(ROOT, 'public/scripts/renderer.js'), 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    assert.match(sandbox.window.renderBlocks([b], {}), /class="prayer fine"/,
      'panel renderer must stamp the fine class');

    const { renderService } = require(path.join(ROOT, 'renderer.js'));
    assert.match(renderService([b], { title: 't' }), /class="prayer fine"/,
      'print renderer must stamp the fine class');

    // ...and `fine` must be smaller than `compact`, not merely present.
    const css = fs.readFileSync(path.join(ROOT, 'public/styles/main.css'), 'utf8');
    const px = (sel) => {
      const rule = new RegExp(`${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
      assert.ok(rule, `${sel} must be styled`);
      const size = /font-size:\s*([\d.]+)px/.exec(rule[1]);
      assert.ok(size, `${sel} must set a font-size`);
      return parseFloat(size[1]);
    };
    assert.ok(px('.prayer.fine') < px('.prayer.compact'),
      'the fine step must be smaller than the compact step');
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

  it('INV-11 — Nativity-Fast pre-communion hymns: St John sings them, before the silent prayer; nobody else, and not outside the fast', async () => {
    // variable-sources/seasonal-communion-hymns.json (empty base) + the Tyler
    // overlay, from the Liturgy packet 11.29.26 pp.9-11. Added 2026-11-25.
    const ch = (blocks) => (blocks || []).filter(b => b.section === 'Communion Hymn');
    const tyler = ch((await get('/api/liturgy?date=2026-11-29&translation=st-john-damascus-tyler')).json.blocks);
    const season = tyler.filter(b => /^ch-season-\d+$/.test(b.id));
    assert.equal(season.length, 7, 'all seven forefeast stichera as the packet prints them');
    assert.deepEqual(season.map(b => b.tone), [3, 3, 3, 8, 2, 6, 4], 'tones in packet order');
    assert.match(season[0].text, /^Rejoice, Isaiah/);
    assert.ok(season.every(b => b.speaker === 'choir' && b.type === 'hymn'));
    // Position: after the koinonikon, before the silent prayer.
    const idx = (re) => tyler.findIndex(b => re.test(b.id));
    assert.ok(idx(/^ch-text$/) < idx(/^ch-season-1$/), 'after the Communion Hymn');
    assert.ok(idx(/^ch-season-7$/) < idx(/^ch-silent-rubric$/), 'before the silent prayer');

    const base = ch((await get('/api/liturgy?date=2026-11-29')).json.blocks);
    assert.equal(base.filter(b => b.id.startsWith('ch-season-')).length, 0, 'the OCA base appoints none');
    const outside = ch((await get('/api/liturgy?date=2026-11-08&translation=st-john-damascus-tyler')).json.blocks);
    assert.equal(outside.filter(b => b.id.startsWith('ch-season-')).length, 0, 'not outside the Nativity Fast');
  });

  // ── Appendix (liturgy.silentCommunionPrayersInAppendix, 2026-11-26) ───────
  // In print the prayer moves to the back and a note takes its place; the
  // service order (API, screen, audits) does not move. Asserted on POSITION
  // in the rendered markup, not on labels.
  const panel = () => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/scripts/renderer.js'), 'utf8'), sandbox);
    return sandbox.window.renderBlocks;
  };
  const OPENING = 'O Lord my God, I know that I am not worthy';
  const count = (s, needle) => s.split(needle).length - 1;

  it('INV-12 — the API order is unchanged; only print hints are added', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`);
    const i = bl.findIndex(b => b.id === SILENT);
    assert.equal(bl[i].section, 'Communion Hymn', 'still in the Communion Hymn in service order');
    assert.equal(bl[i + 1].section, 'Communion Prayer', 'still immediately before the Communion Prayer');
    const rubric = bl.find(b => b.id === 'ch-silent-rubric');
    assert.ok(rubric.print && rubric.print.pointer, 'the rubric carries the print pointer');
    assert.equal(bl[i].print.appendix, rubric.print.appendix, 'prayer and pointer name the same appendix');
    assert.equal(bl.find(b => b.id === `${SILENT}-label`).print.appendix, rubric.print.appendix,
      'the attribution travels with the prayer');
  });

  it('INV-13 — print moves the prayer behind everything; the pointer sits where it was', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`);
    const html = panel()(bl, { print: true });
    assert.equal(count(html, OPENING), 1, 'printed exactly once');
    const prayerAt = html.indexOf(OPENING);
    const appendixAt = html.indexOf('svc-sec print-appendix');
    assert.ok(appendixAt > 0, 'an appendix section exists');
    assert.ok(prayerAt > appendixAt, 'the prayer is inside the appendix');
    // Every other section ends before the appendix starts: nothing after it.
    assert.equal(html.slice(appendixAt + 1).indexOf('<div class="svc-sec"'), -1,
      'the appendix is the last section');
    // The pointer is where the prayer was: after the koinonikon, before the
    // Communion Prayer heading.
    const pointerAt = html.indexOf('print-pointer');
    assert.ok(pointerAt > html.indexOf('COMMUNION HYMN') && pointerAt < html.indexOf('COMMUNION PRAYER'),
      'the pointer replaces the prayer in the Communion Hymn');
    assert.match(html.slice(pointerAt, pointerAt + 400), /back of this book/);
  });

  it('INV-14 — the screen keeps the prayer inline and prints no pointer', async () => {
    const bl = await blocks(`/api/liturgy?date=${DATE}&pronoun=tt${TYLER}`);
    const html = panel()(bl, {});
    assert.equal(count(html, OPENING), 1);
    assert.ok(html.indexOf(OPENING) < html.indexOf('COMMUNION PRAYER'), 'inline, before the Communion Prayer');
    assert.equal(count(html, 'print-pointer') + count(html, 'print-appendix'), 0);
  });

  it('INV-15 — with the appendix rubric off, the blocks carry no print hint (byte-identical)', () => {
    const { _litCommunionHymn } = require('../../assemblers/liturgy-parts/communion');
    const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixed-texts/liturgy-fixed.json'), 'utf8'));
    const k = { label: 'Communion Hymn', text: 'Praise the Lord from the heavens.' };
    const off = _litCommunionHymn(k, null, f, { liturgy: { silentCommunionPrayers: true } });
    assert.ok(off.some(b => b.id === SILENT));
    assert.equal(off.filter(b => b.print).length, 0);
    const on = _litCommunionHymn(k, null, f,
      { liturgy: { silentCommunionPrayers: true, silentCommunionPrayersInAppendix: true } });
    assert.deepEqual(on.map(b => b.id), off.map(b => b.id), 'same blocks, same order');
    assert.deepEqual(on.map(b => b.text), off.map(b => b.text), 'same texts');
  });

  it('INV-16 — the server-rendered booklet moves it too, and its page keeps it inline', () => {
    const { _litCommunionHymn } = require('../../assemblers/liturgy-parts/communion');
    const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixed-texts/liturgy-fixed.json'), 'utf8'));
    const on = _litCommunionHymn({ label: 'Communion Hymn', text: 'Praise the Lord.' }, null, f,
      { liturgy: { silentCommunionPrayers: true, silentCommunionPrayersInAppendix: true } });
    const { renderService } = require(path.join(ROOT, 'renderer.js'));
    const page = renderService(on, { title: 't' });
    // The page itself: the prayer is wrapped for the booklet to lift out, and
    // the pointer is hidden on screen.
    assert.ok(page.indexOf('class="print-appendix"') < page.indexOf(OPENING), 'prayer wrapped for the booklet');
    assert.match(page, /\.print-pointer \{ display: none; \}/);
    assert.match(page, /querySelectorAll\('\.print-appendix'\)/, 'printBooklet lifts .print-appendix out');
    assert.match(page, /appendix-break/, 'and starts it on a fresh page');
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
