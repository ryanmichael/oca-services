'use strict';

/**
 * Feature contract: St John of Damascus (Tyler) Liturgy texts sung from the OCA
 * Music Department's engraved edition, per its choir packet — never leaking to
 * the OCA base.
 *
 * Added 2026-11-25 from the Liturgy packet 11.29.26 (Tone 1, Martyr Paramon):
 *   - Tone 1 Resurrection kontakion "As God, Thou didst rise from the tomb…"
 *     (p.4) — Tyler octoechos overlay, variable-sources/octoechos-st-john-damascus-tyler.json
 *   - Tone 1 Sunday prokeimenon verse "Rejoice in the Lord, ye righteous; praise
 *     becometh the upright" (p.7) — the Sunday prokeimenon now reads through the
 *     variable-source cascade (liturgy-from-orthocal.js), Tyler overlay in
 *     variable-sources/translations/st-john-damascus-tyler/daily-propers.json
 *   - Paramon kontakion, you/your, "Philumenus" (pp.5-6) — variant paramon-kontakion
 *   - the base tt kontakion no longer reads "didst renounc" (yy→tt stemmer bug,
 *     fixed in scripts/yy-to-tt.js stemRegularPast; drift:check guards it)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3148;
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, json }); });
    }).on('error', reject);
  });
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try { if ((await get('/api/days?from=2026-11-29&to=2026-11-29')).status === 200) return; } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

const kontakion = (blocks, re) => {
  const i = blocks.findIndex(b => b.section === 'Kontakia' && b.type === 'rubric' && re.test(b.text || ''));
  return i >= 0 ? blocks[i + 1] : null;
};
const prokVerse = (blocks) => blocks.find(b => b.section === 'Prokeimenon' && b.type === 'verse');

describe('Tyler Liturgy from the OCA engraved edition (11-29)', () => {
  it('INV-1: Tyler sings the packet texts', async () => {
    const b = (await get('/api/liturgy?date=2026-11-29&translation=st-john-damascus-tyler')).json.blocks;
    assert.match(kontakion(b, /Resurrection, Tone 1/).text, /^As God, Thou didst rise from the tomb in glory/);
    assert.match(prokVerse(b).text, /Rejoice in the Lord, ye righteous; praise becometh the upright\./);
    const k = kontakion(b, /Paramon/).text;
    assert.match(k, /you cleansed your souls/);
    assert.match(k, /Paramon and Philumenus\./);
    assert.match(k, /Always fervently intercede with Christ on behalf of the world\./);
  });

  it('INV-2: the OCA base is untouched (and spelled right)', async () => {
    const b = (await get('/api/liturgy?date=2026-11-29')).json.blocks;
    assert.match(kontakion(b, /Resurrection, Tone 1/).text, /^Thou hast risen from the grave as God in glory/);
    assert.match(prokVerse(b).text, /Rejoice in the Lord, O you righteous! Praise befits the just!/);
    const k = kontakion(b, /Paramon/).text;
    assert.match(k, /thou didst renounce sacrifice to idols/);
    assert.doesNotMatch(k, /renounc\b/);
  });

  it('INV-3: the overlays reach only their tone — Tyler Tone 2 keeps the base prokeimenon verse', async () => {
    // 2026-12-06 is a Tone 2 Sunday (one week after Tone 1 on 11-29).
    const t = (await get('/api/liturgy?date=2026-12-06&translation=st-john-damascus-tyler')).json.blocks;
    const o = (await get('/api/liturgy?date=2026-12-06')).json.blocks;
    assert.ok(prokVerse(o)?.text, 'probe sees a Tone 2 prokeimenon verse');
    assert.ok(kontakion(o, /Resurrection, Tone 2/)?.text, 'probe sees a Tone 2 Resurrection kontakion');
    assert.equal(prokVerse(t).text, prokVerse(o).text);
    assert.equal(kontakion(t, /Resurrection, Tone 2/).text, kontakion(o, /Resurrection, Tone 2/).text);
  });
});
