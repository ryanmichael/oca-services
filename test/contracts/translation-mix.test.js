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

  it('INV-4: an avoidable mix is flagged; an expected pairing is not', async () => {
    // REWRITTEN 2026-10-05 with the rule. It used to assert "mix 2
    // translations" on 2026-10-07 — but a weekday legitimately draws its cycle
    // from the parish's Daily Octoechos and its saint from whatever book
    // publishes that saint. Flagging that pairing is what made the old count
    // meaningless (it ROSE from 223 to 250 when the texts got more correct).
    //
    // What must still be caught: two translations inside ONE role, meaning one
    // saint's hymns sit in a different English from another's.
    const r = await get('/api/service?date=2026-10-07');
    const found = RULE.check({ service: 'vespers', date: '2026-10-07', assembled: r.json });

    // Whatever it reports, it must not be "this weekday uses two books".
    for (const f of found) {
      assert.ok(!/mix \d+ translations: Daily Octoechos x\d+, OCA/.test(f.message),
        `the expected weekday pairing must not be flagged: ${f.message}`);
    }
    // And a role that genuinely mixes must be named as such.
    if (found.length) {
      assert.ok(found.some(f => /hymns draw on \d+ translations|Weekday cycle is/.test(f.message)),
        `a finding must name the role or the cycle: ${JSON.stringify(found.map(f => f.message))}`);
    }
  });

  it('INV-4b: a Sunday singing a non-OCA source is still caught', async () => {
    // The defect this rule was born for: 2026-10-04 had the Resurrection
    // stichera in the OCA Obikhod beside St Hierotheus in st-sergius.org, and a
    // parishioner heard it. That date is now fixed, so the invariant is tested
    // on the rule's logic with live corpus text.
    //
    // The samples are TAKEN FROM THE INDEX rather than hardcoded: an earlier
    // draft pasted the old Hierotheus wording, which corrections_log #12
    // replaced, so it resolved to 'unknown' and the rule correctly said nothing.
    // A fixture quoting text the corpus no longer holds tests nothing.
    const idx = tp.index();
    const pick = (want) => {
      for (const [text, fam] of idx) if (fam === want && text.length > 80) return text;
      return null;
    };
    const ocaText = pick('oca'), sergiusText = pick('stsergius');
    assert.ok(ocaText && sergiusText, 'precondition: the index holds both families');

    const blocks = [
      { type: 'hymn', section: 'Lord, I Have Cried', source: 'octoechos', text: ocaText },
      { type: 'hymn', section: 'Lord, I Have Cried', source: 'menaion',   text: sergiusText },
    ];
    // 2026-10-03 is a Saturday evening, which opens Sunday.
    const found = RULE.check({ service: 'vespers', date: '2026-10-03', assembled: { blocks } });
    assert.ok(found.some(f => /where OCA is expected/.test(f.message)),
      `a Sunday drawing on st-sergius.org must be flagged: ${JSON.stringify(found)}`);
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

  it('INV-8: a festal Great Vespers is not held to the weekday book', async () => {
    // The Daily Octoechos is the book for DAILY Vespers. Expecting it at a
    // Great Vespers or Vigil produced 46 false positives of 47 "weekday cycle"
    // findings — 45 of them Friday-evening Great Vespers, correctly drawing on
    // OCA. Of the 46, twelve were simply clean and 34 were real findings of a
    // DIFFERENT kind (festal services not on OCA), which the miscategorisation
    // had hidden.
    const r = await get('/api/service?date=2026-01-02');   // a Friday-evening Great Vespers
    assert.match(r.json.serviceName || '', /Great Vespers/, 'precondition: a festal service');
    const found = RULE.check({ service: 'vespers', date: '2026-01-02', assembled: r.json });
    for (const f of found) {
      assert.ok(!/Weekday cycle is/.test(f.message),
        `a festal service must not be held to the weekday book: ${f.message}`);
    }
  });

  it('INV-9: every weekday node now comes from the parish book', () => {
    // Chunk 4 finished: all 48 nodes parse and convert. Any regression that
    // reverts a node to st-sergius.org shows up here rather than in a service.
    const octo = require(path.join(ROOT, 'variable-sources', 'octoechos.json'));
    const EVE = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    let converted = 0, checked = 0;
    for (let t = 1; t <= 8; t++) {
      for (const e of EVE) {
        const hymns = octo[`tone${t}`]?.[e]?.vespers?.lordICall?.hymns || [];
        // Only the PRIMARY set of three is the parish book's; 3-5 are the
        // secondary set, which that book does not print.
        for (const h of hymns.slice(0, 3)) {
          checked++;
          if (h._source === 'mtMaryDailyOctoechos') converted++;
        }
      }
    }
    assert.equal(checked, 144, `expected 8 tones x 6 evenings x 3, got ${checked}`);
    assert.equal(converted, 144, `${checked - converted} primary stichera are not the parish book`);
  });

  it('INV-10: a weekday-eve festal service keeps its Octoechos Theotokion', async () => {
    // A vigil or Great Vespers falling on a WEEKDAY evening still draws its
    // Octoechos Theotokion from that evening's weekday node — which for this
    // parish is the Daily Octoechos. Six vigils were flagged for exactly one
    // Stavrotheotokion on that path ("When she beheld Thee nailed upon the
    // Cross"): the right hymn, from the right book. Expecting OCA there asks
    // the service to draw a weekday hymn from a book that prints none.
    const r = await get('/api/service?date=2026-06-23');   // a weekday All-Night Vigil
    assert.match(r.json.serviceName || '', /Vigil|Great Vespers/, 'precondition: festal');
    const found = RULE.check({ service: 'vespers', date: '2026-06-23', assembled: r.json });
    for (const f of found) {
      assert.ok(!/Daily Octoechos \(octoechos/.test(f.message),
        `the weekday Octoechos Theotokion must not be flagged on a weekday-eve festal service: ${f.message}`);
    }
  });

  it('INV-11: a weekday Great Vespers is not called a Great Feast', () => {
    // The message said "Great Feast service draws on…" for any festal service,
    // including an ordinary Friday-evening Great Vespers. A reader triaging the
    // report would look for a feast that is not there.
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(ROOT, 'audit', 'rules', 'D-structure',
      'D23-translation-mix-within-service.js'), 'utf8');
    assert.match(src, /isGreatFeast \? 'Great Feast' : 'Festal'/,
      'the label must distinguish a Great Feast from an ordinary festal service');
  });
});
