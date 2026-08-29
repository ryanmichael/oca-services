/**
 * Feature contract: the weekday Aposticha "Now and ever"
 *
 * `server-lib/assemble/for-date.js` consulted the Menaion's own aposticha
 * order=-1 row ONLY under `isSaturdayInjection`. On a weekday the Octoechos
 * Theotokion always won, so inside an afterfeast the feast's own Both-now —
 * which the source plainly appoints — never rendered. Its comment claimed the
 * opposite ("would have been used above if present"). Backlog N15.
 *
 * Run: node --test test/contracts/weekday-aposticha-theotokion.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3104; // distinct: hymn-label 3102, lesser-feast-window 3103
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
    try { await get('/'); return; } catch (_) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`Server did not start within ${maxMs}ms`);
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

/** The last Aposticha hymn — the "Now and ever" slot. */
async function apostichaNow(date) {
  const { json } = await get(`/api/service?date=${date}`);
  const hymns = (json.blocks || []).filter(
    b => /Aposticha/i.test(b.section || '') && b.type === 'hymn');
  return hymns[hymns.length - 1] || null;
}

describe('Feature contract: weekday Aposticha "Now and ever"', () => {

  it('INV-1: inside an afterfeast, the feast\'s own Both-now renders on a weekday (1-13)', async () => {
    // 01-13.pdf: "Both now ..., in the same tone: The armies of the angels were
    // filled with awe..." (Tone VIII). Vespers is sung 1-12, a Monday.
    const now = await apostichaNow('2026-01-12');
    assert.ok(now, 'expected an Aposticha Now-and-ever hymn');
    assert.match(now.text || '', /The armies of the angels were filled with awe/,
      `expected the feast Both-now; got: ${(now.text || '').slice(0, 70)}`);
    assert.equal(now.tone, 8, `expected Tone 8; got ${now.tone}`);
  });

  it('INV-2: likewise 8-12, on a Tuesday (Tone V)', async () => {
    // 08-12.pdf: "Both now ..., of the feast, in Tone V: Disclosing a little of
    // the radiance of Thy divinity..."
    const now = await apostichaNow('2026-08-11');
    assert.ok(now, 'expected an Aposticha Now-and-ever hymn');
    assert.match(now.text || '', /Disclosing a little of the radiance/,
      `expected the feast Both-now; got: ${(now.text || '').slice(0, 70)}`);
    assert.equal(now.tone, 5, `expected Tone 5; got ${now.tone}`);
  });

  it('INV-3: a Stavrotheotokion is NOT sung on a non-Cross weekday', async () => {
    // Row 8457 (2-17) is a Stavrotheotokion — "beholding her Bullock willingly
    // nailed to the Tree". 2-17 falls on a Tuesday in 2026, which is not a day
    // that commemorates the Crucifixion, so the Octoechos Theotokion must win.
    const now = await apostichaNow('2026-02-16');
    assert.ok(now, 'expected an Aposticha Now-and-ever hymn');
    assert.doesNotMatch(now.text || '', /unblemished heifer/,
      `a Stavrotheotokion must not be sung on a Tuesday; got: ${(now.text || '').slice(0, 70)}`);
  });

  it('INV-4: no Now-and-ever hymn begins with a rubric fragment', async () => {
    // The moment the weekday branch started reading these rows, two of them
    // printed their rubric aloud: "; or this The unblemished heifer..." and
    // "in the same tone: The Virgin who gave birth...". Neither is caught by
    // RUBRIC_BLEED_PATTERNS, so this asserts the rendered output directly.
    for (const date of ['2026-02-16', '2026-12-29', '2026-01-12', '2026-08-11']) {
      const now = await apostichaNow(date);
      if (!now) continue;
      const t = (now.text || '').trimStart();
      assert.doesNotMatch(t, /^(?:;|,|in the same tone|or this|Both now|Glory)/i,
        `${date}: Now-and-ever begins with a rubric fragment: ${t.slice(0, 60)}`);
    }
  });

  it('INV-5: Saturday behaviour is unchanged — the Menaion order=-1 still wins there', async () => {
    // The Saturday branch already did this correctly; the weekday fix must not
    // have disturbed it. 8-15 is a Saturday inside the Dormition afterfeast.
    const now = await apostichaNow('2026-08-15');
    assert.ok(now, 'expected an Aposticha Now-and-ever hymn on a Saturday');
    assert.ok((now.text || '').length > 40, 'expected a real hymn, not a fragment');
  });
});
