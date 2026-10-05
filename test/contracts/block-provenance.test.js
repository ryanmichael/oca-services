'use strict';

/**
 * Feature contract: a block reports the translation it actually came from.
 *
 * `block.provenance` is what the UI shows a user asking "whose English is
 * this?". Until 2026-10-05 it answered "OCA" for most of the corpus regardless,
 * through THREE independent defaults:
 *
 *   1. api-service.js — `if (!b.provenance) b.provenance = 'OCA'`, a blanket
 *      fallback for every unlabelled block.
 *   2. for-date.js — read only the FIRST DB row of a slot and mapped anything
 *      that was not stSergius to 'OCA', so all 1,052 lambertsen rows and 353
 *      raphaela rows reported as OCA.
 *   3. overlays/provenance.js — tagged whole source files 'OCA' without
 *      consulting a node's own `_source`, and was in any case only ever called
 *      for the triodion.
 *
 * Each alone was enough to produce the wrong answer, which is why the fix had to
 * reach all three. D23 does not consult this field (its INV-3 pins that) and so
 * stayed honest throughout — the two now agree, from independent evidence.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3108;
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

const hymns = (j) => (j.blocks || []).filter(b => b.type === 'hymn');

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

describe('Feature contract: block provenance', () => {
  it('INV-1: the weekday Octoechos reports its real book, never a blanket OCA', async () => {
    // The point of this invariant is that the weekday cycle reports the source
    // it actually came from. It read 'St. Sergius' until 2026-10-05, when the
    // primary stichera moved to the parish's Daily Octoechos (chunk 4); the
    // assertion follows the data rather than pinning a label that changed for
    // a deliberate reason.
    const r = await get('/api/service?date=2026-10-07');
    const octo = hymns(r.json).filter(b => b.source === 'octoechos');
    assert.ok(octo.length >= 4, `expected weekday Octoechos hymns, got ${octo.length}`);
    const named = octo.filter(b => b.provenance === 'Daily Octoechos' || b.provenance === 'St. Sergius');
    assert.ok(named.length >= 4,
      `the weekday cycle must name its book, got ${JSON.stringify(octo.map(b => b.provenance))}`);
    assert.ok(octo.some(b => b.provenance === 'Daily Octoechos'),
      'the primary stichera now come from the parish Daily Octoechos');
  });

  it('INV-2: a Sunday reports OCA throughout', async () => {
    // The Saturday/Sunday Octoechos nodes carry no `_source` and are the OCA
    // Obikhod; 2026-10-03's Menaion is OCA since corrections_log #12.
    const r = await get('/api/service?date=2026-10-03');
    for (const b of hymns(r.json)) {
      assert.equal(b.provenance, 'OCA',
        `${(b.label || '').slice(0, 30)} reported ${b.provenance}`);
    }
  });

  it('INV-3: a mixed slot reports each hymn honestly', async () => {
    // The old code took the first row's source for the whole slot. 2026-10-07
    // draws from more than one translation and must say so.
    const r = await get('/api/service?date=2026-10-07');
    const provs = new Set(hymns(r.json).map(b => b.provenance));
    assert.ok(provs.size >= 2, `expected a mixed day to report >1 translation, got ${[...provs]}`);
    // Deliberately does NOT pin which families. This date reported
    // St. Sergius + OCA, then Daily Octoechos + St. Sergius + OCA, and now
    // Daily Octoechos + OCA as the conversion progressed. Naming a family here
    // tests the state of the backlog; the invariant is that each hymn is
    // reported honestly rather than collapsed to one label.
    assert.ok([...provs].every(p => p && p !== 'unknown'),
      `every hymn must name a real book, got ${[...provs]}`);
  });

  it('INV-4: lambertsen and raphaela are never silently reported as OCA', async () => {
    // 1,052 + 353 rows displayed as OCA before this fix. Sample the year rather
    // than one date, because a single date proves little about a blanket default.
    const { familyOfText } = require(path.join(ROOT, 'server-lib', 'sources', 'translation-provenance'));
    const LABELS = { lambertsen: 'Lambertsen', raphaela: 'Myrrh-bearers (Raphaela)',
                     stsergius: 'St. Sergius', mtmary: 'Daily Octoechos' };
    let checked = 0;
    for (const date of ['2026-01-01', '2026-03-13', '2026-06-10', '2026-10-07', '2026-11-20']) {
      const r = await get(`/api/service?date=${date}`);
      for (const b of hymns(r.json)) {
        const fam = b.text ? familyOfText(b.text) : 'unknown';
        if (fam === 'unknown' || fam === 'oca') continue;
        checked++;
        assert.equal(b.provenance, LABELS[fam],
          `${date}: a ${fam} hymn reported "${b.provenance}" — "${(b.text || '').slice(0, 44)}"`);
      }
    }
    assert.ok(checked >= 5, `only ${checked} non-OCA hymns examined — the sample went vacuous`);
  });

  it('INV-5: fixed prayers still report OCA', async () => {
    // The fallback is correct for text the corpus index does not hold: the
    // fixed prayers and litanies genuinely are the OCA base. Over-correcting
    // here would label them 'unknown' and look like a regression to a reader.
    const r = await get('/api/service?date=2026-10-03');
    const fixed = (r.json.blocks || []).filter(b => b.type === 'prayer' || b.type === 'response');
    assert.ok(fixed.length > 0, 'precondition: fixed blocks render');
    for (const b of fixed.slice(0, 20)) {
      assert.ok(b.provenance == null || b.provenance === 'OCA',
        `a fixed block reported ${b.provenance}`);
    }
  });

  it('INV-6: the blanket OCA default is gone from the route', () => {
    const src = require('node:fs').readFileSync(
      path.join(ROOT, 'server-lib', 'routes', 'api-service.js'), 'utf8');
    const live = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/if \(!b\.provenance\) b\.provenance = 'OCA';/.test(live),
      'the unconditional OCA default must not come back');
    assert.match(live, /familyOfText/, 'the route must resolve provenance from the text');
  });
});
