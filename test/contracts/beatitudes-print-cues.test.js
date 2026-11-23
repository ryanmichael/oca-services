'use strict';

/**
 * Feature contract: the Reader's Beatitude troparia print as cues.
 * Spec: features/beatitudes-print-cues.md
 *
 * A parish whose Reader reads the Third Antiphon troparia
 * (`antiphons.beatitudesTropariaReaderLed`) can print each one as a one-line
 * cue — "Reader: Troparion of the Resurrection" — with the Beatitude verses
 * set as sung text (`antiphons.beatitudesTropariaPrintAsCues`). Presentation
 * only: the API keeps every text, and a Reader's copy prints them.
 *
 * Asserted by POSITION, not by label ([[feedback-assert-structure-not-labels]]):
 * the cue a troparion carries is checked against the verse slot it sits on.
 *
 *   INV-1  St John's: every Third Antiphon troparion carries a cue AND still
 *          carries its full text, speaker reader, label and tone.
 *   INV-2  the cue names what sits in each slot — 2026-11-22 (6 Resurrection +
 *          4 Entry) and 2026-11-29 (6 Resurrection + Trinity + Theotokion).
 *   INV-3  without the rubric (the OCA base) no block carries a print hint.
 *   INV-4  the Octoechos half is named by POSITION, so the Myrrh-bearers
 *          stack — whose Beatitudes have no labels at all — is named right.
 *   INV-5  the print renderer prints the cue and not the text; a Reader's copy
 *          and the on-screen panel print the text and not the cue.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const PORT = 3147;  // unique across the suite — enforced by test/contracts/port-ledger.test.js
const ROOT = path.join(__dirname, '..', '..');
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

async function third(date, q) {
  const r = await get(`/api/liturgy?date=${date}${q ? '&' + q : ''}`);
  assert.equal(r.status, 200, `${date} → ${r.status}`);
  return r.json.blocks.filter(b => b.section === 'Third Antiphon');
}

/** The troparion that follows each verse slot, keyed by the slot it sits on. */
function bySlot(blocks) {
  const out = {};
  let slot = null;
  for (const b of blocks) {
    if (b.type === 'verse' || b.type === 'doxology') slot = b.id;
    else if (b.type === 'hymn') out[slot] = b;
  }
  return out;
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

describe('Beatitudes print cues', () => {
  it('INV-1 — St John\'s troparia carry a cue and keep their full text', async () => {
    const b = await third('2026-11-22', TYLER);
    const hymns = b.filter(x => x.type === 'hymn');
    assert.equal(hymns.length, 10);
    for (const h of hymns) {
      assert.equal(typeof h.print?.cue, 'string', `${h.id}: no cue`);
      assert.equal(h.speaker, 'reader', `${h.id}: speaker`);
      assert.ok(h.text && h.text.length > 40, `${h.id}: the API must keep the full text`);
      assert.ok(h.label && h.tone, `${h.id}: label/tone kept`);
    }
    for (const v of b.filter(x => x.type === 'verse' || x.type === 'doxology')) {
      assert.deepEqual(v.print, { emphasis: 'sung' }, `${v.id}: verse not marked sung`);
    }
  });

  it('INV-2 — each slot\'s cue names what sits in it', async () => {
    const R = 'Troparion of the Resurrection';
    const e = bySlot(await third('2026-11-22', TYLER));
    const want22 = {
      'beat-v3': R, 'beat-v4': R, 'beat-v5': R, 'beat-v6': R, 'beat-v7': R, 'beat-v8': R,
      'beat-v9': 'Troparion of the Entry', 'beat-v10': 'Troparion of the Entry',
      'beat-glory': 'Troparion of the Entry', 'beat-now': 'Troparion of the Entry',
    };
    assert.deepEqual(Object.fromEntries(Object.entries(e).map(([k, h]) => [k, h.print.cue])), want22);

    const o = bySlot(await third('2026-11-29', TYLER));
    const want29 = {
      'beat-v5': R, 'beat-v6': R, 'beat-v7': R, 'beat-v8': R, 'beat-v9': R, 'beat-v10': R,
      'beat-glory': 'Hymn to the Trinity', 'beat-now': 'Theotokion',
    };
    assert.deepEqual(Object.fromEntries(Object.entries(o).map(([k, h]) => [k, h.print.cue])), want29);
  });

  it('INV-3 — without the rubric, no block carries a print hint', async () => {
    const r = await get('/api/liturgy?date=2026-11-22');
    const hinted = r.json.blocks.filter(b => b.print !== undefined).map(b => b.id);
    assert.deepEqual(hinted, []);
    const base = r.json.blocks.filter(b => b.section === 'Third Antiphon' && b.type === 'hymn');
    assert.ok(base.every(h => h.speaker === 'choir'), 'base keeps the choir singing them');
  });

  it('INV-4 — the Octoechos half is named by position (Myrrh-bearers stack has no labels)', () => {
    const { buildBeatitudesTroparia } = require(path.join(ROOT, 'server-lib/sources/beatitudes.js'));
    const myrrh = JSON.parse(fs.readFileSync(path.join(ROOT, 'variable-sources/octoechos-myrrhbearers.json'), 'utf8'));
    for (let tone = 1; tone <= 8; tone++) {
      const list = buildBeatitudesTroparia(true, tone, { octoechos: myrrh }, '2026-11-29', null, null);
      assert.equal(list.length, 8, `tone ${tone}`);
      assert.ok(list.every(t => !t.label || t.label === 'Beatitude'), `tone ${tone}: fixture has labels now — pick another`);
      assert.deepEqual(list.map(t => t.cue), [
        ...Array(6).fill('Troparion of the Resurrection'), 'Hymn to the Trinity', 'Theotokion',
      ], `tone ${tone}`);
    }
  });

  it('INV-5 — print renders the cue; a Reader\'s copy and the panel render the text', async () => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/scripts/renderer.js'), 'utf8'), sandbox);
    const render = sandbox.window.renderBlocks;
    const blocks = await third('2026-11-22', TYLER);
    const trop = blocks.find(b => b.id === 'beat-t4');

    const pew = render(blocks, { print: true });
    assert.equal((pew.match(/class="rubric print-cue"/g) || []).length, 10);
    assert.ok(!pew.includes(trop.text), 'the pew copy must not print the troparion');
    assert.equal((pew.match(/class="prayer sung"/g) || []).length, 12, 'ten verses + Glory + Now as sung text');

    for (const [name, opts] of [['Reader\'s copy', { print: true, readersCopy: true }], ['panel', {}]]) {
      const html = render(blocks, opts);
      assert.ok(html.includes(trop.text), `${name} must print the troparion`);
      assert.ok(!html.includes('print-cue'), `${name} must not print cues`);
    }

    // Static page/booklet (root renderer.js): the page keeps the text, and the
    // cue is there for the booklet to swap in.
    const { renderService } = require(path.join(ROOT, 'renderer.js'));
    const page = renderService(blocks, { title: 'T', date: '' });
    assert.ok(page.includes('class="rubric print-cue"') && page.includes('class="print-full"'));
  });
});
