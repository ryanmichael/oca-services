'use strict';

/**
 * Feature contract: the HTML service page honours ?translation=.
 *
 * Until 2026-11-07 `server-lib/routes/service-page.js` read only `date` and
 * `pronoun`. It passed the BASE fixed texts and BASE sources to
 * assembleForDate, and destructured `resolveTranslation` out of ctx without
 * ever calling it. Every parish URL therefore rendered base OCA while looking
 * like the parish's own service.
 *
 * That is worse than a missing feature. The page is what a person opens to
 * check our text against what they heard in church, so the one surface built
 * for catching our mistakes was quietly showing them someone else's text. Two
 * real defects reported from the kliros in November 2026 could not have been
 * seen on it.
 *
 * INV-2 is the invariant that matters: the page must AGREE WITH /api/service
 * for the same query. Asserting only that parish ≠ base would pass if the page
 * resolved the translation half-way — the exact failure mode here, where some
 * inputs were threaded and others were not.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3128; // distinct from every other contract test and dev 3000
const DATE = '2026-11-07';          // Sat eve: Great Vespers of the Bodiless Powers
const TYLER = 'st-john-damascus-tyler';

/**
 * Blocks the HTML page is KNOWN not to carry, by id prefix, with the reason.
 * Named explicitly so the hole cannot quietly widen: the test asserts the set
 * of absent blocks is EXACTLY this, so closing the gap also fails the test and
 * forces this list to shrink deliberately.
 */
const KNOWN_PAGE_GAPS = [
  // /api/service enriches Old-Testament lessons with their full text from
  // orthocal before assembling; the page passes entryOverride = null and so
  // prints the citations without the readings. Affects base and parish alike,
  // so it is NOT a translation bug. Measured 2026-11-07: ot-1/2/3 on this date.
  /^ot-\d+-text$/,
];

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}
const json = async (u) => JSON.parse(await get(u));
async function waitForServer(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try { await get('/'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error(`Server did not start within ${maxMs}ms`);
}

let serverProcess;
before(async () => {
  serverProcess = spawn('node', ['server.js'],
    { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await waitForServer();
});
after(() => { if (serverProcess) serverProcess.kill(); });

/** HTML -> comparable letters. */
const letters = (s) => String(s).toLowerCase().replace(/[^a-z]+/g, '');
const strip = (html) => letters(html.replace(/<[^>]+>/g, ' '));

describe('Feature contract: the service page honours ?translation=', () => {

  it('INV-1: base and parish render DIFFERENT text on the same date', async () => {
    // Anchored on known texts, not on mere inequality — two pages could differ
    // for an unrelated reason and still both be wrong.
    // FALSIFIED BY: passing `fixedTexts, sources` back to assembleForDate —
    // the parish page reverts to the base wording and these flip.
    const base  = strip(await get(`/service?date=${DATE}`));
    const tyler = strip(await get(`/service?date=${DATE}&translation=${TYLER}`));

    assert.ok(base.includes(letters('Possessing victory over hell')),
      'base must render the OCA service-texts Octoechos wording');
    assert.ok(tyler.includes(letters('Possessing victory over Hades')),
      'the parish must render its own engraved-music Octoechos wording');

    assert.ok(base.includes(letters('brightest attendant of the triply-radiant')),
      'base must render the OCA service-texts Menaion wording');
    assert.ok(tyler.includes(letters('bright messenger of the tri-luminary')),
      'the parish must render its own Menaion variant');
  });

  it('INV-2: the page AGREES with /api/service for the same query', async () => {
    // The real contract. Half-resolving the translation — some inputs threaded,
    // others not — is precisely what shipped before, and INV-1 alone would not
    // have caught it.
    for (const t of ['', `&translation=${TYLER}`]) {
      const api  = await json(`/api/service?date=${DATE}&service=vespers${t}`);
      const page = strip(await get(`/service?date=${DATE}${t}`));
      const blocks = (api.blocks || api).filter(b => b.text && b.type !== 'rubric');
      assert.ok(blocks.length > 150, `too few blocks to be a real service (${blocks.length})`);

      const absent = blocks.filter(b => !page.includes(letters(b.text).slice(0, 70)));
      const unexpected = absent.filter(b => !KNOWN_PAGE_GAPS.some(re => re.test(b.id)));
      assert.deepEqual(unexpected.map(b => b.id), [],
        `${t || 'base'}: the page is missing text the API renders`);

      // And every known gap must still BE a gap: if it closes, shrink the list.
      assert.ok(absent.length > 0 && absent.every(b => KNOWN_PAGE_GAPS.some(re => re.test(b.id))),
        `${t || 'base'}: KNOWN_PAGE_GAPS is stale — update it deliberately`);
    }
  });

  it('INV-3: an unknown translation falls back to base instead of failing', async () => {
    const html = await get(`/service?date=${DATE}&translation=no-such-overlay`);
    assert.ok(strip(html).includes(letters('Possessing victory over hell')),
      'an unresolvable translation must render the base service, not an error');
  });
});
