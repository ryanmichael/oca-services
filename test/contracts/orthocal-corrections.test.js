/**
 * Feature contract: upstream orthocal defects are corrected on read
 *
 * `data/orthocal/*.json` is a VERBATIM mirror of orthocal.info. When upstream
 * is wrong, the mirror is faithfully wrong with it, and the error reaches the
 * pews: `feasts[]` feeds the Liturgy dismissal saints, so a feast label keyed
 * to the wrong date makes the priest commemorate a saint the day does not
 * commemorate. Every structural check still passes — the troparia, kontakia,
 * prokeimena and readings all come from elsewhere and are all correct.
 *
 * The correction therefore cannot be asserted by looking at the map. These
 * tests assert the POSITION the defect actually occupies: the rendered text of
 * the dismissal block the priest reads. INV-2 is the one that would have caught
 * 2026-11-08; INV-1 is its negative control, so a green INV-2 can never mean
 * "the probe found nothing".
 *
 * Two readers load vendored orthocal and they do not share a code path
 * (server-lib/cache/orthocal.js and server-lib/sources/menaion-principal.js).
 * INV-4 pins that they agree, because a correction applied to only one of them
 * is worse than none — it splits the principal pick from the dismissal.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3125; // distinct: 3124 was the last taken
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
    try { await get('/'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error(`Server did not start within ${maxMs}ms`);
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  serverProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    if (msg.includes('Error') && !msg.includes('EADDRINUSE')) console.error('[server stderr]', msg);
  });
  await waitForServer();
});
after(() => { if (serverProcess) serverProcess.kill(); });

const { applyOrthocalCorrections } = require('../../server-lib/cache/orthocal-corrections');
const { loadOrthocalForDate } = require('../../server-lib/sources/menaion-principal');

const ARCHANGELS = '2026-11-08';            // Sunday, Synaxis of the Archangels
const UNMERCENARIES = 'Synaxis of the Holy Unmercenaries';

const dismissalOf = async (q) => {
  const j = (await get(`/api/liturgy?date=${q}`)).json;
  const b = j.blocks.find(x => x.id === 'dis-proper');
  assert.ok(b, 'the Liturgy must emit a dis-proper block at all');
  return b.text;
};

describe('Feature contract: upstream orthocal defects are corrected on read', () => {

  it('INV-1: the probe can fail — the dismissal does name the day\'s own saints', async () => {
    const t = await dismissalOf(ARCHANGELS);
    assert.match(t, /of Synaxis of Archangel Michael and the Bodiless Powers/,
      'the Archangels must still reach the dismissal; without this, INV-2 proves nothing');
  });

  it('INV-2: a feast keyed to the wrong date never reaches the dismissal', async () => {
    const t = await dismissalOf(ARCHANGELS);
    assert.doesNotMatch(t, /Holy Unmercenaries/,
      'Cosmas and Damian are 11-01; the OCA order for 11-08 names the Archangels alone');
  });

  it('INV-3: the saint is still commemorated on the date he belongs to', async () => {
    // The correction drops a LABEL from the wrong date. It must not be
    // mistaken for a claim that the saint does not exist: 11-01 is untouched.
    const raw = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data', 'orthocal', '2026-11-01.json'), 'utf8'));
    const titles = (raw.stories || []).map(s => (s.title || '')).join(' | ');
    assert.match(titles, /Unmercenaries Cosmas and Damian/,
      '11-01 must keep the Unmercenaries — the defect is the date, not the saint');
  });

  it('INV-4: both vendored readers see the same corrected feasts[]', async () => {
    // menaion-principal.loadOrthocalForDate reads data/orthocal directly and
    // does NOT go through fetchOrthocalDay. If only one applies corrections,
    // the principal pick and the dismissal disagree about the same day.
    const viaDirectReader = loadOrthocalForDate(ARCHANGELS);
    assert.ok(Array.isArray(viaDirectReader.feasts), 'expected a feasts array');
    assert.ok(!viaDirectReader.feasts.includes(UNMERCENARIES),
      'the direct reader must apply the same correction as the cache layer');
  });

  it('INV-5: a correction is a no-op once upstream fixes the data', () => {
    // Stale entries must cost nothing, or nobody will dare prune them.
    const alreadyClean = { feasts: ['Synaxis of Archangel Michael and the Bodiless Powers'] };
    assert.equal(applyOrthocalCorrections(ARCHANGELS, alreadyClean), alreadyClean,
      'unchanged input must come back as the SAME object, not a copy');
  });

  it('INV-6: corrections are scoped to their own date and survive bad input', () => {
    const otherYear = { feasts: [UNMERCENARIES] };
    assert.equal(applyOrthocalCorrections('2027-11-08', otherYear), otherYear,
      'a correction must never leak onto another date');
    assert.equal(applyOrthocalCorrections(ARCHANGELS, null), null);
    assert.deepEqual(applyOrthocalCorrections(ARCHANGELS, { feasts: null }), { feasts: null });
  });
});
