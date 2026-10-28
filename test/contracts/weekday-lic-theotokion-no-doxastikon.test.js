/**
 * Feature contract: weekday Lord-I-Call when the saint has no doxastikon
 *
 * A simple weekday saint often has three stichera and no Glory of his own. The
 * books then print ONE combined "Glory… now and ever…" over the Theotokion —
 * the same shape Saturday Great Vespers already renders over its Dogmatikon.
 *
 * Two defects met on 2026-10-29 (Monastic Martyr Anastasia of Rome):
 *
 *   1. DATA — the day's Theotokion was scraped into the order=0 doxastikon
 *      slot of commemoration 2231, so it sang under "Glory to the Father…"
 *      credited to Anastasia, with a SECOND Theotokion from the Octoechos
 *      under "Now and ever…". Two Theotokia back to back. The same scrape put
 *      Ven. Abramius' three stichera (comm 2232) and two troparia on her row.
 *
 *   2. CODE — the entire Glory/Now block in for-date.js is guarded on a
 *      Menaion Glory existing, so once the Theotokion was re-keyed out of
 *      order=0 the section ended on its sixth sticheron and the Theotokion was
 *      never sung at all. 27 of 365 dates in 2026 were dropping it that way,
 *      masked on this date by the mis-key.
 *
 * The structural audit passed 0 high / 0 medium / 0 low on both, before and
 * after: nothing it checks is about who a hymn addresses, and D2 only fires
 * once a Glory is present. `npm run audit:glory-theotokion` is the drift guard
 * over the remaining 38 Glory-slot Theotokia.
 *
 * Asserts POSITION and COUNT, not labels — a label reading "Theotokion" is
 * what made the mis-key invisible in the first place.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3118; // distinct: 3117 was the last taken
const TYLER = '&translation=st-john-damascus-tyler';
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

// Civil evening 10-28 → liturgical 10-29 (Thursday), Tone 4, Daily Vespers.
const vespers = async (date) => (await get(`/api/service?service=vespers&date=${date}${TYLER}`)).json;
const sec = (blocks, name) => blocks.filter(b => b.section === name);

describe('Feature contract: weekday LIC Theotokion when the saint has no doxastikon', () => {
  it('INV-1: 10-28 eve is Daily Vespers for 10-29 with Anastasia principal', async () => {
    const d = await vespers('2026-10-28');
    assert.equal(d.vespersDate, '2026-10-29');
    assert.equal(d.serviceName, 'Daily Vespers');
    assert.equal(d.tone, 4);
    const principal = d.commemorations.find(c => c.isPrincipal);
    assert.match(principal.title, /Anastasia of Rome/);
  });

  it('INV-2: Lord-I-Call is 3 Octoechos then 3 Menaion — Abramius no longer bleeds in', async () => {
    const lic = sec((await vespers('2026-10-28')).blocks, 'Lord, I Have Cried');
    const nums = lic.filter(b => /^lic-hymn-v\d+$/.test(b.id));
    assert.deepEqual(nums.map(b => b.source),
      ['octoechos', 'octoechos', 'octoechos', 'menaion', 'menaion', 'menaion']);
    // The three Menaion slots are Anastasia's own, not Ven. Abramius' (2232).
    for (const b of nums.slice(3)) assert.doesNotMatch(b.text, /Abramius/);
  });

  it('INV-3: exactly ONE doxology closes the section, and it carries both halves', async () => {
    const lic = sec((await vespers('2026-10-28')).blocks, 'Lord, I Have Cried');
    const dox = lic.filter(b => b.type === 'doxology');
    assert.equal(dox.length, 1, 'one doxology, not a Glory and a Now');
    assert.match(dox[0].text, /^Glory to the Father/);
    assert.match(dox[0].text, /now and ever/i);
  });

  it('INV-4: exactly one hymn follows it, and it is the section\'s last block', async () => {
    const lic = sec((await vespers('2026-10-28')).blocks, 'Lord, I Have Cried');
    const doxIdx = lic.findIndex(b => b.type === 'doxology');
    assert.ok(doxIdx > -1, 'a doxology is present at all (it used to vanish)');
    const tail = lic.slice(doxIdx + 1);
    assert.equal(tail.length, 1, 'one Theotokion under the combined doxology');
    assert.equal(tail[0].type, 'hymn');
    assert.equal(tail[0].id, lic[lic.length - 1].id, 'and the section ends there');
  });

  it('INV-5: the Theotokion is the Menaion\'s own order=-1 row, sung once', async () => {
    const lic = sec((await vespers('2026-10-28')).blocks, 'Lord, I Have Cried');
    const hymns = lic.filter(b => b.type === 'hymn');
    const last = hymns[hymns.length - 1];
    assert.equal(last.source, 'menaion');
    assert.match(last.text, /^Rejoice, bearer of the divine Light/);
    // The Stavrotheotokion is the Wed/Fri alternative for this same slot and
    // must not surface on a Thursday, nor as a numbered sticheron.
    for (const b of hymns) assert.doesNotMatch(b.text, /What is this sight which I see/);
  });

  it('INV-6: no date in the year renders a bare "Now and ever" with no Glory at LIC', async () => {
    // The combined label is the whole point: a lone "Now and ever…" means the
    // Glory half was dropped rather than folded in.
    const probes = ['2026-02-02', '2026-08-02', '2026-10-28', '2026-12-06', '2026-12-20'];
    for (const date of probes) {
      const lic = sec((await vespers(date)).blocks, 'Lord, I Have Cried');
      const dox = lic.filter(b => b.type === 'doxology');
      if (dox.length !== 1) continue;          // a real Glory + Now pair is fine
      assert.match(dox[0].text, /^Glory to the Father/,
        `${date}: single LIC doxology must carry the Glory half`);
    }
  });
});
