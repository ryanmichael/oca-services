/**
 * Feature contract: the hierarch's honorific tracks his RANK
 *
 * "His Eminence, the Most Reverend" belongs to an archbishop. A bishop takes
 * "His Grace, the Right Reverend". The derivation template hard-coded the
 * archbishop form, so any parish whose ruling hierarch is a bishop
 * commemorated him with the wrong honorific — at three points in every
 * Liturgy and twice more in Vespers, aloud.
 *
 * Tyler hit it the week the Diocese of the South received Bp. Gerasim. The
 * rector's own announcement reads "His Grace, Bishop Gerasim"; we were
 * printing "His Eminence, the Most Reverend ... Archbishop". Nothing caught
 * it, because the template rendered perfectly well — it was simply the wrong
 * words, and no rule knew that an honorific has a referent.
 *
 * The rank is read from the stored title rather than kept in its own column,
 * so the two cannot drift. INV-3 is the trap that reading costs: "archbishop"
 * contains "bishop", and a naive test would downgrade every archbishop in the
 * OCA.
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
const PORT = 3126; // distinct: 3125 was the last taken
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

async function waitForServer(maxMs = 20000) {
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

const { hierarchStyle } = require('../../server-lib/derivations/hierarch-style');

const TYLER = 'st-john-damascus-tyler';
const SUNDAY = '2026-11-08';
const SAT_EVE = '2026-11-07';

describe('Feature contract: the hierarch honorific tracks his rank', () => {

  it('INV-1: a bishop is "His Grace, the Right Reverend"', () => {
    const s = hierarchStyle('Gerasim, Bishop of Dallas and the South');
    assert.equal(s.full,  'His Grace, the Right Reverend');
    assert.equal(s.short, 'right reverend');
  });

  it('INV-2: an archbishop is "His Eminence, the Most Reverend"', () => {
    // The control. Without it, INV-1 would also pass if everything were
    // unconditionally styled as a bishop.
    const s = hierarchStyle('Alexander, Archbishop of Dallas and the South');
    assert.equal(s.full,  'His Eminence, the Most Reverend');
    assert.equal(s.short, 'most reverend');
  });

  it('INV-3: "archbishop" is never read as "bishop"', () => {
    // The substring trap: /bishop/ matches inside "Archbishop". Testing the
    // ranks in the wrong order would demote every archbishop in the OCA.
    for (const t of [
      'Alexander, Archbishop of Dallas and the South',
      'Tikhon, Archbishop of Washington, Metropolitan of All America and Canada',
    ]) {
      assert.doesNotMatch(hierarchStyle(t).full, /Right Reverend/,
        `"${t}" must not take the bishop's honorific`);
    }
    // And a metropolitan outranks both, even though the title contains
    // "Archbishop" earlier in the string.
    assert.equal(
      hierarchStyle('Tikhon, Archbishop of Washington, Metropolitan of All America and Canada').full,
      'His Beatitude, the Most Blessed');
  });

  it('INV-4: an unrecognised title keeps the prior wording, never a raw placeholder', () => {
    const s = hierarchStyle('Somebody of Somewhere');
    assert.equal(s.full, 'His Eminence, the Most Reverend');
    assert.equal(s.rank, null, 'and it reports that it recognised nothing');
    assert.doesNotMatch(s.full, /[{}]/, 'an unrendered placeholder must never reach a service');
  });

  it('INV-5: every hierarch slot in the Liturgy agrees with the stored rank', async () => {
    const b = (await get(`/api/liturgy?date=${SUNDAY}&translation=${TYLER}`)).json.blocks;
    const byId = (id) => (b.find(x => x.id === id) || {}).text || '';

    assert.match(byId('comm-hierarchs'), /His Grace, the Right Reverend Gerasim, Bishop of Dallas and the South/,
      'the anaphora commemoration');
    assert.match(byId('gl-p3'),  /right reverend Bishop Gerasim/, 'the Great Litany');
    assert.match(byId('al-tp0'), /right reverend Bishop Gerasim/, 'the Fervent Supplication');

    // The whole service, not just the slots we remembered to name.
    const all = b.map(x => x.text || '').join('\n');
    assert.doesNotMatch(all, /His Eminence, the Most Reverend Gerasim/,
      'the archbishop honorific must not survive anywhere');
    assert.doesNotMatch(all, /Archbishop Gerasim/, 'nor the archbishop rank');
    assert.doesNotMatch(all, /\{ruling_hierarch_style/, 'no unrendered placeholder');
  });

  it('INV-6: Vespers carries it too — the derivation is not Liturgy-only', async () => {
    const b = (await get(`/api/service?date=${SAT_EVE}&service=vespers&translation=${TYLER}`)).json.blocks;
    const all = b.map(x => x.text || '').join('\n');
    assert.match(all, /right reverend Bishop Gerasim/, 'the Vespers litanies');
    assert.doesNotMatch(all, /Archbishop Gerasim/);
  });

  it('INV-7: the admin preview mirrors the server rule', () => {
    // Two copies of the same rule — the browser cannot require the server
    // module. If they disagree, the parish is shown one thing and the choir
    // sings another, which is how a wrong honorific gets approved.
    const src = fs.readFileSync(path.join(ROOT, 'public', 'scripts', 'parish-admin.js'), 'utf8');
    assert.match(src, /His Grace, the Right Reverend/, 'the bishop form');
    assert.match(src, /His Eminence, the Most Reverend/, 'the archbishop form');
    assert.match(src, /His Beatitude, the Most Blessed/, 'the metropolitan form');
    // Archbishop must be tested before bishop in the preview too.
    assert.ok(src.indexOf('archbishop') < src.indexOf('\\bbishop'),
      'the preview must test archbishop before bishop');
    assert.doesNotMatch(src, /Will render as: "…His Eminence, the Most Reverend \$\{r\}/,
      'the preview must not hard-code one honorific');
  });
});
