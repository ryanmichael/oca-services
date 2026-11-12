'use strict';

/**
 * Feature contract: a temple keeps its patron at vigil rank.
 *
 * St John of Damascus is six-stichera in the general calendar, so the eve of
 * 12-04 rendered an ordinary weekday DAILY VESPERS — no Litya, no Entrance,
 * three stichera. The parish whose temple he is serves "GV w/Litya for
 * Patronal Feast (St John of Damascus)" (choir blast 2026-11-11), which is the
 * ordinary rule: a temple keeps its own patron with vigil rank.
 *
 * Before this there was only a DOWNGRADE path — `opts.skipVigil`, by which a
 * menaionServiceSet lets a parish render a vigil-rank feast as Daily Vespers.
 * `opts.elevateVigil` is its mirror, and is only ever set from
 * `rubrics.temple`, so no other parish's 12-04 moves.
 *
 * SCOPE, STATED. This fixes the SHAPE only. Whether the patron should also
 * become the day's PRINCIPAL — he is not; Greatmartyr Barbara shares 12-04 and
 * leads — is deliberately NOT decided here. Forcing it via principalOverrides
 * was tried and reverted: it relabelled all five of Barbara's stichera as
 * John's. The director has not yet sent the music for this feast ("Music for
 * the two above feasts will be posted soon"), so there is no oracle for the
 * content split. Shape now, content when the packet arrives.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3143; // unique across the suite — enforced by port-ledger.test.js
const TYLER = '&translation=st-john-damascus-tyler';
const PATRON_EVE = '/api/service?date=2026-12-03&service=vespers';   // eve of 12-04
const PLAIN_EVE  = '/api/service?date=2026-12-01&service=vespers';   // ordinary weekday

function get(u) {
  return new Promise((res, rej) => {
    http.get(`http://localhost:${PORT}${u}`, (r) => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} res(j); });
    }).on('error', rej);
  });
}
async function waitForServer(maxMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try { await get('/'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
}
let serverProcess;
before(async () => {
  serverProcess = spawn('node', ['server.js'],
    { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await waitForServer();
});
after(() => { if (serverProcess) serverProcess.kill(); });

const litya = (bs) => bs.filter(b => /litya/i.test((b.id || '') + (b.section || ''))).length;
const hasEntrance = (bs) => bs.some(b => /Entrance/i.test(b.section || ''));

describe('Feature contract: the temple patron is kept at vigil rank', () => {

  it('INV-1: the patron\'s eve is Great Vespers WITH a Litya, for the parish', async () => {
    // FALSIFIED BY: dropping `opts.elevateVigil` from the branch in
    // calendar/entry.js — the Litya count goes to 0 and the Entrance vanishes.
    const bs = (await get(PATRON_EVE + TYLER)).blocks;
    assert.ok(litya(bs) > 0, 'the patronal feast must have a Litya');
    assert.ok(hasEntrance(bs), 'and an Entrance, i.e. Great Vespers not Daily');
  });

  it('INV-2: the OCA base is untouched on the same date', async () => {
    // The elevation is PARISH-scoped by construction: it is read from
    // rubrics.temple, which only a parish overlay carries. A global change here
    // would move 12-04 for every parish that does not have him as patron.
    const bs = (await get(PATRON_EVE)).blocks;
    assert.equal(litya(bs), 0, 'base must stay Daily Vespers');
    assert.ok(!hasEntrance(bs));
  });

  it('INV-3: an ordinary weekday eve is NOT elevated for the parish', async () => {
    // Guards the guard: if the date comparison were broken open — always true —
    // INV-1 would pass while every weekday became a vigil. 12-01 is an
    // ordinary December weekday for this parish.
    const bs = (await get(PLAIN_EVE + TYLER)).blocks;
    assert.equal(litya(bs), 0, 'only the patron\'s own day is elevated');
  });

  it('INV-4: both saints of the day keep their OWN labels', async () => {
    // The elevation widens Lord-I-Call from three stichera to eight, which
    // surfaces Barbara's five alongside the patron's three. Forcing the patron
    // to be principal relabelled HERS as his; this asserts the labels stay
    // honest, so that regression cannot return silently.
    const bs = (await get(PATRON_EVE + TYLER)).blocks;
    const hymns = bs.filter(b => /^lic-hymn-v\d+$/.test(b.id));
    assert.equal(hymns.length, 8, 'Great Vespers takes eight at Lord-I-Call');
    const labels = hymns.map(b => b.label || '').join(' | ');
    assert.match(labels, /Barbara/, 'Barbara\'s stichera must say Barbara');
    assert.match(labels, /St\. John/, 'and the patron\'s must say John');
  });
});
