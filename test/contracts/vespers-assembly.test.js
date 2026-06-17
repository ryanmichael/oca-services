/**
 * Feature contract: Vespers Assembly
 * Spec: features/vespers-assembly.md
 *
 * One test per INV-* invariant. These are the contract every Vespers
 * response must satisfy — date-shift, civil-eve key mapping, Glory/Now
 * splits, Theotokion tones, Triodion-vs-Menaion ownership. The four
 * structural bugs fixed under commits aef1f6f / a3b0e8c / 3156bb0 /
 * 8139b3f / 4a68d1f all passed `npm test`; these tests close that gap.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3094; // distinct from sunday-kontakia (3096), confess-first (3097), patron (3098), smoke (3099), dev (3000)
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

// ── Helpers ───────────────────────────────────────────────────────────────

function blocksIn(blocks, section) {
  return blocks.filter(b => b.section === section);
}

function hasDoxology(blocks, regex) {
  return blocks.some(b => b.type === 'doxology' && regex.test(b.text || ''));
}

function findHymnByLabel(blocks, labelRe) {
  return blocks.find(b => b.type === 'hymn' && labelRe.test(b.label || ''));
}

// ── Contract tests ────────────────────────────────────────────────────────

describe('Feature contract: Vespers Assembly', () => {

  // INV-1 — Vespers date-shift.
  it('INV-1: API ?date=X serves Vespers for the next liturgical day (date-shift)', async () => {
    const { json } = await get('/api/service?date=2026-06-17');
    assert.equal(json.date, '2026-06-17', 'response.date is the civil-eve date');
    assert.equal(json.vespersDate, '2026-06-18',
      'response.vespersDate is the next liturgical day (the calendar entry consulted)');
  });

  // INV-2 — Weekday evening prokeimenon by civil-eve, not liturgical day.
  it('INV-2: weekday prokeimenon is keyed by civil-eve day (VESPERS_SUNG_EVE), not liturgical', async () => {
    // Wed civil eve (Jun 17) → Thursday liturgical → Wednesday-eve prokeimenon:
    // Tone 5 "Save me, O God" (Ps 53). Bug shape was rendering Thursday-eve
    // ("My help comes from the Lord" Tone 6) instead.
    const { json } = await get('/api/service?date=2026-06-17');
    const prok = blocksIn(json.blocks, 'Evening Prokeimenon');
    const refrain = prok.find(b => b.type === 'hymn');
    assert.ok(refrain, 'Evening Prokeimenon section must include a hymn block (refrain)');
    assert.equal(refrain.tone, 5, `Wednesday-eve prokeimenon must be Tone 5; got ${refrain.tone}`);
    assert.match(refrain.text || '', /save me, o god/i,
      'Wednesday-eve prokeimenon refrain must be "Save me, O God…" (Ps 53)');
  });

  // INV-3 — Weekday LIC: separate Glory + Theotokion, not collapsed.
  it('INV-3: weekday LIC with Menaion Glory renders separate Glory + Now + Theotokion (not collapsed)', async () => {
    // Jun 17, Leontius of Tripoli — simple-rank weekday saint with a doxastichon.
    const { json } = await get('/api/service?date=2026-06-17');
    const lic = blocksIn(json.blocks, 'Lord, I Have Cried');

    // Separate "Glory" (not the combined "Glory ... now and ever").
    const hasSeparateGlory = hasDoxology(lic, /^Glory to the Father, and to the Son, and to the Holy Spirit\.$/);
    assert.ok(hasSeparateGlory, 'LIC must contain a separate "Glory" doxology (not collapsed Glory+Now)');

    // Separate "Now and ever".
    const hasSeparateNow = hasDoxology(lic, /^Now and ever and unto ages of ages\. Amen\.$/);
    assert.ok(hasSeparateNow, 'LIC must contain a separate "Now and ever" doxology');

    // A Theotokion hymn must follow.
    const theotokion = findHymnByLabel(lic, /theotokion/i);
    assert.ok(theotokion, 'LIC must contain a hymn labeled "Theotokion" after the Now-and-ever doxology');
  });

  // INV-4 — Weekday Aposticha Theotokion in tone of Glory.
  it('INV-4: weekday Aposticha Theotokion tone matches the Menaion Glory tone', async () => {
    // Jun 17: Leontius doxastichon is Tone 4. Theotokion must also be Tone 4.
    // Bug shape: Theotokion was Tone 1 (week tone) instead.
    const { json } = await get('/api/service?date=2026-06-17');
    const apost = blocksIn(json.blocks, 'Aposticha');

    // Find Glory hymn (post-Glory-doxology) and Theotokion hymn.
    const gloryIdx = apost.findIndex(b =>
      b.type === 'doxology' &&
      /^Glory to the Father/i.test(b.text || '') &&
      !/now and ever/i.test(b.text || '')
    );
    assert.ok(gloryIdx >= 0, 'Aposticha must have a separate Glory doxology');
    const gloryHymn = apost.slice(gloryIdx + 1).find(b => b.type === 'hymn');
    const theotokion = apost.slice(gloryIdx + 1).find(b =>
      b.type === 'hymn' && /theotokion/i.test(b.label || '')
    );
    assert.ok(gloryHymn,  'Aposticha must have a Glory hymn (Menaion doxastichon)');
    assert.ok(theotokion, 'Aposticha must have a Theotokion hymn at Now-and-ever');
    assert.equal(theotokion.tone, gloryHymn.tone,
      `Theotokion tone (${theotokion.tone}) must match Glory tone (${gloryHymn.tone})`);
  });

  // INV-5 — Weekday Troparia: leading saint troparion + trailing Theotokion.
  it('INV-5: weekday Troparia leads with saint troparion (no leading Glory) + ends with Theotokion in troparion tone', async () => {
    // Jun 17: Leontius troparion T4. Bug shape was [Glory] → [troparion] → end
    // (leading Glory, no trailing Theotokion).
    const { json } = await get('/api/service?date=2026-06-17');
    const trop = blocksIn(json.blocks, 'Troparia');

    // First contentful block must be a hymn, not a doxology.
    const first = trop.find(b => b.type === 'hymn' || b.type === 'doxology' || b.type === 'rubric');
    assert.ok(first, 'Troparia section must contain content');
    assert.equal(first.type, 'hymn',
      `Troparia must lead with a hymn (saint troparion), not a ${first.type}`);

    // Trailing Now-and-ever + Theotokion present.
    const hasNow = hasDoxology(trop, /^Now and ever/i);
    assert.ok(hasNow, 'Troparia must contain a trailing "Now and ever" doxology');

    const theotokion = findHymnByLabel(trop, /theotokion/i);
    assert.ok(theotokion, 'Troparia must end with a Theotokion hymn');

    // Theotokion tone matches the saint's troparion tone.
    assert.equal(theotokion.tone, first.tone,
      `Troparia Theotokion tone (${theotokion.tone}) must match leading troparion tone (${first.tone})`);
  });

  // INV-6 — Vigil-rank: troparion sung thrice, no Theotokion.
  it('INV-6: vigil-rank feast Troparia is sung thrice with NO trailing Theotokion', async () => {
    // Jan 29 = Thu eve → Jan 30 Three Hierarchs (vigil rank).
    const { json } = await get('/api/service?date=2026-01-29');
    assert.equal(json.serviceType, 'all-night-vigil');
    const trop = blocksIn(json.blocks, 'Troparia');

    // Must start with the "sung thrice" rubric.
    const rubric = trop.find(b => b.type === 'rubric');
    assert.ok(rubric, 'Vigil-rank Troparia must include a rubric block');
    assert.match(rubric.text || '', /sung thrice/i,
      'Vigil-rank Troparia rubric must say "sung thrice"');

    // Exactly three hymns, all the same troparion.
    const hymns = trop.filter(b => b.type === 'hymn');
    assert.equal(hymns.length, 3, `Expected 3 hymn blocks (sung thrice); got ${hymns.length}`);
    assert.equal(hymns[0].text, hymns[1].text);
    assert.equal(hymns[1].text, hymns[2].text);

    // No Theotokion hymn — repeatThrice filters position:'now' slots.
    const theotokion = findHymnByLabel(trop, /theotokion/i);
    assert.equal(theotokion, undefined,
      'Vigil-rank Troparia must NOT have a trailing Theotokion (repeatThrice drops position:now)');
  });

  // INV-7 — Lenten Saturday: Triodion wins, no duplicate Glory.
  it('INV-7: Lenten Saturday with Triodion Glory renders exactly one Glory block (Menaion injection skips)', async () => {
    // Feb 27 = St Theodore Saturday Vespers (sung Fri eve). Triodion ships
    // Theodore troparion at position:'glory' in the spec. Bug shape was the
    // Menaion injection splicing a second position:'glory' on top, producing
    // two consecutive Glory blocks with duplicated id `troparion-glory`.
    const { json } = await get('/api/service?date=2026-02-27');
    const trop = blocksIn(json.blocks, 'Troparia');

    // Exactly one separate "Glory" doxology.
    const glories = trop.filter(b =>
      b.type === 'doxology' &&
      /^Glory to the Father, and to the Son, and to the Holy Spirit\.$/.test(b.text || '')
    );
    assert.equal(glories.length, 1,
      `Lenten Saturday Troparia must have exactly one Glory doxology; got ${glories.length}`);

    // No duplicate ids.
    const ids = trop.map(b => b.id);
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dups, [],
      `Lenten Saturday Troparia must have no duplicate block ids; dup ids: ${dups.join(', ')}`);
  });
});
