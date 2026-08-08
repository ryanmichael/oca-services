/**
 * Feature contract: on a Sunday, the resurrectional cycle owns the Matins
 * prokeimenon and Gospel
 *
 * A menaion file's `matins.prokeimenon` and `matins.gospel` belong to the SAINT.
 * On a weekday they are what is sung. On a Sunday they are not: the Octoechos
 * prokeimenon in the week's tone and the eothinon Gospel govern, and a polyeleos
 * or vigil saint does not displace them. Only a Great Feast does.
 *
 * Verified against reference/orders/2026-0809-order-services.txt, which prints
 *   Prokeimenon, Tone 1: "'I will now arise,' says the Lord…"
 *   10th Matins Gospel: (66) John 21:1-14
 * for a polyeleos saint on a Sunday, where august-09.json supplies Apostle
 * Matthias's Tone-4 prokeimenon and John 21:15-25 (#67).
 *
 * Two things made this survive a long time and both are pinned below.
 *
 * INV-3 — the guard must key on getGreatFeastKey, NOT on the menaion's
 * `_meta.feastRank`. 43 menaion files declare `feastRank: 'greatFeast'` while
 * only 14 dates are actually Great Feasts; the field is used loosely in the data
 * to mean "vigil rank". Keying off it leaves St. Nicholas, St. Luke, the Synaxis
 * of Michael and others still overriding the Sunday cycle.
 *
 * INV-4 — suppressing the saint's prokeimenon is only half the job. The
 * menaion-bearing code path never consulted the Octoechos, so the naive fix
 * renders an EMPTY prokeimenon section. Absence is the failure mode to watch:
 * it is quieter than a wrong tone.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const cal  = require(path.join(ROOT, 'calendar-rules.js'));

const PORT = 3085; // distinct: sunday-matins 3085, pick-library 3086, practice 3087,
                   // royster 3089, faithful-litany 3090, … dev 3000
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
    cwd: ROOT,
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

// First passage of each eothinon, by number.
const EOTHINON_INCIPIT = {
  1: 'Matthew 28:16',  2: 'Mark 16:1',   3: 'Mark 16:9',  4: 'Luke 24:1',
  5: 'Luke 24:12',     6: 'Luke 24:36',  7: 'John 20:1',  8: 'John 20:11',
  9: 'John 20:19',    10: 'John 21:1',  11: 'John 21:15',
};

// Every 2026 Sunday whose menaion file supplies its own Matins propers — the
// exact class of dates this guard governs. Audit Tier 4 samples the same class.
const AFFECTED_SUNDAYS = [
  '2026-01-11', '2026-01-25', '2026-07-05', '2026-07-12', '2026-07-19',
  '2026-07-26', '2026-08-09', '2026-08-16', '2026-10-18', '2026-11-08',
  '2026-12-06', '2026-12-13',
];

async function matinsProbe(date) {
  const { json } = await get(`/api/matins?date=${date}`);
  assert.ok(json && json.blocks, `no matins blocks for ${date}`);
  const prok = json.blocks.filter(
    b => /Prokeimenon/i.test(b.section || '') && b.type === 'hymn');
  const gospel = json.blocks.find(
    b => /Gospel/i.test(b.section || '') && b.label);
  return { tone: json.tone, prok, gospel };
}

describe('Feature contract: Sunday Matins prokeimenon + Gospel', () => {

  it('INV-1: 2026-08-09 matches the OCA order exactly', async () => {
    const { tone, prok, gospel } = await matinsProbe('2026-08-09');
    assert.equal(tone, 1);
    assert.ok(prok.length, 'Matins Prokeimenon section is empty');
    assert.match(prok[0].text, /Now will I arise, saith the Lord/,
      'expected the Octoechos Tone-1 Sunday prokeimenon');
    assert.equal(prok[0].tone, 1);
    assert.match(gospel.label, /John 21[:\s]\s*1\b/, 'expected eothinon 10, John 21:1-14');

    // The saint's propers from august-09.json must NOT appear.
    assert.doesNotMatch(prok.map(p => p.text).join('\n'), /Their sound hath gone forth/,
      "Apostle Matthias's prokeimenon displaced the Sunday one");
    assert.doesNotMatch(gospel.label, /John 21[:\s]\s*15/,
      "the saint's Gospel (#67) displaced the eothinon");
  });

  it('INV-2: every affected Sunday gets the week-tone prokeimenon and its eothinon Gospel', async () => {
    for (const date of AFFECTED_SUNDAYS) {
      const { tone, prok, gospel } = await matinsProbe(date);
      const eoth = cal.getEothinon(new Date(`${date}T12:00:00Z`));

      assert.ok(prok.length, `${date}: Matins Prokeimenon section is empty`);
      assert.ok(prok.some(p => p.tone === tone),
        `${date}: no prokeimenon at the week tone ${tone} (got ${prok.map(p => p.tone).join(', ')})`);

      if (eoth && EOTHINON_INCIPIT[eoth]) {
        const label = String(gospel.label).replace(/[–—]/g, '-');
        assert.ok(label.startsWith(EOTHINON_INCIPIT[eoth]),
          `${date}: Gospel "${gospel.label}" is not eothinon ${eoth} ` +
          `(expected ${EOTHINON_INCIPIT[eoth]}…)`);
      }
    }
  });

  it('INV-3: the guard keys on the real Great-Feast list, not menaion _meta.feastRank', async () => {
    // St. Nicholas (12-06), St. Luke (10-18) and the Synaxis of Michael (11-08)
    // all declare `_meta.feastRank: 'greatFeast'` in their menaion files and all
    // fall on a Sunday in 2026 — but none is among the Twelve. If the guard is
    // ever re-keyed to that field, these three regress and this fails.
    for (const date of ['2026-12-06', '2026-10-18', '2026-11-08']) {
      const { tone, prok } = await matinsProbe(date);
      assert.ok(prok.some(p => p.tone === tone),
        `${date}: a mislabelled "greatFeast" menaion file displaced the Sunday prokeimenon`);
    }
  });

  it('INV-4: the prokeimenon section is never empty on these Sundays', async () => {
    // Suppressing the saint's prokeimenon without supplying the Octoechos one
    // renders nothing at all — quieter, and worse, than a wrong tone.
    for (const date of AFFECTED_SUNDAYS) {
      const { prok } = await matinsProbe(date);
      assert.ok(prok.length >= 1 && (prok[0].text || '').trim().length > 10,
        `${date}: Matins Prokeimenon rendered empty`);
    }
  });

  it('INV-5: weekdays still sing the saint\'s own Matins propers', async () => {
    // The guard must be Sunday-only. Sts. Peter & Paul (6-29) and St. Andrew
    // (11-30) both fall on a Monday in 2026 and keep their own propers.
    for (const [date, re] of [
      ['2026-06-29', /Their sound hath gone forth/],
      ['2026-11-30', /Their sound hath gone forth/],
    ]) {
      const { prok } = await matinsProbe(date);
      assert.ok(prok.length, `${date}: weekday prokeimenon missing`);
      assert.match(prok.map(p => p.text).join('\n'), re,
        `${date}: the saint's weekday prokeimenon was suppressed — the guard is not Sunday-only`);
    }
  });

  it('INV-6: a Great Feast on a Sunday keeps its own propers', async () => {
    // Pentecost 2026 falls on a Sunday and must NOT be forced onto the
    // Octoechos resurrectional prokeimenon.
    const { prok, gospel } = await matinsProbe('2026-05-31');
    assert.ok(prok.length, 'Pentecost Matins prokeimenon missing');
    assert.match(prok.map(p => p.text).join('\n'), /Thy good Spirit shall lead me/,
      'Pentecost lost its festal Matins prokeimenon to the Sunday cycle');
    assert.match(String(gospel.label), /John 20[:\s]\s*19/, 'Pentecost Matins Gospel changed');
  });
});
