'use strict';

/**
 * Feature contract: Lord I Call Theotokion in the week's tone.
 *
 * At weekday Vespers the "Now and ever…" Theotokion of Lord I Have Cried can be
 * sung in the tone of the saint's Glory (the Slavic rubric, our default) or in
 * the tone of the week (what the calendar entry ships). Both are real usages,
 * and the comment on the aposticha branch of server-lib/assemble/for-date.js
 * has named them all along.
 *
 * St John of Damascus, Tyler sings the week's tone — "We use the tone of the
 * week for the second one - T1… not the tone of the glory verse on LIC, even
 * Wednesday" (choir director, 2026-10-02), confirming the Tone 1 Dogmaticon
 * printed in her 10/01 packet against our Tone 4.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3103;
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

/** The hymn that follows "Now and ever…" inside a named section. */
function nowAndEverHymn(blocks, section) {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if ((b.section || '') !== section) continue;
    if (!/Now and ever/.test(b.text || '')) continue;
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[j].type === 'hymn') return blocks[j];
    }
  }
  return null;
}

/** The tone of the saint's Glory in a section, for contrast with the week's. */
function gloryTone(blocks, section) {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if ((b.section || '') !== section) continue;
    if (!/^Glory to the Father/.test(b.text || '')) continue;
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[j].type === 'hymn') return blocks[j].tone;
    }
  }
  return null;
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch (_) { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

// 2026-10-07 is a Wednesday evening serving Oct 8 (Ven. Pelagia). Her Glory is
// Tone 4; the week is Tone 1. The two usages therefore disagree, which is what
// makes this date the witness.
const EVE = '2026-10-07';

describe('Feature contract: LIC Theotokion in the week tone', () => {
  it('INV-1: default (no overlay) keeps the Slavic usage — the Glory tone', async () => {
    const r = await get(`/api/service?date=${EVE}`);
    const glory = gloryTone(r.json.blocks, 'Lord, I Have Cried');
    const now   = nowAndEverHymn(r.json.blocks, 'Lord, I Have Cried');
    assert.equal(glory, 4, 'precondition: the saint Glory is Tone 4');
    assert.ok(now, 'a Now-and-ever hymn must render');
    assert.equal(now.tone, 4, 'default follows the Glory');
  });

  it('INV-2: Tyler sings the week tone instead', async () => {
    const r = await get(`/api/service?date=${EVE}&translation=st-john-damascus-tyler`);
    const now = nowAndEverHymn(r.json.blocks, 'Lord, I Have Cried');
    assert.ok(now, 'a Now-and-ever hymn must render');
    assert.equal(now.tone, 1, "the week's tone, per the director and her packet");
    assert.notEqual(now.tone, gloryTone(r.json.blocks, 'Lord, I Have Cried'),
      'this date only proves anything because the two tones differ');
  });

  it('INV-3: it is a real hymn, not an empty slot', async () => {
    // A tone re-key that lands on a missing Octoechos entry would render
    // nothing, and a silently empty Now-and-ever is worse than the wrong tone.
    const r = await get(`/api/service?date=${EVE}&translation=st-john-damascus-tyler`);
    const now = nowAndEverHymn(r.json.blocks, 'Lord, I Have Cried');
    assert.ok((now.text || '').length > 40, `expected a full hymn, got "${now.text}"`);
    assert.match(now.text, /transgressions/, 'the Tone 1 Wednesday Theotokion');
  });

  it('INV-4: the Aposticha Theotokion is NOT changed by this rubric', async () => {
    // The director spoke only of Lord I Call. The same Slavic re-key governs
    // the Aposticha, and widening the rubric to cover it would be assuming an
    // answer she did not give.
    const base  = await get(`/api/service?date=${EVE}`);
    const tyler = await get(`/api/service?date=${EVE}&translation=st-john-damascus-tyler`);
    const a = nowAndEverHymn(base.json.blocks, 'Aposticha');
    const b = nowAndEverHymn(tyler.json.blocks, 'Aposticha');
    assert.ok(a && b, 'both must render an Aposticha Now-and-ever');
    assert.equal(b.tone, a.tone, 'the Aposticha tone must be untouched');
  });

  it('INV-5: the rubric is registered so parish-admin can offer it', async () => {
    const registry = require(path.join(__dirname, '..', '..', 'data', 'rubric-registry.json'));
    const entry = registry.rubrics.licTheotokionWeekTone;
    assert.ok(entry, 'licTheotokionWeekTone must be in the registry');
    assert.equal(entry.type, 'boolean');
    assert.equal(entry.default, false, 'default off — everyone else keeps the Slavic usage');
    assert.equal(entry.namespace, 'lordICall.theotokionWeekTone');
  });
});
