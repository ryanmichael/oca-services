/**
 * Feature contract: Vigil/Polyeleos weekday feast suppresses daily-cycle Liturgy propers
 * Spec: features/weekday-feast-suppresses-daily-propers.md
 *
 * One test per INV-* invariant. If you change the isWeekdayGreatSaintFeast
 * gate, the gmp-promotion logic, the Epistle/Gospel slot-flip, or the
 * dismissal commemoration suppression, update both the feature file and
 * these tests in the same commit.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3088; // distinct: faithful-litany 3090, hours-precede 3091, lic-no-leading-repeat 3092, beatitudes 3093, vespers 3094, polyeleos 3095, sunday-kontakia 3096, confess 3097, patron 3098, smoke 3099, dev 3000
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
  serverProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    if (msg.includes('Error') && !msg.includes('EADDRINUSE')) {
      console.error('[server stderr]', msg);
    }
  });
  await waitForServer();
});

after(() => { if (serverProcess) serverProcess.kill(); });

function blocksIn(json, section) {
  return (json.blocks || []).filter(b => b.section === section);
}
function hymnBlocks(json, section) {
  return blocksIn(json, section).filter(b => b.type === 'hymn');
}
function findText(json, section, predicate) {
  return blocksIn(json, section).find(b => b.text && predicate(b.text));
}

describe('Feature contract: Vigil/Polyeleos weekday feast suppresses daily-cycle Liturgy propers', () => {

  // ── 2026-06-29 SS Peter and Paul (Mon, vigil) ─────────────────────────────
  // The trigger date for this feature.

  it('INV-1: 2026-06-29 Liturgy primary prokeimenon is the apostles\' feast refrain, not Mon-Angels daily', async () => {
    const { json } = await get('/api/liturgy?date=2026-06-29');
    const hymns = hymnBlocks(json, 'Prokeimenon');
    assert.ok(hymns.length, 'expected at least one Prokeimenon hymn block');
    const first = hymns[0];
    assert.match(first.text, /Their proclamation has gone out into all the earth/,
      `expected apostles' prokeimenon as primary; got: ${first.text}`);
    assert.doesNotMatch(first.text, /angels spirits/i,
      'Mon-Angels weekday prokeimenon must not be primary on vigil weekday');
  });

  it('INV-2: 2026-06-29 Liturgy Gospel is the feast Gospel (Matt 16:13-19, Peter\'s Confession), not Mon weekday Matt 12', async () => {
    const { json } = await get('/api/liturgy?date=2026-06-29');
    const blocks = blocksIn(json, 'Gospel Reading');
    const ref = blocks.find(b => /Matthew\s+16/.test(b.text || ''));
    assert.ok(ref, `expected Matthew 16.13-19 reference block on 6-29; section had: ${blocks.map(b => b.text).join(' | ')}`);
    // And the daily Gospel must NOT also appear
    const dailyRef = blocks.find(b => /Matthew\s+12\.9/.test(b.text || ''));
    assert.equal(dailyRef, undefined,
      'daily Mon Gospel (Matt 12.9-13) must not co-render on vigil weekday');
  });

  it('INV-3: 2026-06-29 Liturgy Communion Hymn is apostles\' koinonikon, not Mon-Angels daily', async () => {
    const { json } = await get('/api/liturgy?date=2026-06-29');
    const choirBlocks = blocksIn(json, 'Communion Hymn').filter(b => b.speaker === 'choir');
    assert.ok(choirBlocks.length, 'expected Communion Hymn choir block');
    const text = choirBlocks.map(b => b.text || '').join(' ');
    assert.match(text, /Their proclamation has gone out into all the earth/,
      `expected apostles' koinonikon; got: ${text}`);
    assert.doesNotMatch(text, /angels spirits/i,
      'Mon-Angels weekday koinonikon must not render on vigil weekday');
  });

  it('INV-4: 2026-06-29 priestly dismissal does not name "bodiless Powers of Heaven"', async () => {
    const { json } = await get('/api/liturgy?date=2026-06-29');
    const priestDismissals = blocksIn(json, 'Dismissal').filter(b => b.speaker === 'priest');
    const full = priestDismissals.map(b => b.text || '').join(' ');
    assert.doesNotMatch(full, /bodiless Powers of Heaven/i,
      `Mon dayPatron must be suppressed on vigil weekday; dismissal was: ${full}`);
    assert.match(full, /Apostles Peter and Paul/i,
      'dismissal must still name the feast saints');
  });

  // ── 2026-08-06 Transfiguration (Thu) — Great Feast of the Lord, NOT a saint feast ──

  it('INV-8: a Great Feast of the Lord on a weekday also suppresses the day patron', async () => {
    // isWeekdayGreatSaintFeast requires `!feast` by construction, so it can never
    // be true on a Great Feast. Before the fix, Transfiguration on a Thursday
    // named the Thursday patron ("Nicholas the Wonderworker") in its dismissal.
    for (const url of ['/api/liturgy?date=2026-08-06',
                       '/api/service?date=2026-08-05&service=vespers']) {
      const { json } = await get(url);
      const full = blocksIn(json, 'Dismissal')
        .filter(b => b.speaker === 'priest').map(b => b.text || '').join(' ');
      assert.doesNotMatch(full, /Nicholas the Wonderworker/i,
        `Thursday dayPatron must be suppressed on a Great Feast (${url}); dismissal was: ${full}`);
      assert.match(full, /transfigured in glory on Mount Tabor/i,
        `Great Feast dismissal must open with the festal introit (${url})`);
    }
  });

  it('INV-9: the festal introit does not also name the feast in the saints list', async () => {
    const { json } = await get('/api/service?date=2026-08-05&service=vespers');
    const full = blocksIn(json, 'Dismissal')
      .filter(b => b.speaker === 'priest').map(b => b.text || '').join(' ');
    const hits = (full.match(/[Tt]ransfigur/g) || []).length;
    assert.equal(hits, 1, `feast should be named exactly once, not repeated in the saints list: ${full}`);
  });

  // ── 2026-06-24 Forerunner Nativity (Wed, vigil) — Forerunner aliased to Prophet ────

  it('INV-5: 2026-06-24 Liturgy primary prokeimenon is the prophet refrain (Forerunner→Prophet alias), not Wed-Theotokos daily', async () => {
    const { json } = await get('/api/liturgy?date=2026-06-24');
    const hymns = hymnBlocks(json, 'Prokeimenon');
    assert.ok(hymns.length, 'expected Prokeimenon hymn block');
    const first = hymns[0];
    assert.match(first.text, /Thou, O Lord, shalt keep us and preserve us/,
      `expected prophet prokeimenon (Forerunner aliased); got: ${first.text}`);
    assert.doesNotMatch(first.text, /soul doth magnify the Lord/i,
      'Wed-Theotokos weekday prokeimenon must not be primary on Forerunner vigil');
  });

  // ── Negative test: ordinary weekday must still get daily cycle ────────────

  it('INV-6: 2026-06-22 (Mon, simple rank) renders the Mon-Angels daily prokeimenon (gate must not over-fire)', async () => {
    const { json } = await get('/api/liturgy?date=2026-06-22');
    const hymns = hymnBlocks(json, 'Prokeimenon');
    assert.ok(hymns.length, 'expected Prokeimenon hymn block');
    const first = hymns[0];
    assert.match(first.text, /His angels spirits|flame of fire|flaming fire/i,
      `expected Mon-Angels daily prokeimenon on ordinary Mon; got: ${first.text}`);
  });

  // ── Negative test: polyeleos Sunday still uses Sunday cycle as primary ────

  it('INV-7: 2026-07-05 (Sun, Sergius polyeleos) keeps Sunday prokeimenon as primary (Sunday gate does not flip to saint)', async () => {
    const { json } = await get('/api/liturgy?date=2026-07-05');
    const hymns = hymnBlocks(json, 'Prokeimenon');
    assert.ok(hymns.length >= 2,
      `expected Sunday + saint-secondary prokeimenon hymns; got ${hymns.length}`);
    // The Sunday Tone-2 (resurrectional) prokeimenon should be first.
    // Whatever the Sunday refrain wording is — the saint's "Precious in the
    // sight of the Lord" must NOT be the first hymn (that's the secondary).
    assert.doesNotMatch(hymns[0].text, /Precious in the sight of the Lord/i,
      `Sunday primary must not be displaced by saint propers; got first hymn: ${hymns[0].text}`);
    // And the saint secondary MUST still appear (preserves polyeleos-saint-propers).
    const saintProk = hymns.find(b => /Precious in the sight of the Lord/i.test(b.text));
    assert.ok(saintProk, 'expected venerable-category secondary prokeimenon on Sergius Sunday');
  });
});
