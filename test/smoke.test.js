/**
 * Smoke tests for OCA Services
 *
 * Uses Node's built-in test runner (node:test) — zero dependencies.
 * Run: npm test
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8'));
}

/** Simple HTTP GET that returns { status, body, json } */
function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, body: data, json });
      });
    }).on('error', reject);
  });
}

// ── Server lifecycle ────────────────────────────────────────────────────────

const PORT = 3099; // avoid conflict with dev server on 3000
let serverProcess;

async function waitForServer(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      await get('/');
      return;
    } catch (_) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`Server did not start within ${maxMs}ms`);
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  serverProcess.stderr.on('data', (d) => {
    // Surface fatal errors during tests
    const msg = d.toString();
    if (msg.includes('Error') && !msg.includes('EADDRINUSE')) {
      console.error('[server stderr]', msg);
    }
  });
  await waitForServer();
});

after(() => {
  if (serverProcess) serverProcess.kill();
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — Assembly smoke tests (direct, no server)
// ═══════════════════════════════════════════════════════════════════════════

describe('Assembler — direct', () => {
  const { assembleVespers, assembleLiturgy, assembleMatins,
          assemblePresanctified, assemblePaschalHours,
          assembleBridegroomMatins, assemblePassionGospels,
          assembleLamentations, assembleVesperalLiturgy,
          assembleRoyalHours, assembleMidnightOffice,
          assemblePaschalMatins } = require('../assembler');

  /** Assert every block in the array has the required shape */
  function assertBlockShape(blocks, label) {
    assert.ok(Array.isArray(blocks), `${label}: should return an array`);
    assert.ok(blocks.length > 0, `${label}: should have at least one block`);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      assert.ok(b.id, `${label} block[${i}]: missing id`);
      assert.ok(b.section, `${label} block[${i}] (${b.id}): missing section`);
      assert.ok(b.type, `${label} block[${i}] (${b.id}): missing type`);
      assert.ok(typeof b.text === 'string', `${label} block[${i}] (${b.id}): text must be a string`);
    }
  }

  /** Assert no block has empty text (catches broken source resolution) */
  function assertNoEmptyText(blocks, label) {
    const empties = blocks.filter(b => b.text.trim() === '' && b.type !== 'doxology');
    assert.equal(empties.length, 0,
      `${label}: ${empties.length} block(s) with empty text: ${empties.map(b => b.id).join(', ')}`);
  }

  /** Count blocks in a named section */
  function countInSection(blocks, sectionName) {
    return blocks.filter(b => b.section === sectionName).length;
  }

  it('Great Vespers — Soul Saturday (Mar 7, 2026)', () => {
    const calendarDay = loadJSON('variable-sources/calendar/2026-03-07.json');
    const fixedTexts  = loadJSON('fixed-texts/vespers-fixed.json');
    const prokeimena  = loadJSON('variable-sources/prokeimena.json');
    const octoechos   = loadJSON('variable-sources/octoechos.json');
    const triodionRaw = loadJSON('variable-sources/triodion/lent-soul-saturday-2.json');
    const menahionRaw = loadJSON('variable-sources/menaion/march-07.json');

    const sources = {
      prokeimena,
      octoechos: { tone5: octoechos.tone5 },
      triodion: { lent: { soulSaturday2: triodionRaw.vespers } },
      menaion: { 'march-07': menahionRaw.vespers },
    };

    const blocks = assembleVespers(calendarDay, fixedTexts, sources);
    assertBlockShape(blocks, 'Soul Saturday Vespers');
    assert.ok(blocks.length >= 140, `Expected ≥140 blocks, got ${blocks.length}`);

    // Lord I Call should have hymns
    const licHymns = blocks.filter(b => b.section === 'Lord, I Have Cried' && b.type === 'hymn');
    assert.ok(licHymns.length >= 6, `Lord I Call hymns: expected ≥6, got ${licHymns.length}`);
  });

  it('Holy Week — fixed services assemble with valid blocks', () => {
    const bridegroomFixed = loadJSON('fixed-texts/bridegroom-matins-fixed.json');
    const passionFixed    = loadJSON('fixed-texts/passion-gospels-fixed.json');
    const lamentFixed     = loadJSON('fixed-texts/lamentations-fixed.json');
    const royalFixed      = loadJSON('fixed-texts/royal-hours-fixed.json');

    const bg = assembleBridegroomMatins(bridegroomFixed, 'monday');
    assertBlockShape(bg, 'Bridegroom Matins');
    assert.ok(bg.length >= 20, `Bridegroom Matins: expected ≥20 blocks, got ${bg.length}`);

    const pg = assemblePassionGospels(passionFixed);
    assertBlockShape(pg, 'Passion Gospels');

    const lam = assembleLamentations(lamentFixed);
    assertBlockShape(lam, 'Lamentations');

    const rh = assembleRoyalHours(royalFixed);
    assertBlockShape(rh, 'Royal Hours');
  });

  it('Paschal services — fixed services assemble with valid blocks', () => {
    const paschalHoursFixed  = loadJSON('fixed-texts/paschal-hours-fixed.json');
    const midnightFixed      = loadJSON('fixed-texts/midnight-office-fixed.json');
    const paschalMatinsFixed  = loadJSON('fixed-texts/paschal-matins-fixed.json');

    const ph = assemblePaschalHours(paschalHoursFixed);
    assertBlockShape(ph, 'Paschal Hours');
    assert.ok(ph.length >= 20, `Paschal Hours: expected ≥20 blocks, got ${ph.length}`);

    const mo = assembleMidnightOffice(midnightFixed);
    assertBlockShape(mo, 'Midnight Office');

    const pm = assemblePaschalMatins(paschalMatinsFixed);
    assertBlockShape(pm, 'Paschal Matins');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — API route smoke tests (hit the running server)
// ═══════════════════════════════════════════════════════════════════════════

describe('API routes', () => {

  // ── Service assembly routes ────────────────────────────────────────────

  it('GET /api/service — returns blocks for an ordinary Saturday', async () => {
    // Date=2026-10-02 (Friday evening) → vespers for Saturday Oct 3
    const res = await get('/api/service?date=2026-10-02');
    assert.equal(res.status, 200);
    assert.ok(res.json, 'Should return JSON');
    assert.ok(Array.isArray(res.json.blocks), 'Should have blocks array');
    assert.ok(res.json.blocks.length > 50, `Expected >50 blocks, got ${res.json.blocks.length}`);
  });

  it('GET /api/service — Lenten Saturday Great Vespers', async () => {
    // Date=2026-03-06 (Friday evening) → vespers for Soul Saturday Mar 7
    const res = await get('/api/service?date=2026-03-06');
    assert.equal(res.status, 200);
    assert.ok(res.json.blocks.length > 100, `Expected >100 blocks, got ${res.json.blocks.length}`);
  });

  it('GET /api/service — Lenten Sunday Great Vespers has 10 Lord I Call stichera', async () => {
    // Regression test: was previously returning only 6
    // Date=2026-03-21 (Saturday evening) → vespers for Sunday March 22
    const res = await get('/api/service?date=2026-03-21');
    assert.equal(res.status, 200);
    const licHymns = res.json.blocks.filter(
      b => b.section === 'Lord, I Have Cried' && b.type === 'hymn'
    );
    assert.ok(licHymns.length >= 10,
      `Lenten Sunday Lord I Call: expected ≥10 hymns, got ${licHymns.length}`);
  });

  it('GET /api/service — Lenten Sunday aposticha has distinct hymns', async () => {
    // Regression test: aposticha was repeating the same hymn 3x
    // Date=2026-03-21 (Saturday evening) → vespers for Sunday March 22
    const res = await get('/api/service?date=2026-03-21');
    assert.equal(res.status, 200);
    const apostichaHymns = res.json.blocks.filter(
      b => b.section === 'Aposticha' && b.type === 'hymn'
    );
    // At least 3 distinct hymn texts
    const uniqueTexts = new Set(apostichaHymns.map(h => h.text));
    assert.ok(uniqueTexts.size >= 3,
      `Aposticha: expected ≥3 distinct hymns, got ${uniqueTexts.size} from ${apostichaHymns.length} total`);
  });

  it('GET /api/liturgy — returns blocks', async () => {
    const res = await get('/api/liturgy?date=2026-03-22');
    assert.equal(res.status, 200);
    assert.ok(res.json.blocks.length > 100, `Expected >100 liturgy blocks, got ${res.json.blocks.length}`);
  });

  it('GET /api/matins — returns blocks for a Sunday', async () => {
    const res = await get('/api/matins?date=2026-10-04');
    assert.equal(res.status, 200);
    assert.ok(res.json.blocks.length > 100, `Expected >100 matins blocks, got ${res.json.blocks.length}`);
  });

  it('GET /api/presanctified — Lenten Wednesday', async () => {
    const res = await get('/api/presanctified?date=2026-03-18');
    assert.equal(res.status, 200);
    assert.ok(res.json.blocks.length > 50, `Expected >50 presanctified blocks, got ${res.json.blocks.length}`);
  });

  it('GET /api/paschal-hours — Bright Week', async () => {
    // Pascha 2026 = April 12; Bright Monday = April 13
    const res = await get('/api/paschal-hours?date=2026-04-13');
    assert.equal(res.status, 200);
    assert.ok(res.json.blocks.length >= 20);
  });

  // ── Liturgy section ordering invariants ─────────────────────────────────

  it('Liturgy — Communion Prayer comes after Communion Hymn and before Post-Communion', async () => {
    const res = await get('/api/liturgy?date=2026-06-14');
    assert.equal(res.status, 200);
    const blocks = res.json.blocks;
    const sections = blocks.map(b => b.section);
    const communionHymnIdx  = sections.indexOf('Communion Hymn');
    const communionPrayerIdx = sections.indexOf('Communion Prayer');
    const postCommunionIdx  = sections.indexOf('Post-Communion Blessing');
    assert.ok(communionHymnIdx > -1, 'Should have Communion Hymn section');
    assert.ok(communionPrayerIdx > -1, 'Should have Communion Prayer section');
    assert.ok(postCommunionIdx > -1, 'Should have Post-Communion Blessing section');
    assert.ok(communionHymnIdx < communionPrayerIdx,
      `Communion Hymn (${communionHymnIdx}) should come before Communion Prayer (${communionPrayerIdx})`);
    assert.ok(communionPrayerIdx < postCommunionIdx,
      `Communion Prayer (${communionPrayerIdx}) should come before Post-Communion (${postCommunionIdx})`);
  });

  // ── Great Feast liturgy (Palm Sunday) ──────────────────────────────────

  it('Liturgy — Palm Sunday has feast dismissal troparia', async () => {
    // Pascha 2026 = April 12; Palm Sunday = April 5
    const res = await get('/api/liturgy?date=2026-04-05');
    assert.equal(res.status, 200);
    const dtBlocks = res.json.blocks.filter(b => b.section === 'Dismissal Troparia');
    assert.ok(dtBlocks.length >= 2, 'Should have dismissal troparia blocks');
    const tropText = dtBlocks.find(b => b.type === 'hymn')?.text || '';
    assert.ok(tropText.includes('Lazarus'),
      'Palm Sunday dismissal troparion should mention Lazarus');
  });

  it('Liturgy — Palm Sunday dismissal does not use resurrection formula', async () => {
    const res = await get('/api/liturgy?date=2026-04-05');
    assert.equal(res.status, 200);
    const disProper = res.json.blocks.find(b => b.id === 'dis-proper');
    assert.ok(disProper, 'Should have dismissal proper block');
    assert.ok(!disProper.text.includes('rose from the dead'),
      'Palm Sunday dismissal should not use "rose from the dead" Sunday formula');
  });

  // ── Data routes ────────────────────────────────────────────────────────

  it('GET /api/days — returns calendar data for a date range', async () => {
    const res = await get('/api/days?from=2026-03-07&to=2026-03-09');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json), 'Should return an array');
    assert.equal(res.json.length, 3, 'Should return 3 days');
    assert.ok(res.json[0].date === '2026-03-07');
    assert.ok(res.json[0].services, 'Each day should have services object');
  });

  it('GET /api/menaion/:month/:day — returns commemorations', async () => {
    const res = await get('/api/menaion/3/7');
    assert.equal(res.status, 200);
    assert.ok(res.json, 'Should return JSON');
    assert.ok(Array.isArray(res.json.commemorations), 'Should have commemorations array');
    assert.ok(res.json.commemorations.length > 0, 'March 7 should have commemorations');
  });

  it('GET /api/search — returns results', async () => {
    const res = await get('/api/search?q=nicholas');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json));
    assert.ok(res.json.length > 0, 'Should find St. Nicholas');
  });

  // ── No empty text blocks in any service ────────────────────────────────

  it('No blocks with empty text in Vespers assembly', async () => {
    // Date=2026-10-02 (Friday evening) → vespers for Saturday Oct 3
    const res = await get('/api/service?date=2026-10-02');
    const empties = res.json.blocks.filter(
      b => typeof b.text === 'string' && b.text.trim() === '' && b.type !== 'doxology'
    );
    assert.equal(empties.length, 0,
      `Found ${empties.length} empty block(s): ${empties.map(b => b.id).join(', ')}`);
  });

  it('No blocks with empty text in Liturgy assembly', async () => {
    const res = await get('/api/liturgy?date=2026-10-04');
    const empties = res.json.blocks.filter(
      b => typeof b.text === 'string' && b.text.trim() === '' && b.type !== 'doxology'
    );
    assert.equal(empties.length, 0,
      `Found ${empties.length} empty block(s): ${empties.map(b => b.id).join(', ')}`);
  });

  // ── Static assets ─────────────────────────────────────────────────────

  it('GET / — serves the app', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('<!DOCTYPE html>'));
  });

  it('GET /dashboard — serves the dashboard', async () => {
    const res = await get('/dashboard');
    assert.equal(res.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 3 — Calendar rules
// ═══════════════════════════════════════════════════════════════════════════

describe('Calendar rules', () => {
  const calRules = require('../calendar-rules');

  it('getTone returns tones 1-8', () => {
    const tone = calRules.getTone(new Date(Date.UTC(2026, 9, 3)));
    assert.ok(tone >= 1 && tone <= 8, `Tone should be 1-8, got ${tone}`);
  });

  it('getTone — Oct 3, 2026 is Tone 8', () => {
    assert.equal(calRules.getTone(new Date(Date.UTC(2026, 9, 3))), 8);
  });

  it('getLiturgicalSeason identifies Great Lent', () => {
    const season = calRules.getLiturgicalSeason(new Date('2026-03-15'));
    assert.equal(season, 'greatLent');
  });

  it('getLiturgicalSeason identifies Bright Week', () => {
    // Pascha 2026 = April 12
    const season = calRules.getLiturgicalSeason(new Date('2026-04-13'));
    assert.equal(season, 'brightWeek');
  });

  it('isSoulSaturday — 2nd Saturday of Lent', () => {
    assert.equal(calRules.isSoulSaturday(new Date('2026-03-07')), true);
  });

  it('isSoulSaturday — random Saturday is not', () => {
    assert.equal(calRules.isSoulSaturday(new Date('2026-10-03')), false);
  });

  it('generateCalendarEntry returns a valid entry for an ordinary Saturday', () => {
    const entry = calRules.generateCalendarEntry('2026-10-03');
    assert.ok(entry, 'Should return an entry');
    assert.ok(entry.liturgicalContext, 'Should have liturgicalContext');
    assert.ok(entry.liturgicalContext.tone, 'Should have a tone');
    assert.ok(entry.vespers, 'Saturday should have vespers config');
  });
});
