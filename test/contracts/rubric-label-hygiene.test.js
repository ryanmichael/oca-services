/**
 * Feature contract: a structural rubric is set like the rest of the corpus.
 *
 * `rubric` blocks with no speaker are the booklet's structural labels —
 * "Ode 1 — First Canon", "Psalm 134 (135)", "Katavasia", "Synaxarion",
 * "Prayer of Thanksgiving:". They are all title or sentence case.
 *
 * The kathisma headings were not. Measured 2026-10-31 over 9 dates x 3
 * services: of 107 distinct rubric texts, the only ALL-CAPS ones were the 10
 * kathisma headings, and they carried THREE spellings of one label — a
 * hardcoded Roman numeral ("KATHISMA I") on the Blessed-is-the-Man path,
 * `label.toUpperCase()` ("KATHISMA SEVEN") on the read path, and an Arabic
 * numeral on the missing-data path. Nothing caught it because no rule had
 * ever looked at a rubric's *text*.
 *
 * INV-2 asserts the heading against the Psalter entry for the kathisma
 * actually being read, not against a literal string, so re-numbering a
 * service's kathismata cannot silently desync the heading from the psalms
 * printed under it.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3124; // distinct: 3123 was the last taken
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    }).on('error', reject);
  });
}
async function waitForServer(maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try { const r = await get('/api/days?from=2026-10-11&to=2026-10-11'); if (r.status === 200) return; } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('server did not start');
}
before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await waitForServer();
});
after(() => { if (serverProcess) serverProcess.kill(); });

const TYLER = '&pronoun=tt&translation=st-john-damascus-tyler';
// Dates chosen to reach every kathisma path: ordinary Vespers + Matins
// (Blessed is the Man and read kathismata), a Lenten day, and a Great Feast.
const DATES = ['2026-01-06', '2026-03-07', '2026-04-03', '2026-06-17',
               '2026-08-15', '2026-10-31', '2026-12-25'];
const SERVICES = ['/api/service', '/api/liturgy', '/api/matins'];

async function sweep() {
  const all = [];
  for (const d of DATES) {
    for (const s of SERVICES) {
      const r = await get(`${s}?date=${d}${TYLER}`);
      if (r.status !== 200 || !r.json || !r.json.blocks) continue;
      r.json.blocks.forEach(b => all.push({ ...b, _date: d, _svc: s }));
    }
  }
  assert.ok(all.length > 1000, `expected a real sweep, got ${all.length} blocks`);
  return all;
}

// All-caps = three or more letters, none of them lowercase. Digits, Roman
// numerals and punctuation are ignored, so "Ode 1" and "Psalm 134 (135)" pass.
function isShouted(text) {
  const letters = String(text || '').replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

describe('rubric label hygiene', () => {
  it('INV-1 — no structural rubric is set in ALL CAPS', async () => {
    const blocks = await sweep();
    const rubrics = blocks.filter(b => b.type === 'rubric');
    assert.ok(rubrics.length > 30, `expected rubrics to inspect, saw ${rubrics.length}`);

    const shouted = rubrics.filter(b => isShouted(b.text));
    const seen = [...new Set(shouted.map(b => `${b.text} (${b._date} ${b._svc})`))];
    assert.deepEqual(seen, [],
      'these rubrics shout, while every other structural label in the corpus '
      + 'is title or sentence case');
  });

  it('INV-2 — the kathisma heading names the kathisma actually being read', async () => {
    const { getKathismata } = require(path.join(ROOT, 'assemblers/_shared/fixed-text-loader'));
    const psalter = getKathismata();
    // Every label the Psalter itself supplies — the only legitimate wordings.
    const legitimate = new Set(Object.values(psalter)
      .map(k => k && k.label).filter(Boolean));
    assert.ok(legitimate.size >= 20, `expected 20 kathisma labels, saw ${legitimate.size}`);

    const blocks = await sweep();
    const headings = blocks.filter(b =>
      b.type === 'rubric' && /^kathisma\b/i.test(String(b.text || '').trim()));
    assert.ok(headings.length > 0, 'expected kathisma headings in the sweep');

    const wrong = headings.filter(b => !legitimate.has(b.text.trim()));
    assert.deepEqual([...new Set(wrong.map(b => `${b.text} (${b._date} ${b._svc})`))], [],
      'these headings are not any label the Psalter supplies, so a second '
      + 'spelling of the label has crept back in');
  });
});
