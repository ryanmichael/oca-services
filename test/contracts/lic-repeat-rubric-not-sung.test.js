/**
 * Feature contract: a repeat rubric is never sung, and never consumes a slot
 *
 * The OCA Menaion fills a weekday's stichoi by REPEATING a sticheron, printing
 * the instruction in the book — "(Repeat: 'Having placed all their hope…')".
 * Other translations abbreviate it to a trailing "(twice)". The scraper
 * captured that marker into the sung body, so the choir read it as a lyric.
 *
 * Found 2026-10-29 reviewing 2026-11-01 (Cosmas and Damian) two days out.
 * Three faults in one slot, with `audit:date` reporting 0 high / 0 medium /
 * 0 low on all of them:
 *
 *   1. "…pray with boldness on behalf of our souls! (twice)" printed as text.
 *   2. A `raphaela` row sat at order=1, ahead of OCA's own set at orders 2-5,
 *      so sticheron A was sung TWICE — once in each translation — mixing
 *      translations inside one service, which CLAUDE.md forbids.
 *   3. Because the duplicate ate the fourth slot, OCA's fourth sticheron
 *      "O holy unmercenaries, Cosmas and Damian" was DROPPED entirely.
 *
 * reference/scrape/2024-11-01.docx appoints four DISTINCT stichera (A, B, C, D)
 * and reaches the weekday Polyeleos' six stichoi with "(Repeat: …)" after A and
 * after B. reference/orders/2026-1101 appoints "4 stichera of the
 * Unmercenaries, Tone 6" on a Sunday — so the four distinct hymns, no repeat.
 *
 * Fix: the raphaela duplicate is tagged `group_role='alternative-set'`, which
 * for-date.js already excludes from the sung set, and the marker is stripped
 * from its body. A repeat belongs in lic-repeat-patterns.json or in a second
 * byte-identical row — never in the text.
 *
 * INV-5 is the falsification guard: it asserts the Raphaela text is still
 * PRESENT in the corpus, so a future cleanup cannot "fix" this by deleting a
 * permission-granted translation instead of re-keying it.
 *
 * Asserts POSITION and SUBJECT, never labels — every label here was already
 * correct, which is what made the defect invisible.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3120; // distinct: 3119 was the last taken
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

// 2026-10-31 is the civil evening; the content is 2026-11-01 (vespers date-shift).
const COSMAS_EVE = '2026-10-31';

const vespers = async (date) => (await get(`/api/service?service=vespers&date=${date}`)).json;
const lic = (blocks) => blocks.filter(b => b.section === 'Lord, I Have Cried');

function rows(commId, section) {
  const { openDb } = require(path.join(ROOT, 'server-lib', 'cache', 'sqlite'));
  const db = openDb();
  try {
    return db.prepare(
      'SELECT "order" AS ord, source, group_role AS groupRole, text FROM stichera ' +
      'WHERE commemoration_id = ? AND section = ? ORDER BY "order"'
    ).all(commId, section);
  } finally { db.close(); }
}

// The repeat rubric in every form the corpus has shown: "(twice)", "(thrice)",
// "(2x)". Requires the parentheses — "O thrice-blessed ones" is genuine verse,
// and 189 rows read that way.
const REPEAT_RUBRIC = /\((?:twice|thrice|\d+\s*x)\)/i;

describe('Feature contract: a repeat rubric is never sung and never eats a slot', () => {
  it('INV-1: no repeat rubric prints anywhere in Cosmas and Damian Vespers', async () => {
    const svc = await vespers(COSMAS_EVE);
    for (const b of svc.blocks) {
      assert.doesNotMatch(b.text || '', REPEAT_RUBRIC,
        `${COSMAS_EVE} eve prints a repeat rubric as sung text: "${String(b.text).slice(0, 60)}…"`);
    }
  });

  it('INV-2: the four appointed Unmercenaries stichera are DISTINCT', async () => {
    const menaion = lic((await vespers(COSMAS_EVE)).blocks)
      .filter(b => b.source === 'menaion' && b.type === 'hymn');
    // reference/orders/2026-1101: 4 stichera + Glory, all Tone 6.
    assert.ok(menaion.length >= 5,
      `expected 4 Unmercenaries stichera plus the Glory, got ${menaion.length}`);
    // Compared by NORMALISED INCIPIT, not by raw text. The defect this guards
    // was the same hymn in two translations — "a treasure which cannot be
    // stolen away" beside "a treasure that cannot be stolen away" — whose raw
    // strings differ, so a Set over them reported four "distinct" stichera and
    // this invariant passed against the broken DB. A copied hymn shares its
    // body; only the wording moves.
    const incipit = (s) => String(s || '')
      .replace(/\/\//g, ' ')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    const sung = menaion.slice(0, 4).map(b => incipit(b.text));
    assert.equal(new Set(sung).size, 4,
      'the four appointed stichera must be four DIFFERENT hymns — a Sunday appoints ' +
      'no repeat; the "(Repeat: …)" lines in the OCA text fill the weekday\'s six ' +
      `stichoi. Got incipits: ${JSON.stringify(sung, null, 1)}`);
  });

  it('INV-3: OCA\'s fourth sticheron is not dropped', async () => {
    // This hymn vanished entirely while the duplicate occupied its slot.
    const texts = lic((await vespers(COSMAS_EVE)).blocks).map(b => b.text || '').join('\n');
    assert.match(texts, /scorned the tyranny of suffering/,
      '"O holy unmercenaries, Cosmas and Damian, you scorned the tyranny of suffering" ' +
      'is the fourth appointed sticheron and must be sung');
  });

  it('INV-4: the sung set is the OCA set, not a mix of translations', () => {
    const numbered = rows(2256, 'lordICall')
      .filter(r => r.ord >= 1 && r.groupRole !== 'alternative-set' && r.groupRole !== 'stavrotheotokion');
    assert.ok(numbered.length >= 4, `expected >= 4 sung rows, got ${numbered.length}`);
    const sources = new Set(numbered.map(r => r.source));
    assert.deepEqual([...sources], ['oca-menaion'],
      `the numbered set must come from one translation, got: ${[...sources].join(', ')}`);
  });

  it('INV-5: the Raphaela translation is RETAINED, just not sung', () => {
    // Falsification guard. The 2026-09-20 Raphaela ingest was permission-
    // confirmed and its rows stay in the corpus; the fix re-keys this one out
    // of the sung sequence rather than deleting it. If a later cleanup removes
    // it, this fails rather than quietly discarding granted content.
    const alt = rows(2256, 'lordICall').filter(r => r.groupRole === 'alternative-set');
    assert.equal(alt.length, 1, 'the Raphaela duplicate must be retained as an alternative-set row');
    assert.match(alt[0].text, /a treasure which cannot be stolen away/,
      'the retained row is the Raphaela translation ("which", not OCA\'s "that")');
    assert.doesNotMatch(alt[0].text, REPEAT_RUBRIC,
      'even an unsung row must not carry the rubric in its body');
  });
});
