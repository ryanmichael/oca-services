/**
 * Feature contract: a movable Fathers Sunday must not be projected onto fixed saints
 *
 * OCA publishes service texts by CALENDAR DATE, so a scrape of a date that a
 * movable commemoration occupied captures the movable propers. Keyed by
 * month-day, those texts land on whichever fixed saint our calendar holds
 * there, and the render credits him with them.
 *
 * Found 2026-10-29. Four commemorations each held a complete movable Fathers
 * set and nothing of their own saint:
 *
 *   1090  6-1   Day of the Holy Spirit   3 Ascension + 4 Fathers + Glory, from 2025-06-01
 *   1216  6-16  St Tikhon of Amathus     the same set, from 2024-06-16
 *   1415  7-13  Synaxis of Gabriel       the Six-Councils set, from 2025-07-13
 *   1421  7-14  Apostle Aquila           the same set, from 2024-07-14
 *
 * 2026-06-15 eve sang "The Lord has ascended into heaven" under St Tikhon's
 * name in mid-June, and 2026-07-12 eve sang "but Arius taught…" under the
 * Archangel Gabriel's. `audit:date` was 0 high / 0 medium / 0 low on all of it,
 * because the rows are correctly LABELLED for the commemoration they sit on.
 *
 * The resolution rests on a fact that must not be lost, which is why INV-4
 * exists: the same scrapes ALSO populated the `blocks` table, and there they
 * are keyed movably (`pentecostarion.week.7.sunday`). That movable copy is
 * what serves the real date. So 1090/1216 were deleted as redundant fixed-date
 * projections, 1415's set moved to its own comm 1450 "Fathers of the First Six
 * Councils" (which held no stichera), and 1421's identical copy was deleted.
 * Deleting the fixed copies left 2026-05-23 eve BYTE-IDENTICAL.
 *
 * `npm run audit:movable-projection` is the drift guard over the 33 remaining
 * commemorations carrying this defect.
 *
 * Asserts POSITION and SUBJECT, never labels — the labels were correct
 * throughout, which is precisely what made the defect invisible.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3119; // distinct: 3118 was the last taken
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

const vespers = async (date) => (await get(`/api/service?service=vespers&date=${date}`)).json;
const lic = (blocks) => blocks.filter(b => b.section === 'Lord, I Have Cried');

// The doxastikon is the first hymn AFTER the "Glory to the Father" doxology —
// read by position, because its label is not what identifies it.
function gloryHymn(blocks) {
  const rows = lic(blocks);
  const i = rows.findIndex(b => b.type === 'doxology' && /^Glory to the Father/.test(b.text || ''));
  if (i < 0) return null;
  return rows.slice(i + 1).find(b => b.type === 'hymn' || b.text) || null;
}

function stichera(commId) {
  const { openDb } = require(path.join(ROOT, 'server-lib', 'cache', 'sqlite'));
  const db = openDb();
  try {
    return db.prepare('SELECT section, "order", text FROM stichera WHERE commemoration_id = ?').all(commId);
  } finally { db.close(); }
}

describe('Feature contract: movable Fathers propers are not projected onto fixed saints', () => {
  it('INV-1: the Six-Councils set sits on comm 1450, and not on Gabriel or Aquila', () => {
    const councils = stichera(1450);
    assert.ok(councils.length >= 4, `comm 1450 should hold the Six-Councils set, got ${councils.length} row(s)`);
    // The set is identifiable by the heresies it names — six councils' worth.
    assert.ok(councils.some(r => /Macedónians|Macedonians/.test(r.text)),
      'comm 1450 should hold the sticheron naming the Macedonians and Nestorians');
    assert.equal(stichera(1415).length, 0, 'Synaxis of the Archangel Gabriel must hold no Fathers stichera');
    assert.equal(stichera(1421).length, 0, 'Apostle Aquila must hold no Fathers stichera');
  });

  it('INV-2: comms 1090 and 1216 hold no stichera, and Simeon holds his own', () => {
    assert.equal(stichera(1090).length, 0, 'Day of the Holy Spirit must not hold a fixed-date Fathers projection');
    assert.equal(stichera(1216).length, 0, 'St Tikhon of Amathus must not hold a fixed-date Fathers projection');
    // comm 1040 carries the First-Council title; its stichera were Simeon's.
    assert.equal(stichera(1040).length, 0, 'comm 1040 must not hold St Simeon\'s stichera');
    const simeon = stichera(1041);
    assert.ok(simeon.length >= 4, `comm 1041 (Simeon Stylites) should hold his stichera, got ${simeon.length}`);
    assert.ok(simeon.some(r => /Simeon/.test(r.text)), 'comm 1041 should hold a sticheron naming Simeon');
  });

  it('INV-3: no fixed saint sings about Arius or the Ascension out of season', async () => {
    for (const date of ['2026-07-12', '2026-07-13', '2026-06-15']) {
      const rows = lic((await vespers(date)).blocks);
      for (const b of rows) {
        assert.doesNotMatch(b.text || '', /Arius/,
          `${date} eve must not sing about Arius (a First-Council hymn on a fixed saint)`);
        assert.doesNotMatch(b.text || '', /ascended into heaven/,
          `${date} eve must not sing an Ascension hymn`);
      }
    }
  });

  it('INV-4: the MOVABLE copy still serves the real Fathers Sunday (2026-05-23 eve)', async () => {
    // This is the falsification that protects the fix. The texts live in
    // `blocks` under pentecostarion.week.7.sunday, NOT in `stichera`. If a
    // future cleanup deletes the movable copy too, this fails and the
    // 7th-Sunday-of-Pascha Vespers silently loses its propers.
    const rows = lic((await vespers('2026-05-23')).blocks);
    const ascension = rows.filter(b => /ascen/i.test(b.text || ''));
    const fathers   = rows.filter(b => /Arius|God-bearing Fathers/.test(b.text || ''));
    // reference/orders/2026-0524: 3 Resurrection + 3 Ascension + 4 Fathers.
    assert.ok(ascension.length >= 3, `expected >= 3 Ascension stichera, got ${ascension.length}`);
    assert.ok(fathers.length >= 4, `expected >= 4 Fathers stichera, got ${fathers.length}`);
    const glory = gloryHymn((await vespers('2026-05-23')).blocks);
    assert.ok(glory, '2026-05-23 eve must have a hymn after the Glory doxology');
    assert.match(glory.text, /mystical trumpets of the Spirit/,
      'the Glory on the Fathers Sunday is the Fathers\' doxastikon');
  });

  it('INV-5: 7-19 takes the Fathers\' doxastikon at the Glory, not Seraphim\'s', async () => {
    // reference/orders/2026-0719 appoints "Glory… Fathers, Tone 6" and brackets
    // Seraphim as "(sung whenever the Rector/Superior wishes)". Before the fix
    // the Glory was Seraphim's "Come, O assemblies of the faithful".
    const glory = gloryHymn((await vespers('2026-07-18')).blocks);
    assert.ok(glory, '2026-07-18 eve must have a hymn after the Glory doxology');
    assert.match(glory.text, /mystical trumpets of the Spirit/,
      'the Glory belongs to the Fathers of the Six Councils');
    assert.doesNotMatch(glory.text, /Saróv|Seraphim/,
      'the Glory must not be Seraphim\'s doxastikon');
  });
});
