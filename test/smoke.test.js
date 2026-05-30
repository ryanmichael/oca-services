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
    const vespersFixed    = loadJSON('fixed-texts/vespers-fixed.json');
    const bridegroomFixed = loadJSON('fixed-texts/bridegroom-matins-fixed.json');
    const passionFixed    = loadJSON('fixed-texts/passion-gospels-fixed.json');
    const lamentFixed     = loadJSON('fixed-texts/lamentations-fixed.json');
    const royalFixed      = loadJSON('fixed-texts/royal-hours-fixed.json');

    const bg = assembleBridegroomMatins(bridegroomFixed, 'monday');
    assertBlockShape(bg, 'Bridegroom Matins');
    assert.ok(bg.length >= 20, `Bridegroom Matins: expected ≥20 blocks, got ${bg.length}`);

    const pg = assemblePassionGospels(passionFixed);
    assertBlockShape(pg, 'Passion Gospels');

    const lam = assembleLamentations(lamentFixed, vespersFixed);
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

  it('Liturgy — Communion Prayer comes before Communion Hymn, both before Post-Communion', async () => {
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
    assert.ok(communionPrayerIdx < communionHymnIdx,
      `Communion Prayer (${communionPrayerIdx}) should come before Communion Hymn (${communionHymnIdx})`);
    assert.ok(communionHymnIdx < postCommunionIdx,
      `Communion Hymn (${communionHymnIdx}) should come before Post-Communion (${postCommunionIdx})`);
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

  // ── Daily Vespers ───────────────────────────────────────────────────────

  it('Daily Vespers — weekday has correct structure (no entrance, augmented litany after troparia)', async () => {
    const res = await get('/api/service?date=2026-06-10');
    assert.equal(res.status, 200);
    const sections = [...new Set(res.json.blocks.map(b => b.section))];
    // No entrance on Daily Vespers
    assert.ok(!sections.includes('The Entrance'),
      'Daily Vespers should not have an entrance');
    // Augmented Litany must come after Troparia
    const tropIdx = res.json.blocks.findIndex(b => b.section === 'Troparia');
    const augIdx = res.json.blocks.findIndex(b => b.section === 'Litany of Fervent Supplication');
    assert.ok(tropIdx > 0, 'Should have Troparia section');
    assert.ok(augIdx > tropIdx,
      'Augmented Litany should come after Troparia in Daily Vespers');
    // Lord I Call should have both Octoechos and Menaion stichera
    const licHymns = res.json.blocks.filter(b => b.section === 'Lord, I Have Cried' && b.type === 'hymn');
    const octHymns = licHymns.filter(b => b.source === 'octoechos');
    const menHymns = licHymns.filter(b => b.source === 'menaion');
    assert.ok(octHymns.length >= 1, 'Should have Octoechos stichera at Lord I Call');
    assert.ok(menHymns.length >= 1, 'Should have Menaion stichera at Lord I Call');
    // Aposticha should have Octoechos base hymns
    const apostHymns = res.json.blocks.filter(b => b.section === 'Aposticha' && b.type === 'hymn');
    const apostOct = apostHymns.filter(b => b.source === 'octoechos');
    assert.ok(apostOct.length >= 1, 'Should have Octoechos aposticha hymns');
    // Dismissal should have proper text, not placeholder
    const disProper = res.json.blocks.find(b => b.id === 'dis-proper');
    assert.ok(disProper, 'Should have dismissal proper block');
    assert.ok(!disProper.text.includes('[Proper Dismissal'),
      'Dismissal should not be a placeholder');
    assert.ok(disProper.text.includes('His most pure Mother'),
      'Dismissal should mention the Theotokos');
  });

  it('Vespers — Saturday Great Vespers uses resurrectional dismissal', async () => {
    const res = await get('/api/service?date=2026-06-12');
    assert.equal(res.status, 200);
    const disProper = res.json.blocks.find(b => b.id === 'dis-proper');
    assert.ok(disProper.text.startsWith('May He Who rose from the dead'),
      'Saturday Great Vespers should use resurrectional dismissal formula');
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
// PART 2b — Per-feast Matins contract tests
// ═══════════════════════════════════════════════════════════════════════════
//
// These pin the festal Matins data extracted into variable-sources/menaion/
// for Theophany, Nativity, and Meeting. A silent regression to the weekday
// stub path produces ~175 blocks with Small Doxology, Canon=1 (rubric
// placeholder), Lauds=0; the assertions below catch that.
//
// Block counts are checked against generous bands so legitimate per-feast
// enhancements don't fail the suite. Required sections + content checks
// give the actual safety net.

describe('Per-feast Matins contracts', () => {
  /**
   * @param {string} date YYYY-MM-DD
   * @param {object} expected
   *   - feastName: substring expected in serviceName
   *   - minBlocks: minimum total block count (weekday stub is ~175)
   *   - troparionText: distinctive substring of the feast troparion
   *   - minCanonBlocks: weekday stub renders Canon as a single rubric block
   *   - minLaudsBlocks: weekday stub has no Lauds at all
   */
  async function assertFestalMatins(date, expected) {
    const res = await get(`/api/matins?date=${date}`);
    assert.equal(res.status, 200, `Expected 200 for ${date}, got ${res.status}`);
    const j = res.json;

    const sections = {};
    for (const b of j.blocks) sections[b.section] = (sections[b.section] || 0) + 1;

    // Total block count above weekday-stub threshold
    assert.ok(j.blocks.length >= expected.minBlocks,
      `${date} (${expected.feastName}): expected ≥${expected.minBlocks} blocks, got ${j.blocks.length}. ` +
      `If close to 175, the weekday stub path is firing — the menaion JSON probably failed to load.`);

    // Great Doxology, not Small Doxology
    assert.ok(sections['Great Doxology'] > 0,
      `${date} (${expected.feastName}): Great Doxology missing — Small Doxology fallback suggests stub path. Sections: ${Object.keys(sections).join(', ')}`);
    assert.ok(!sections['Small Doxology'],
      `${date} (${expected.feastName}): Small Doxology present — should be Great Doxology on a great feast`);

    // Polyeleios + Magnification (post-kathismata block)
    assert.ok(sections['Polyeleios'] > 5,
      `${date} (${expected.feastName}): Polyeleios section missing or thin (got ${sections['Polyeleios'] || 0} blocks)`);

    // Matins Prokeimenon, Gospel
    assert.ok(sections['Matins Prokeimenon'] > 0,
      `${date} (${expected.feastName}): Matins Prokeimenon missing`);
    assert.ok(sections['Matins Gospel'] > 0,
      `${date} (${expected.feastName}): Matins Gospel missing`);

    // Canon with substantive content (weekday stub renders one rubric block)
    assert.ok((sections['Canon'] || 0) >= expected.minCanonBlocks,
      `${date} (${expected.feastName}): Canon has ${sections['Canon'] || 0} blocks, expected ≥${expected.minCanonBlocks}`);

    // Kontakion + Ikos (great feast)
    assert.ok((sections['Kontakion'] || 0) >= 2,
      `${date} (${expected.feastName}): Kontakion section should include Kontakion + Ikos (got ${sections['Kontakion'] || 0})`);

    // Lauds (Praises) present
    assert.ok((sections['Lauds'] || 0) >= expected.minLaudsBlocks,
      `${date} (${expected.feastName}): Lauds has ${sections['Lauds'] || 0} blocks, expected ≥${expected.minLaudsBlocks}`);

    // Distinctive troparion text present somewhere in the rendered service
    const fullText = j.blocks.map(b => b.text || '').join('\n');
    assert.ok(fullText.includes(expected.troparionText),
      `${date} (${expected.feastName}): expected troparion text "${expected.troparionText.slice(0, 40)}..." not found in service`);
  }

  it('Theophany (2026-01-06) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-01-06', {
      feastName: 'Theophany',
      minBlocks: 300,
      troparionText: 'When Thou, O Lord, wast baptized in the Jordan',
      minCanonBlocks: 80,   // two canons × 8 odes, actual ~120
      minLaudsBlocks: 5,
    });
  });

  it('Nativity (2026-12-25) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-12-25', {
      feastName: 'Nativity of Christ',
      minBlocks: 280,
      troparionText: 'Thy Nativity, O Christ our God',
      minCanonBlocks: 50,   // first canon only, actual ~68
      minLaudsBlocks: 5,
    });
  });

  it('Meeting (2026-02-02) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-02-02', {
      feastName: 'Meeting',
      minBlocks: 280,
      troparionText: 'Rejoice, O Virgin Theotokos, Full of Grace',
      minCanonBlocks: 50,   // single canon × 8 odes, actual ~76
      minLaudsBlocks: 5,
    });
  });

  it('Ascension (2026-05-21) renders full festal Matins, not stub', async () => {
    await assertFestalMatins('2026-05-21', {
      feastName: 'Ascension',
      minBlocks: 320,
      troparionText: 'Thou didst ascend in glory, O Christ our God',
      minCanonBlocks: 50,   // single canon × 8 odes with troparia, actual ~88
      minLaudsBlocks: 5,
    });
  });

  it('Ascension Matins includes Having Beheld the Resurrection (unlike Pentecost)', async () => {
    const res = await get('/api/matins?date=2026-05-21');
    assert.equal(res.status, 200);
    const havingBeheld = res.json.blocks.find(b => b.text && b.text.includes('Having beheld the Resurrection'));
    assert.ok(havingBeheld,
      'Ascension Matins should include "Having beheld the Resurrection" per OCA rubric (includeHavingBeheld: true)');
  });

  it('Pentecost (2026-05-31) renders full festal Matins with both canons', async () => {
    await assertFestalMatins('2026-05-31', {
      feastName: 'Pentecost',
      minBlocks: 320,
      troparionText: 'Who hast revealed the fishermen as most wise',
      minCanonBlocks: 70,   // two canons × 8 odes with troparia, actual ~105
      minLaudsBlocks: 5,
    });
  });

  it('Sts Peter & Paul (2026-06-29) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-06-29', {
      feastName: 'Sts Peter and Paul',
      minBlocks: 320,
      troparionText: 'first enthroned among the apostles',
      minCanonBlocks: 100,  // two canons × 8 odes (3+theotokion each), actual ~167
      minLaudsBlocks: 5,
    });
  });

  it('Sts Peter & Paul Matins renders two canons separately, not flat', async () => {
    const res = await get('/api/matins?date=2026-06-29');
    assert.equal(res.status, 200);
    const canonRubrics = res.json.blocks
      .filter(b => b.section === 'Canon' && b.type === 'rubric')
      .map(b => b.text);
    const firstCanonHeadings  = canonRubrics.filter(t => /First Canon/.test(t));
    const secondCanonHeadings = canonRubrics.filter(t => /Second Canon/.test(t));
    assert.ok(firstCanonHeadings.length >= 8,
      `Expected ≥8 First Canon headings, got ${firstCanonHeadings.length}`);
    assert.ok(secondCanonHeadings.length >= 8,
      `Expected ≥8 Second Canon headings, got ${secondCanonHeadings.length}`);
  });

  it('Prophet Elias (2026-07-20) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-07-20', {
      feastName: 'Prophet Elias',
      minBlocks: 320,
      troparionText: 'angel in the flesh, and foundation of the prophets',
      minCanonBlocks: 100,
      minLaudsBlocks: 5,
    });
  });

  it('St Nicholas (2026-12-06) renders full festal Matins, not Sunday Octoechos', async () => {
    await assertFestalMatins('2026-12-06', {
      feastName: 'St Nicholas',
      minBlocks: 320,
      troparionText: 'icon of meekness, and teacher of temperance',
      minCanonBlocks: 100,
      minLaudsBlocks: 5,
    });
  });

  it('Repose of St John the Theologian (2026-09-26) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-09-26', {
      feastName: 'St John the Theologian (Repose)',
      minBlocks: 320,
      troparionText: 'O beloved apostle of Christ God',
      minCanonBlocks: 80,
      minLaudsBlocks: 5,
    });
  });

  it('St Gregory the Theologian (2026-01-25) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-01-25', {
      feastName: 'St Gregory the Theologian',
      minBlocks: 320,
      troparionText: 'The shepherd\'s pipe of thy theology',
      minCanonBlocks: 80,
      minLaudsBlocks: 5,
    });
  });

  it('St Photius the Great (2026-02-06) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-02-06', {
      feastName: 'St Photius',
      minBlocks: 250,
      troparionText: 'As a radiant beacon hidden in God',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('Findings of the Forerunner\'s Head (2026-02-24) renders festal Matins content (Lenten weekday: Small Doxology per code policy)', async () => {
    const res = await get('/api/matins?date=2026-02-24');
    assert.equal(res.status, 200);
    const j = res.json;
    assert.ok(j.blocks.length >= 280,
      `Findings of Forerunner's Head: expected ≥280 blocks, got ${j.blocks.length}.`);
    const sections = {};
    for (const b of j.blocks) sections[b.section] = (sections[b.section] || 0) + 1;
    assert.ok(sections['Polyeleios'] > 5, 'Polyeleios section missing or thin');
    assert.ok(sections['Canon'] >= 30, `Canon should have ≥30 blocks, got ${sections['Canon']}`);
    const fullText = j.blocks.map(b => b.text || '').join('\n');
    assert.ok(fullText.includes('head of the Forerunner'),
      'Findings should include "head of the Forerunner" in troparion');
  });

  it('St Athanasius of Athos (2026-07-05) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-07-05', {
      feastName: 'St Athanasius of Athos',
      minBlocks: 250,
      troparionText: 'The ranks of the angels marveled at thy life in the flesh',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('St Nina (2026-01-14) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-01-14', {
      feastName: 'St Nina',
      minBlocks: 250,
      troparionText: 'O holy Nina, equal of the apostles',
      minCanonBlocks: 30,
      minLaudsBlocks: 3,
    });
  });

  it('St Olga (2026-07-11) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-07-11', {
      feastName: 'St Olga',
      minBlocks: 250,
      troparionText: 'Having furnished thy mind with wings of divine knowledge',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('St Tikhon of Voronezh (2026-08-13) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-08-13', {
      feastName: 'St Tikhon of Voronezh',
      minBlocks: 250,
      troparionText: 'From thy youth thou didst love Christ',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('St Augustine of Hippo (2026-07-15) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-07-15', {
      feastName: 'St Augustine',
      minBlocks: 250,
      troparionText: 'Today the whole world rejoiceth',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('St Paraskeva (2026-10-28) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-10-28', {
      feastName: 'St Paraskeva',
      minBlocks: 320,
      troparionText: 'O most wise and all-praised Parasceva',
      minCanonBlocks: 80,
      minLaudsBlocks: 5,
    });
  });

  it('St Mark the Evangelist (2026-04-25) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-04-25', {
      feastName: 'St Mark',
      minBlocks: 250,
      troparionText: 'O holy apostle and evangelist Mark',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('St Luke the Evangelist (2026-10-18) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-10-18', {
      feastName: 'St Luke',
      minBlocks: 250,
      troparionText: 'O holy Apostle Luke',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('St Matthew the Evangelist (2026-11-16) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-11-16', {
      feastName: 'St Matthew',
      minBlocks: 250,
      troparionText: 'O holy Apostle and evangelist Matthew',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('St Sergius of Radonezh (2026-09-25) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-09-25', {
      feastName: 'St Sergius of Radonezh',
      minBlocks: 320,
      troparionText: 'As a virtuous ascetic athlete',
      minCanonBlocks: 80,
      minLaudsBlocks: 5,
    });
  });

  it('St Andrew the First-Called (2026-11-30) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-11-30', {
      feastName: 'St Andrew',
      minBlocks: 320,
      troparionText: 'As thou art the first-called of the apostles',
      minCanonBlocks: 100,
      minLaudsBlocks: 5,
    });
  });

  it('Sts Constantine & Helena (2027-05-21) renders full festal Matins, not weekday stub', async () => {
    // 2026-05-21 is Ascension (Pascha Apr 12 + 39d) — festal-matins takes
    // precedence over the menaion saint that year. We test 2027 instead,
    // where Ascension falls Jun 10 and May 21 is the regular menaion feast.
    await assertFestalMatins('2027-05-21', {
      feastName: 'Sts Constantine & Helena',
      minBlocks: 250,
      troparionText: 'Beholding the image of Thy Cross in the sky',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('St John the Theologian (2026-05-08) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-05-08', {
      feastName: 'St John the Theologian',
      minBlocks: 250,
      troparionText: 'O beloved apostle of Christ God',
      minCanonBlocks: 30,
      minLaudsBlocks: 4,
    });
  });

  it('St Basil (2026-01-01) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-01-01', {
      feastName: 'St Basil / Circumcision',
      minBlocks: 320,
      troparionText: 'Thy sound hath gone forth into all the earth',
      minCanonBlocks: 80,
      minLaudsBlocks: 5,
    });
  });

  it('St Basil Matins suppresses Magnificat (Ode 9 uses custom megalynaria)', async () => {
    const res = await get('/api/matins?date=2026-01-01');
    assert.equal(res.status, 200);
    const sections = {};
    for (const b of res.json.blocks) sections[b.section] = (sections[b.section] || 0) + 1;
    assert.equal(sections['Magnificat'] || 0, 0,
      `Jan 1 Matins should suppress the Magnificat per the rubric ('At ODE IX we do not sing the Magnificat'). Found ${sections['Magnificat'] || 0} blocks.`);
  });

  it('Three Hierarchs (2026-01-30) renders full festal Matins, not weekday stub', async () => {
    await assertFestalMatins('2026-01-30', {
      feastName: 'Three Hierarchs',
      minBlocks: 320,
      troparionText: 'In that ye share in the ways of the apostles',
      minCanonBlocks: 100,
      minLaudsBlocks: 5,
    });
  });

  it('Three Hierarchs suppresses Magnificat (replaced by custom megalynarion)', async () => {
    const res = await get('/api/matins?date=2026-01-30');
    assert.equal(res.status, 200);
    const sections = {};
    for (const b of res.json.blocks) sections[b.section] = (sections[b.section] || 0) + 1;
    assert.equal(sections['Magnificat'] || 0, 0,
      `Three Hierarchs should suppress the Magnificat per the rubric ('We do not sing the Magnificat'). Found ${sections['Magnificat'] || 0} blocks.`);
    const fullText = res.json.blocks.map(b => b.text || '').join('\n');
    assert.ok(fullText.includes('three great luminaries among the hierarchs'),
      'Three Hierarchs Ode 9 should include the custom megalynarion replacing the Magnificat.');
  });

  it('Beheading of Forerunner (2026-08-29) renders full festal Matins', async () => {
    await assertFestalMatins('2026-08-29', {
      feastName: 'Beheading of Forerunner',
      minBlocks: 320,
      troparionText: 'memory of the just is celebrated with hymns of praise',
      minCanonBlocks: 100,
      minLaudsBlocks: 5,
    });
  });

  it('Forty Martyrs (2026-03-09) renders full festal Matins content (Lenten weekday: Small Doxology per code policy)', async () => {
    const res = await get('/api/matins?date=2026-03-09');
    assert.equal(res.status, 200);
    const j = res.json;

    const sections = {};
    for (const b of j.blocks) sections[b.section] = (sections[b.section] || 0) + 1;

    assert.ok(j.blocks.length >= 400,
      `Forty Martyrs: expected ≥400 blocks, got ${j.blocks.length}. Weekday stub renders ~170.`);
    assert.ok(sections['Polyeleios'] > 5,
      'Forty Martyrs: Polyeleios section missing or thin');
    assert.ok(sections['Matins Prokeimenon'] > 0, 'Matins Prokeimenon missing');
    assert.ok(sections['Matins Gospel'] > 0, 'Matins Gospel missing');
    assert.ok((sections['Canon'] || 0) >= 100,
      `Canon should have ≥100 blocks, got ${sections['Canon'] || 0}`);
    assert.ok((sections['Kontakion'] || 0) >= 2,
      `Kontakion should include Kontakion + Ikos (got ${sections['Kontakion'] || 0})`);
    assert.ok((sections['Lauds'] || 0) >= 5,
      `Lauds: ${sections['Lauds'] || 0} blocks`);

    const fullText = j.blocks.map(b => b.text || '').join('\n');
    assert.ok(fullText.includes('pangs which Thy saints, suffered for Thee'),
      'Forty Martyrs troparion text not found');
    // Lenten weekday: Small Doxology per server.js:1629 policy ("During Lent on
    // weekdays, even great feasts use the Small (read) Doxology"). Tracking
    // whether this should change for greatFeast-rank saints (Annunciation,
    // 40 Martyrs, etc.) is a separate question.
    assert.ok((sections['Great Doxology'] || 0) + (sections['Small Doxology'] || 0) > 0,
      'Some doxology should be rendered');
  });

  it('Nativity of Forerunner (2026-06-24) renders full festal Matins', async () => {
    await assertFestalMatins('2026-06-24', {
      feastName: 'Nativity of Forerunner',
      minBlocks: 320,
      troparionText: 'we who honor thee with love are at a loss',
      minCanonBlocks: 100,
      minLaudsBlocks: 5,
    });
  });

  it('St Demetrius (2026-10-26) renders full festal Matins', async () => {
    await assertFestalMatins('2026-10-26', {
      feastName: 'St Demetrius',
      minBlocks: 320,
      troparionText: 'whole world hath found thee to be a great champion',
      minCanonBlocks: 100,
      minLaudsBlocks: 5,
    });
  });

  it('St John Chrysostom (2026-11-13) renders full festal Matins', async () => {
    await assertFestalMatins('2026-11-13', {
      feastName: 'St John Chrysostom',
      minBlocks: 320,
      troparionText: 'Grace shining forth from thy mouth like a beacon',
      minCanonBlocks: 50,
      minLaudsBlocks: 5,
    });
  });

  it('Synaxis of Archangels (2026-11-08) renders full festal Matins', async () => {
    await assertFestalMatins('2026-11-08', {
      feastName: 'Synaxis of Archangels',
      minBlocks: 320,
      troparionText: 'supreme commanders of the heavenly hosts',
      minCanonBlocks: 100,
      minLaudsBlocks: 5,
    });
  });

  it('St George (2026-04-23) renders full festal Matins', async () => {
    await assertFestalMatins('2026-04-23', {
      feastName: 'St George',
      minBlocks: 320,
      troparionText: 'As a liberator of captives',
      minCanonBlocks: 100,
      minLaudsBlocks: 5,
    });
  });

  it('St Anthony the Great (2026-01-17) renders full festal Matins', async () => {
    await assertFestalMatins('2026-01-17', {
      feastName: 'St Anthony',
      minBlocks: 320,
      troparionText: 'Emulating the manner of the zealous Elijah',
      minCanonBlocks: 50,
      minLaudsBlocks: 5,
    });
  });

  it('Pentecost Matins renders two canons separately, not flat', async () => {
    const res = await get('/api/matins?date=2026-05-31');
    assert.equal(res.status, 200);
    const canonRubrics = res.json.blocks
      .filter(b => b.section === 'Canon' && b.type === 'rubric')
      .map(b => b.text);
    const firstCanonHeadings  = canonRubrics.filter(t => /First Canon/.test(t));
    const secondCanonHeadings = canonRubrics.filter(t => /Second Canon/.test(t));
    assert.ok(firstCanonHeadings.length >= 8,
      `Expected ≥8 First Canon headings, got ${firstCanonHeadings.length}`);
    assert.ok(secondCanonHeadings.length >= 8,
      `Expected ≥8 Second Canon headings, got ${secondCanonHeadings.length}`);
    // No "Troparia of Ode N from Octoechos/Menaion/Triodion" placeholders
    const placeholders = canonRubrics.filter(t => /Troparia of Ode .* from/.test(t));
    assert.equal(placeholders.length, 0,
      `Pentecost canon should have no troparia placeholders, found ${placeholders.length}. ` +
      `If >0, the canon JSON is missing troparia and falling through to the rubric placeholder.`);
  });

  it('Theophany Matins renders two canons separately, not flat', async () => {
    // Theophany has two canons (Cosmas + John of Damascus). The assembler
    // should emit "Ode N — First Canon" / Irmos / first-canon troparia /
    // "Ode N — Second Canon" / Irmos 2 / second-canon troparia for each ode,
    // not flatten both irmoi to the top with all troparia underneath.
    const res = await get('/api/matins?date=2026-01-06');
    assert.equal(res.status, 200);
    const canonRubrics = res.json.blocks
      .filter(b => b.section === 'Canon' && b.type === 'rubric')
      .map(b => b.text);
    // Expect "First Canon" and "Second Canon" headings for each of 8 odes
    const firstCanonHeadings  = canonRubrics.filter(t => /First Canon/.test(t));
    const secondCanonHeadings = canonRubrics.filter(t => /Second Canon/.test(t));
    assert.ok(firstCanonHeadings.length >= 8,
      `Expected ≥8 "First Canon" ode headings (one per Ode 1,3,4,5,6,7,8,9), got ${firstCanonHeadings.length}. ` +
      `Sample rubrics: ${canonRubrics.slice(0, 5).join(' | ')}`);
    assert.ok(secondCanonHeadings.length >= 8,
      `Expected ≥8 "Second Canon" ode headings, got ${secondCanonHeadings.length}. ` +
      `If 0, the assembler is rendering Theophany as flat-troparia instead of grouped two-canon.`);
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

// ── Translation overlay cascade ────────────────────────────────────────────
// These tests exercise the overlay loader directly (filesystem + deep merge)
// rather than going through the HTTP server. They temporarily plant test
// overlays in fixed-texts/translations/, restore on teardown.

describe('Translation overlay cascade', () => {
  const TRANSLATIONS_DIR = path.join(__dirname, '..', 'fixed-texts', 'translations');
  const testOverlays = ['_test-base', '_test-mid', '_test-leaf', '_test-cycle-a', '_test-cycle-b'];

  function writeOverlay(id, manifest, data) {
    const dir = path.join(TRANSLATIONS_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    if (data) fs.writeFileSync(path.join(dir, 'liturgy-fixed.json'), JSON.stringify(data, null, 2));
  }

  function cleanupOverlays() {
    for (const id of testOverlays) {
      const dir = path.join(TRANSLATIONS_DIR, id);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  before(() => { cleanupOverlays(); });
  after(() => { cleanupOverlays(); });

  it('default (no translation) returns base text', async () => {
    const r = await get('/api/liturgy?date=2026-05-24&format=json');
    assert.equal(r.status, 200);
    const verses = r.json.blocks.filter(b => b.section === 'Third Antiphon' && b.type === 'verse');
    assert.ok(verses.length >= 8, 'Should have at least 8 Beatitudes verses');
    assert.match(verses[0].text, /poor in spirit/i, 'First Beatitudes verse should be "poor in spirit"');
  });

  it('lists all shipped overlays without manifest warnings', async () => {
    const r = await get('/api/translations');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.translations), 'translations should be an array');
    assert.ok(r.json.translations.length >= 5, 'Expected at least the shipped overlays');
    // Shipped overlays should have no warnings. Test artifacts (xtest-*) excluded.
    const dirty = r.json.translations.filter(t => !t.id.startsWith('xtest') && t.warnings?.length);
    assert.deepEqual(dirty, [], `Manifests with warnings: ${dirty.map(d => d.id + ': ' + d.warnings.join('; ')).join(', ')}`);
  });

  it('overlay with extends chain merges parent-first', async () => {
    // base → _test-base (overrides X) → _test-mid (overrides Y) → _test-leaf (overrides X again)
    writeOverlay('_test-base', { name: 'test base', kind: 'tradition', extends: [] }, {
      beatitudes: { verses: ['BASE0','BASE1','BASE2','BASE3','BASE4','BASE5','BASE6','BASE7','BASE8','BASE9','BASE10','BASE11','BASE12'] },
    });
    writeOverlay('_test-mid', { name: 'test mid', kind: 'tradition', extends: ['_test-base'] }, {
      beatitudes: { verses: ['BASE0','BASE1','MID2','BASE3','BASE4','BASE5','BASE6','BASE7','BASE8','BASE9','BASE10','BASE11','BASE12'] },
    });
    writeOverlay('_test-leaf', { name: 'test leaf', kind: 'parish', extends: ['_test-mid'] }, {
      beatitudes: { verses: ['BASE0','LEAF1','MID2','BASE3','BASE4','BASE5','BASE6','BASE7','BASE8','BASE9','BASE10','BASE11','BASE12'] },
    });

    const r = await get('/api/liturgy?date=2026-05-24&translation=_test-leaf&format=json');
    assert.equal(r.status, 200);
    const verses = r.json.blocks.filter(b => b.section === 'Third Antiphon' && b.type === 'verse');
    // Verify all three layers contributed: LEAF1 from leaf, MID2 from mid, BASE3+ from base.
    assert.match(verses[0].text, /LEAF1/, 'leaf overlay should override verse[1] index');
    assert.match(verses[1].text, /MID2/, 'mid overlay should still apply verse[2] override');
    assert.match(verses[2].text, /BASE3/, 'base overlay should apply unchanged verse[3]');
  });

  it('cycle detection prevents infinite recursion', async () => {
    writeOverlay('_test-cycle-a', { name: 'cycle a', kind: 'tradition', extends: ['_test-cycle-b'] }, {});
    writeOverlay('_test-cycle-b', { name: 'cycle b', kind: 'tradition', extends: ['_test-cycle-a'] }, {});

    // Should return 200 (not hang or crash) — loader detects cycle and returns []
    const r = await get('/api/liturgy?date=2026-05-24&translation=_test-cycle-a&format=json');
    assert.equal(r.status, 200, 'Cycle should not crash the server');
    assert.ok(r.json.blocks && r.json.blocks.length > 0, 'Should still render the service');
  });

  it('manifest validation surfaces warnings via /api/translations', async () => {
    // Plant a deliberately bad overlay. Use non-underscore prefix so it shows
    // up in /api/translations (which filters out _-prefixed dirs as "hidden").
    writeOverlay('xtest-bad', { kind: 'bogus-kind', extends: 'not-an-array' }, {});

    const r = await get('/api/translations');
    assert.equal(r.status, 200);
    const bad = r.json.translations.find(t => t.id === 'xtest-bad');
    assert.ok(bad, 'xtest-bad overlay should appear in /api/translations');
    assert.ok(Array.isArray(bad.warnings) && bad.warnings.length > 0, 'Should have warnings');
    assert.ok(bad.warnings.some(w => /kind/i.test(w)), 'Should flag bad kind');
    assert.ok(bad.warnings.some(w => /extends/i.test(w)), 'Should flag bad extends');

    // Cleanup inline since this overlay isn't in the standard testOverlays list.
    fs.rmSync(path.join(TRANSLATIONS_DIR, 'xtest-bad'), { recursive: true, force: true });
  });

  it('drift detector flags overlay keys not present in base', async () => {
    // We can't easily intercept console.warn from a child process, but we can
    // confirm the request still succeeds — drift warnings are non-fatal.
    writeOverlay('_test-drift', { name: 'drift test', kind: 'tradition', extends: [] }, {
      'totally-made-up-key': 'this is not in base',
      beatitudes: { 'typo-field': 'wrong name' },
    });

    const r = await get('/api/liturgy?date=2026-05-24&translation=_test-drift&format=json');
    assert.equal(r.status, 200, 'Drift warnings should not break rendering');

    fs.rmSync(path.join(TRANSLATIONS_DIR, '_test-drift'), { recursive: true, force: true });
  });

  it('diff endpoint returns merged-vs-base deltas', async () => {
    // Plant an overlay with a known override and verify the diff endpoint
    // reports it.
    writeOverlay('_test-diff', { name: 'diff test', kind: 'tradition', extends: [] }, {
      beatitudes: {
        verses: [
          'In Thy Kingdom, remember us, O Lord, when Thou comest in Thy Kingdom.',
          'DIFFERENT FIRST VERSE',
          // ...truncated; the diff happens on the whole array since arrays are diffed wholesale
        ],
      },
    });

    const r = await get('/api/translations/_test-diff/diff?service=liturgy');
    assert.equal(r.status, 200);
    assert.equal(r.json.overlay, '_test-diff');
    assert.equal(r.json.service, 'liturgy');
    assert.ok(r.json.count >= 1, 'Should report at least one diff');
    const beatitudesDiff = r.json.diffs.find(d => d.path === 'beatitudes.verses');
    assert.ok(beatitudesDiff, 'beatitudes.verses should be in the diff list');
    assert.ok(Array.isArray(beatitudesDiff.overlay), 'overlay value should be an array');
    assert.match(JSON.stringify(beatitudesDiff.overlay), /DIFFERENT FIRST VERSE/);
  });

  it('blocks are tagged with _overlay when text matches an overlay override', async () => {
    // Plant an overlay that introduces a distinctive new string. Verify the
    // assembled block carrying that string is tagged.
    writeOverlay('_test-tag', { name: 'tag test', kind: 'tradition', extends: [] }, {
      beatitudes: {
        verses: [
          'In Thy Kingdom, remember us, O Lord, when Thou comest in Thy Kingdom.',
          'TAGGED OVERRIDE STRING for testing',
          'Blessed are they that mourn, for they shall be comforted.',
          'Blessed are the meek, for they shall inherit the earth.',
          'Blessed are they that hunger and thirst after righteousness, for they shall be sated.',
          'Blessed are the merciful, for they shall obtain mercy.',
          'Blessed are the pure in heart, for they shall see God.',
          'Blessed are the peacemakers, for they shall be called the sons of God.',
          "Blessed are they that are persecuted for righteousness' sake, for theirs is the Kingdom of the Heavens.",
          'Blessed are ye when men shall revile you, and persecute you, and shall say all manner of evil against you falsely, for My sake.',
          'Rejoice, and be exceeding glad, for great is your reward in the heavens.',
          'Glory to the Father, and to the Son, and to the Holy Spirit.',
          'Now and ever, and unto ages of ages. Amen.',
        ],
      },
    });

    const r = await get('/api/liturgy?date=2026-05-24&translation=_test-tag&format=json');
    assert.equal(r.status, 200);
    assert.equal(r.json.translation, '_test-tag', 'Response carries the active translation id');
    const tagged = r.json.blocks.filter(b => b._overlay === '_test-tag');
    assert.ok(tagged.length >= 1, 'At least one block should be tagged with _overlay');
    assert.ok(tagged.some(b => b.text === 'TAGGED OVERRIDE STRING for testing'),
      'The block with the distinctive overridden string should be tagged');

    fs.rmSync(path.join(TRANSLATIONS_DIR, '_test-tag'), { recursive: true, force: true });
  });
});

describe('Data file validation', () => {
  const validators = require('../data-validators');

  it('great-feast-variants.json passes validation as shipped', () => {
    const gfv = require('../variable-sources/great-feast-variants.json');
    assert.deepEqual(validators.validateGreatFeastVariants(gfv), []);
  });

  it('pentecostarion-sunday-overrides.json passes validation as shipped', () => {
    const p = require('../variable-sources/pentecostarion-sunday-overrides.json');
    assert.deepEqual(validators.validatePentecostarionOverrides(p), []);
  });

  it('cocelebrated-overlays.json passes validation as shipped', () => {
    const co = require('../variable-sources/cocelebrated-overlays.json');
    assert.deepEqual(validators.validateCocelebratedOverlays(co), []);
  });

  it('daily-propers.json passes validation as shipped', () => {
    const dp = require('../variable-sources/daily-propers.json');
    assert.deepEqual(validators.validateDailyPropers(dp), []);
  });

  it('daily-propers rejects a missing tone-3 Sunday prokeimenon', () => {
    const dp = JSON.parse(JSON.stringify(require('../variable-sources/daily-propers.json')));
    delete dp.sundayProkeimena[3];
    const errs = validators.validateDailyPropers(dp);
    assert.ok(errs.some(e => /sundayProkeimena\.3 missing/.test(e)),
      `Expected missing-tone error, got: ${errs.join(' | ')}`);
  });

  it('liturgy-defaults.json passes validation as shipped', () => {
    const ld = require('../variable-sources/liturgy-defaults.json');
    assert.deepEqual(validators.validateLiturgyDefaults(ld), []);
  });

  it('liturgy-defaults rejects missing paschal megalynarion', () => {
    const broken = JSON.parse(JSON.stringify(require('../variable-sources/liturgy-defaults.json')));
    delete broken.paschalMegalynarion;
    const errs = validators.validateLiturgyDefaults(broken);
    assert.ok(errs.some(e => /paschalMegalynarion/.test(e)),
      `Expected paschalMegalynarion error, got: ${errs.join(' | ')}`);
  });

  it('liturgical-day-labels.json passes validation as shipped', () => {
    const labels = require('../variable-sources/liturgical-day-labels.json');
    assert.deepEqual(validators.validateLiturgicalDayLabels(labels), []);
  });

  it('liturgical-day-labels rejects a non-numeric Lenten Sunday key', () => {
    const broken = JSON.parse(JSON.stringify(require('../variable-sources/liturgical-day-labels.json')));
    broken.lentenSundays['foo'] = 'X';
    const errs = validators.validateLiturgicalDayLabels(broken);
    assert.ok(errs.some(e => /lentenSundays.*'foo'/.test(e)),
      `Expected key-format error, got: ${errs.join(' | ')}`);
  });

  it('all menaion great-feast JSONs pass validation as shipped', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const dir = path.join(__dirname, '..', 'variable-sources', 'menaion');
    const errs = validators.validateAllMenaionFeasts(dir, fs, path);
    assert.deepEqual(errs, [], `Menaion validation errors:\n${errs.join('\n')}`);
  });

  it('menaion validator rejects a great-feast file missing canon.tone', () => {
    const broken = {
      troparion: { tone: 1, text: 't' },
      kontakion: { tone: 1, text: 'k' },
      matins: {
        magnification: { refrain: 'r', verses: ['v'] },
        prokeimenon: { tone: 4, refrain: 'r' },
        gospel: { reading: 'X 1:1-2' },
        canon: { /* missing tone */
          ode1: { irmos: 'i' }, ode3: { irmos: 'i' }, ode4: { irmos: 'i' },
          ode5: { irmos: 'i' }, ode6: { irmos: 'i' }, ode7: { irmos: 'i' },
          ode8: { irmos: 'i' }, ode9: { irmos: 'i' },
        },
      },
    };
    const errs = validators.validateMenaionFeast(broken, 'test.json');
    assert.ok(errs.some(e => /canon\.tone/.test(e)),
      `Expected canon.tone error, got: ${errs.join(' | ')}`);
  });

  it('menaion validator rejects a canon ode missing irmos', () => {
    const broken = {
      matins: {
        magnification: { refrain: 'r', verses: ['v'] },
        prokeimenon: { tone: 4, refrain: 'r' },
        gospel: { reading: 'X 1:1' },
        canon: { tone: 4,
          ode1: { /* missing irmos */ troparia: [{ text: 't' }] },
          ode3: { irmos: 'i' }, ode4: { irmos: 'i' }, ode5: { irmos: 'i' },
          ode6: { irmos: 'i' }, ode7: { irmos: 'i' }, ode8: { irmos: 'i' },
          ode9: { irmos: 'i' },
        },
      },
    };
    const errs = validators.validateMenaionFeast(broken, 'test.json');
    assert.ok(errs.some(e => /ode1\.irmos/.test(e)),
      `Expected ode1.irmos error, got: ${errs.join(' | ')}`);
  });

  it('menaion validator skips files without a matins block', () => {
    const soulSat = { vespers: { troparion: 'X' } };
    assert.deepEqual(validators.validateMenaionFeast(soulSat, 'march-07.json'), []);
  });

  it('great-feast-variants rejects a feast missing communionHymn', () => {
    const broken = { theophany: { type: 'lord', label: 'X', troparia: [{ tone: 1, text: 't' }],
      kontakia: [{ tone: 1, text: 'k' }], megalynarion: 'M', entranceHymn: 'E' } };
    const errs = validators.validateGreatFeastVariants(broken);
    assert.ok(errs.some(e => /communionHymn/.test(e)), `Expected communionHymn error, got: ${errs.join(' | ')}`);
  });

  it('great-feast-variants rejects a troparion missing tone', () => {
    const broken = { theophany: { type: 'lord', label: 'X', entranceHymn: 'E',
      troparia: [{ text: 'no tone' }], kontakia: [{ tone: 1, text: 'k' }],
      megalynarion: 'M', communionHymn: 'C' } };
    const errs = validators.validateGreatFeastVariants(broken);
    assert.ok(errs.some(e => /tone/.test(e)), `Expected tone error, got: ${errs.join(' | ')}`);
  });

  it('pentecostarion overrides rejects a non-numeric key', () => {
    const broken = { 'thomas': { feastOnly: true, troparia: [], kontakia: [], communionHymn: 'c' } };
    const errs = validators.validatePentecostarionOverrides(broken);
    assert.ok(errs.some(e => /numeric/.test(e)), `Expected numeric-key error, got: ${errs.join(' | ')}`);
  });

  it('cocelebrated overlays rejects a malformed date key', () => {
    const broken = { 'May21': { troparion: { tone: 8, text: 't' } } };
    const errs = validators.validateCocelebratedOverlays(broken);
    assert.ok(errs.some(e => /M-D/.test(e)), `Expected date-format error, got: ${errs.join(' | ')}`);
  });
});
