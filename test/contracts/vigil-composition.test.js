/**
 * Feature contract: the All-Night Vigil is ONE service
 *
 * A Vigil is Great Vespers followed immediately by Matins. Before /api/vigil
 * the two halves were only reachable separately — /api/service?service=vespers
 * on the civil evening, /api/matins on the next day — so the UI's "All-Night
 * Vigil" row served the Vespers half alone, closed it with a full Vespers
 * dismissal, and stopped exactly where Matins should have begun.
 *
 * Reported 2026-09-08 by the user, who had attended the vigil and found the
 * service text incomplete in practice.
 *
 * The two endings are explicit alternatives in
 * reference/orders/2024-0908-order-services.txt:
 *
 *   If a Vigil is Served:                Or, if Great Vespers alone is served:
 *     Troparion (3x)                       Resurrectional Troparion
 *     Blessing of the Loaves               Glory… now and ever… Troparion
 *     "Blessed be the Name…" (3x)          Vespers Dismissal
 *     Psalm 33/34:1-10
 *     Priest: "The blessing of the Lord…"
 *     "Amen." And begin Matins with the Six Psalms.
 *
 * NOT covered: the First Hour, which the same order appends ("The First Hour
 * follows immediately"). Its four prayers — "Thou Who at all times…", "O Christ,
 * the true Light…", the concluding kontakion and the small dismissal — are in no
 * local source, and this project does not author liturgical text from memory.
 * Tracked as a source gap; when a Horologion is on hand, add it as an optional
 * tail (the parish asked for it toggleable) and extend INV-5 here.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3105; // distinct: see sibling contract tests for the port ledger
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

// 2026-09-07 (Monday) — eve of the Nativity of the Theotokos, the vigil the
// user attended. Vespers content comes from 09-08; Matins is that same day.
const VIGIL_EVE = '2026-09-07';

const titles = (blocks) =>
  blocks.filter(b => b.label === 'service-title').map(b => b.text);

describe('All-Night Vigil composition', () => {
  it('INV-1: the Vigil contains BOTH a Great Vespers and a Matins half', async () => {
    const { json } = await get(`/api/vigil?date=${VIGIL_EVE}`);
    assert.ok(json && Array.isArray(json.blocks), 'expected a vigil payload');
    assert.deepEqual(titles(json.blocks), ['Great Vespers', 'Matins'],
      'the Vigil must be Great Vespers followed by Matins, in that order');
  });

  it('INV-2: the Vespers half takes the vigil blessing, NOT a Vespers dismissal', async () => {
    const { json } = await get(`/api/vigil?date=${VIGIL_EVE}`);
    const gv = json.blocks.filter(b => b.id && b.id.startsWith('gv-'));

    assert.equal(gv.filter(b => b.id.startsWith('gv-dis')).length, 0,
      'the Vespers dismissal belongs to Great Vespers served ALONE, not to a vigil');

    const blessing = gv.find(b => /^The blessing of the Lord be upon you/.test(b.text || ''));
    assert.ok(blessing, 'expected the priest\'s "The blessing of the Lord be upon you…"');
  });

  it('INV-3: the Matins half opens at the Six Psalms, with no Typical Beginning', async () => {
    const { json } = await get(`/api/vigil?date=${VIGIL_EVE}`);
    const idx = json.blocks.findIndex(b => b.label === 'service-title' && b.text === 'Matins');
    assert.ok(idx > 0, 'Matins title not found');

    const firstAfter = json.blocks[idx + 1];
    assert.equal(firstAfter.section, 'Six Psalms',
      `Matins at a vigil begins with the Six Psalms, got "${firstAfter.section}"`);

    const mt = json.blocks.filter(b => b.id && b.id.startsWith('mt-'));
    assert.equal(mt.filter(b => b.id.startsWith('mt-open')).length, 0,
      'the Typical Beginning is for Matins served alone');
  });

  it('INV-4: the Vigil ends at the Matins dismissal, not mid-service', async () => {
    const { json } = await get(`/api/vigil?date=${VIGIL_EVE}`);
    const last = json.blocks[json.blocks.length - 1];
    assert.equal(last.section, 'Dismissal',
      `the vigil must close with the Matins dismissal, got "${last.section}"`);
  });

  it('INV-5: the Vigil carries the whole of both halves', async () => {
    const [vigil, vespers, matins] = await Promise.all([
      get(`/api/vigil?date=${VIGIL_EVE}`),
      get(`/api/service?date=${VIGIL_EVE}&service=vespers`),
      get('/api/matins?date=2026-09-08'),
    ]);
    // Not an equality check: the halves legitimately differ inside a vigil (no
    // Vespers dismissal, no Matins opening). But the vigil must be substantially
    // the sum of them, never a truncation of one.
    assert.ok(
      vigil.json.blocks.length > vespers.json.blocks.length,
      'the vigil must contain more than the Vespers half alone — this is the ' +
      'exact defect reported: the vigil WAS just Vespers');
    assert.ok(
      vigil.json.blocks.length > matins.json.blocks.length,
      'the vigil must contain more than the Matins half alone');
  });

  it('INV-6: /api/vigil refuses a date with no vigil appointed', async () => {
    // 2026-09-09 (Wednesday) serves ordinary Daily Vespers. Returning a
    // stitched-together "vigil" there would invent a service nobody appointed.
    const { status, json } = await get('/api/vigil?date=2026-09-09');
    assert.equal(status, 404, 'expected 404 where no vigil is appointed');
    assert.match(json.error || '', /no all-night vigil/i);
  });
});
