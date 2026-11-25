'use strict';

/**
 * Feature contract: the Akathist of Thanksgiving as a service.
 *
 * Added 2026-11-25 — St John of Damascus (Tyler) served it that evening in
 * place of Daily Vespers and needed it on the day's menu and in booklet form.
 * Text: fixed-texts/akathist-thanksgiving-fixed.json, generated from the
 * parish-supplied docs/one-off/2026-11-25-akathist/source.txt.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3149;
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, json, body: data }); });
    }).on('error', reject);
  });
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try { if ((await get('/api/days?from=2026-11-25&to=2026-11-25')).status === 200) return; } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

describe('Akathist of Thanksgiving', () => {
  it('INV-1: listed on the Wednesday and Thursday of US Thanksgiving week, and no other day', async () => {
    const days = (await get('/api/days?from=2026-11-23&to=2026-11-28')).json;
    const list = Array.isArray(days) ? days : days.days;
    const on = list.filter(d => d.services.akathistThanksgiving).map(d => d.date);
    assert.deepEqual(on, ['2026-11-25', '2026-11-26']);
    // Thanksgiving moves: 2027 is the 25th (Thursday), so the eve is the 24th.
    const y27 = (await get('/api/days?from=2027-11-24&to=2027-11-25')).json;
    const l27 = Array.isArray(y27) ? y27 : y27.days;
    assert.ok(l27.every(d => d.services.akathistThanksgiving), '2027-11-24/25');
  });

  it('INV-2: the order is the parish booklet — 13 Kontakia, 12 Ikoi, then Ikos 1 and Kontakion 1 repeated', async () => {
    const r = await get('/api/akathist-thanksgiving?date=2026-11-25&translation=st-john-damascus-tyler');
    assert.equal(r.status, 200);
    const secs = [...new Set(r.json.blocks.map(b => b.section))];
    assert.equal(secs[0], 'Opening Prayers');
    const body = secs.slice(1);
    const expect = [];
    for (let n = 1; n <= 12; n++) expect.push(`Kontakion ${n}`, `Ikos ${n}`);
    expect.push('Kontakion 13', 'Ikos 1 (repeated)', 'Kontakion 1 (repeated)');
    assert.deepEqual(body, expect);
  });

  it('INV-3: every Kontakion and Ikos ends on the people\'s refrain; Ikoi carry their acclamations', async () => {
    const blocks = (await get('/api/akathist-thanksgiving?date=2026-11-25')).json.blocks;
    const bySec = new Map();
    for (const b of blocks) { if (b.section !== 'Opening Prayers') (bySec.get(b.section) || bySec.set(b.section, []).get(b.section)).push(b); }
    for (const [sec, bs] of bySec) {
      const last = bs[bs.length - 1];
      assert.equal(last.type, 'response', `${sec} ends on a refrain`);
      assert.equal(last.speaker, 'all');
      assert.match(last.text, /^(Glory to Thee,? O God,? from age to age|Alleluia)/);
      if (sec.startsWith('Ikos')) assert.ok(bs.filter(b => b.type === 'verse').length >= 6, `${sec} has its "Glory to Thee…" acclamations`);
    }
    const k1 = bySec.get('Kontakion 1');
    assert.match(k1[0].text, /^Everlasting King/);
  });

  it('INV-4: beginning=0 drops the opening prayers; search finds it; HTML renders', async () => {
    const bare = (await get('/api/akathist-thanksgiving?beginning=0')).json.blocks;
    assert.equal(bare[0].section, 'Kontakion 1');
    const s = (await get('/api/search?q=akathist')).json;
    const hit = (s.services || []).find(h => h.key === 'akathistThanksgiving');
    assert.ok(hit && /^\d{4}-11-\d{2}$/.test(hit.nextDate), 'search reports the next Thanksgiving-week date');
    const html = await get('/api/akathist-thanksgiving?date=2026-11-25&format=html');
    assert.equal(html.status, 200);
    assert.match(html.body, /life's journey<br \/>For every moment of glory/, 'a continuation line keeps its line break');
  });
});
