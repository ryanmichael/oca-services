'use strict';

/**
 * Feature contract: a service is sung in ONE English translation.
 *
 * CLAUDE.md has always said so. Nothing enforced it, and on 2026-10-03 a
 * parishioner heard the result at Great Vespers: seven Resurrection stichera in
 * the OCA Obikhod's English beside St Hierotheus's three in st-sergius.org's.
 *
 * This pins the detector, not the corpus. 225 of 365 Vespers currently mix, and
 * that number is expected to fall as the convertible subset is converted — it is
 * deliberately NOT asserted here, because a contract that encodes today's
 * backlog fails the moment the backlog improves.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const tp   = require(path.join(ROOT, 'server-lib', 'sources', 'translation-provenance'));
const RULE = require(path.join(ROOT, 'audit', 'rules', 'D-structure',
                               'D23-translation-mix-within-service'));

const PORT = 3107;
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

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch (_) { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

describe('Feature contract: translation-mix detection', () => {
  it('INV-1: the index covers BOTH ground-truth homes and all four families', () => {
    // The first draft required better-sqlite3, which this project does not use;
    // the catch swallowed "Cannot find module" and the index silently held only
    // the Octoechos — 1,587 texts, zero lambertsen, zero raphaela. A detector
    // blind to two of four translations reports the corpus far cleaner than it
    // is, so the DB load is asserted explicitly rather than assumed.
    const idx = tp.index({ force: true });
    assert.equal(idx._dbError, null, `DB index failed: ${idx._dbError}`);
    assert.ok(idx._dbRows > 3000, `expected the stichera table, got ${idx._dbRows} rows`);

    const fams = new Set();
    for (const v of idx.values()) if (typeof v === 'string') fams.add(v);
    for (const f of ['oca', 'stsergius', 'lambertsen', 'raphaela']) {
      assert.ok(fams.has(f), `family '${f}' missing from the index`);
    }
  });

  it('INV-2: the OCA artifacts are one family', () => {
    // The parish booklet IS the OCA text — measured 96.6%-100% against
    // files.oca.org across five services. Treating it as a separate translation
    // would flag every corrected date as a mix.
    assert.equal(tp.familyOf('oca-menaion'), 'oca');
    assert.equal(tp.familyOf('oca-feast'), 'oca');
    assert.equal(tp.familyOf('tyler-booklet'), 'oca');
    assert.equal(tp.familyOf('oca-packet-2026-0919'), 'oca');
    assert.equal(tp.familyOf('stSergius'), 'stsergius');
    assert.equal(tp.familyOf('lambertsen'), 'lambertsen');
    assert.equal(tp.familyOf(null), 'unknown');
  });

  it('INV-3: it does NOT trust block.provenance', () => {
    // `provenance` reads only the first DB row of a slot and maps anything that
    // is not stSergius to 'OCA', so lambertsen and raphaela rows report as OCA
    // and the weekday Octoechos does too. A detector built on it would miss the
    // majority of mixes.
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(ROOT, 'audit', 'rules', 'D-structure',
      'D23-translation-mix-within-service.js'), 'utf8');
    const live = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
      .replace(/require\([^)]*\)/g, '')          // the module is NAMED translation-provenance
      .replace(/'[^']*provenance[^']*'/g, '');
    assert.ok(!/\.provenance\b/.test(live),
      'the rule must resolve translation from the text, never read block.provenance');
  });

  it('INV-4: a genuinely mixed service is flagged, naming both translations', async () => {
    // 2026-10-07: the weekday Octoechos (st-sergius.org) beside a Raphaela hymn.
    const r = await get('/api/service?date=2026-10-07');
    const found = RULE.check({ service: 'vespers', date: '2026-10-07', assembled: r.json });
    assert.equal(found.length, 1, 'expected exactly one finding');
    assert.match(found[0].message, /mix 2 translations/);
    assert.match(found[0].message, /St\. Sergius/);
    assert.ok(found[0].hint.length > 40, 'the finding must name something actionable');
  });

  it('INV-5: a single-translation service is NOT flagged', async () => {
    // The over-firing guard. 2026-10-03 is OCA throughout after
    // corrections_log #11 and #12 — it must come back clean, or the rule is
    // just reporting that stichera exist.
    const r = await get('/api/service?date=2026-10-03');
    const found = RULE.check({ service: 'vespers', date: '2026-10-03', assembled: r.json });
    assert.deepEqual(found, [], `2026-10-03 should be single-translation now: ${JSON.stringify(found)}`);
  });

  it('INV-6: an unresolvable text does not count as a second translation', () => {
    // 30 indexed texts resolve to 'unknown' (generated or transformed hymns).
    // Counting them as a translation would flag services that are in fact clean.
    const blocks = [
      { type: 'hymn', section: 'Lord, I Have Cried', text: 'a hymn no corpus has ever held' },
      { type: 'hymn', section: 'Lord, I Have Cried', text: 'nor this one either, friend' },
    ];
    assert.deepEqual(RULE.check({ service: 'vespers', date: '2026-10-03',
                                 assembled: { blocks } }), []);
  });

  it('INV-7: severity stays low while the backlog is corpus-wide', () => {
    // 225 of 365 Vespers mix today. At high or medium this would turn the
    // pre-push gate red on a known condition that cannot be fixed in one step.
    // Raise it deliberately, with the conversion — not by accident.
    assert.equal(RULE.severity, 'low');
    assert.equal(RULE.needsAssembled, true,
      'needsAssembled=false would make it silently no-op under audit:quick');
  });
});
