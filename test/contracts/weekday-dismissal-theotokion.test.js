'use strict';

/**
 * Feature contract: the weekday dismissal Theotokion.
 *
 * A weekday Vespers closes with the DAILY dismissal Theotokion of its own day.
 * Until 2026-10-02 `dismissalTheotokion` existed only under `saturday` in all
 * eight tones, and for-date.js hardcoded that key, so all five weekday evenings
 * closed with Sunday's resurrectional hymn — at the correct tone, which is why
 * every tone rule (D4, D16) and every presence rule passed clean on 203 of 365
 * dates.
 *
 * Found from the choir director's 2026-10-07 Daily Vespers sheet, which appoints
 * the Thursday Theotokion "O Pure Theotokos and gate of eternal life" where we
 * printed the Saturday one. She identified the parish's source, whose appendix
 * labels every entry by BOTH reckonings — "Thursday (Wednesday Evening)" —
 * which is what makes the day mapping checkable rather than inferred.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const OCTOECHOS = require(path.join(ROOT, 'variable-sources', 'octoechos.json'));


const PORT = 3105;
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    }).on('error', reject);
  });
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** The hymn after the final "Now and ever…" in the Troparia section. */
function closingTheotokion(blocks) {
  const trop = (blocks || []).filter((b) => b.section === 'Troparia');
  let nowIdx = -1;
  trop.forEach((b, i) => {
    if (b.type === 'doxology' && /^Now and ever/i.test(b.text || '')) nowIdx = i;
  });
  if (nowIdx === -1) return null;
  return trop.slice(nowIdx + 1).find((b) => b.type === 'hymn') || null;
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch (_) { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

describe('Feature contract: weekday dismissal Theotokion', () => {
  it('INV-1: the data covers 5 evenings x 8 tones, and not Saturday evening', () => {
    // Keyed by CIVIL EVENING (octoechos.json _meta.weekdayVespersConvention).
    for (let t = 1; t <= 8; t++) {
      for (const eve of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) {
        const h = OCTOECHOS[`tone${t}`]?.[eve]?.vespers?.dismissalTheotokion;
        assert.ok(h && h.text, `tone${t}.${eve} dismissalTheotokion missing`);
        assert.ok(h.text.length > 40, `tone${t}.${eve} looks truncated: "${h.text}"`);
      }
      // Friday evening = liturgical Saturday, absent from the source appendix.
      assert.ok(!OCTOECHOS[`tone${t}`]?.friday?.vespers?.dismissalTheotokion,
        `tone${t}.friday unexpectedly present — update _meta.knownGaps and this test together`);
    }
  });

  it('INV-2: the weekday hymn is NEVER the Saturday/resurrectional one', () => {
    // The precise shape of the original bug.
    for (let t = 1; t <= 8; t++) {
      const sat = norm(OCTOECHOS[`tone${t}`]?.saturday?.vespers?.dismissalTheotokion?.text);
      assert.ok(sat, `tone${t}.saturday must exist as the contrast case`);
      for (const eve of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) {
        const day = norm(OCTOECHOS[`tone${t}`][eve].vespers.dismissalTheotokion.text);
        assert.notEqual(day, sat, `tone${t}.${eve} is the Saturday hymn`);
      }
    }
  });

  it('INV-3: 2026-10-07 renders the hymn on the choir sheet', async () => {
    // Wednesday evening serving Thursday Oct 8. Tyler sings the Tone 8 general
    // troparion for a woman monastic, so the Theotokion follows at Tone 8 —
    // the source's "Thursday (Wednesday Evening)" entry for Tone 8.
    const r = await get('/api/service?date=2026-10-07&translation=st-john-damascus-tyler');
    const theo = closingTheotokion(r.json.blocks);
    assert.ok(theo, 'a closing Theotokion must render');
    assert.equal(theo.tone, 8);
    assert.match(theo.text, /gate of eternal life/);
  });

  it('INV-4: the rendered text equals the data for (tone, sung evening)', async () => {
    // Asserts the day mapping end to end rather than trusting the key string.
    // The API date IS the civil evening (Vespers date-shift), which is exactly
    // how octoechos.json is keyed — so the evening is read off the date itself.
    //
    // An earlier draft of this test derived the day from `calendarDay.dayOfWeek`,
    // which /api/service does not return; every iteration hit `continue` and the
    // test passed while asserting nothing. Hence `checked`: a guard count is the
    // only thing that stops a skip-heavy loop from going quietly vacuous.
    const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let checked = 0;
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-13']) {
      const r = await get(`/api/service?date=${date}`);
      const theo = closingTheotokion(r.json.blocks);
      if (!theo || theo.source !== 'octoechos') continue;   // feast troparion may own the slot
      const eve = DOW[new Date(`${date}T12:00:00Z`).getUTCDay()];
      const expected = OCTOECHOS[`tone${theo.tone}`]?.[eve]?.vespers?.dismissalTheotokion?.text;
      if (!expected) continue;                              // the friday gap
      assert.equal(norm(theo.text), norm(expected),
        `${date} (${eve} eve, tone ${theo.tone}) rendered the wrong daily Theotokion`);
      checked++;
    }
    assert.ok(checked >= 3, `only ${checked} date(s) actually asserted — the loop went vacuous`);
  });

  it('INV-5: Saturday evening keeps the resurrectional Theotokion', async () => {
    // The regression this change would most plausibly cause.
    const r = await get('/api/service?date=2026-10-10');   // Saturday eve -> Sunday
    const theo = closingTheotokion(r.json.blocks);
    if (theo && theo.source === 'octoechos') {
      const sat = OCTOECHOS[`tone${theo.tone}`]?.saturday?.vespers?.dismissalTheotokion?.text;
      assert.ok(sat, 'precondition: a Saturday hymn for that tone');
      assert.equal(norm(theo.text), norm(sat), 'Sunday must keep the resurrectional hymn');
    }
  });

  it('INV-6: Friday evening falls back rather than rendering empty', async () => {
    // Liturgical Saturday has no daily Theotokion in our source; the fallback
    // keeps the pre-2026-10-02 behaviour instead of an empty slot.
    const r = await get('/api/service?date=2026-10-09');   // Friday eve -> Saturday
    const theo = closingTheotokion(r.json.blocks);
    if (theo) assert.ok((theo.text || '').length > 40, `empty closing Theotokion: "${theo.text}"`);
  });

  it('INV-7: every authored hymn carries its source tag', () => {
    // The register diverges from the stSergius text around it, so the tag is
    // what makes the mix visible and replaceable later.
    for (let t = 1; t <= 8; t++) {
      for (const eve of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) {
        assert.equal(OCTOECHOS[`tone${t}`][eve].vespers.dismissalTheotokion._source,
          'mtMaryDailyOctoechos', `tone${t}.${eve} missing _source`);
      }
    }
  });
});
