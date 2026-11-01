/**
 * Feature contract: the booklet's three density tiers are real everywhere.
 * Spec: features/booklet-density-tiers.md
 *
 * A ServiceBlock may carry `density`, a presentational step for text the pew
 * follows but does not say:
 *
 *   compact — long text spoken TO the reader: readings, psalmody, the
 *             deacon's litany petitions, the priest's exclamations.
 *   cue     — a short invariant acclamation: "Lord, have mercy.", "Amen.",
 *             "Grant this, O Lord.", the Kathisma's "Alleluia" antiphon.
 *   fine    — text read privately (the silent pre-Communion prayer).
 *
 * WHY THIS FILE EXISTS. On 2026-10-31 a probe of the rendered booklet found
 * that `compact` was INERT there: `#bk-root .prayer` carries an id, so it
 * outranks the plain `.prayer.compact` class, and main.css had a `#bk-root`
 * override for `.fine` but none for `.compact`. Every compact block — the
 * whole anaphora, both Liturgy readings — printed at full body size, in
 * italic, because only the `font-style` of the tier survived. The style was
 * half-applied, which is worse than absent: italic at body size is harder to
 * read and saves nothing.
 *
 * Nothing caught it. `silent-communion-prayers.test.js` INV-10 asserts the
 * ladder, but only in the PANEL scope — the one surface where it was fine.
 * So this file asserts the ladder in EVERY surface that styles a block, and
 * asserts it as a ladder (cue/fine smaller than compact, compact smaller than
 * body) rather than as the presence of a rule.
 *
 * It also asserts the tiers reach real blocks by POSITION — the responses
 * inside a litany, the deacon's petitions — not by looking for an id or a
 * label, so re-authoring a litany cannot quietly drop the tier.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3123; // distinct: 3122 was the last taken
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

const TYLER = '&parish=st-john-damascus-tyler&translation=st-john-damascus-tyler';

async function blocks(url) {
  const r = await get(url);
  assert.equal(r.status, 200, `${url} status`);
  return r.json.blocks || [];
}

const TIERS = ['compact', 'cue', 'fine'];

// The surfaces that turn a block into styled markup. Each needs a rule for
// each tier; a missing one is the bug this file exists for.
//
// `renderer.js` holds TWO stylesheets — the standard page, then a separate
// booklet sheet built as a string. They use the same selectors, so the file is
// split at the booklet sheet's first rule rather than searched as one blob.
function surfaces() {
  const mainCss = fs.readFileSync(path.join(ROOT, 'public/styles/main.css'), 'utf8');
  const rjs = fs.readFileSync(path.join(ROOT, 'renderer.js'), 'utf8');
  const cut = rjs.indexOf("'.bk-page {");
  assert.ok(cut > 0, 'renderer.js must still carry a booklet stylesheet');
  return [
    // The two scopes where an explicit body size exists to compare against —
    // and where the id-specificity trap lives.
    { name: 'panel',           css: mainCss,             unit: 'px',
      sel: t => `.prayer.${t}`,                   base: '.prayer' },
    { name: 'booklet',         css: mainCss,             unit: 'pt',
      sel: t => `#bk-root .prayer.${t}`,          base: '#bk-root .prayer' },
    // The standard page sets no font-size on `p.prayer` — it inherits from
    // `body`. No base to compare, so the ladder and "a size is set at all"
    // carry the weight here.
    { name: 'static page',     css: rjs.slice(0, cut),   unit: 'pt',
      sel: t => `p.prayer.${t}, p.response.${t}`, base: null },
    { name: 'static booklet',  css: rjs.slice(cut),      unit: 'pt',
      sel: t => `p.prayer.${t}, p.response.${t}`, base: 'p.prayer, p.hymn, p.response' },
  ];
}

function fontSizeOf(css, selector, unit) {
  // Match the rule whose selector list is exactly `selector`. A leading quote
  // is allowed because the booklet sheet's rules live inside JS strings.
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`(?:^|[\\n'"])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css);
  assert.ok(rule, `${selector} must be styled`);
  const m = new RegExp(`font-size:\\s*([\\d.]+)${unit}`).exec(rule[1]);
  assert.ok(m, `${selector} must set a font-size in ${unit}`);
  return parseFloat(m[1]);
}

describe('density tiers', () => {
  it('INV-1 — every surface sizes every tier, and steps it DOWN from body', () => {
    for (const s of surfaces()) {
      for (const t of TIERS) {
        const size = fontSizeOf(s.css, s.sel(t), s.unit);
        if (!s.base) continue;
        const body = fontSizeOf(s.css, s.base, s.unit);
        assert.ok(size < body,
          `${s.name}: \`${t}\` is ${size}${s.unit} against a ${body}${s.unit} body — ` +
          `the tier is inert there (this is the 2026-10-31 \`#bk-root .prayer.compact\` bug)`);
      }
    }
  });

  // Strictly ordered, so the ladder reads in one direction: the smaller the
  // type, the less the pew is expected to do with it. A tie would make two
  // tiers indistinguishable on the page, which is the same failure as an
  // inert tier — the reader cannot tell them apart either way.
  it('INV-2 — the ladder orders compact > cue > fine in every surface', () => {
    for (const s of surfaces()) {
      const [compact, cue, fine] = TIERS.map(t => fontSizeOf(s.css, s.sel(t), s.unit));
      assert.ok(cue < compact, `${s.name}: cue (${cue}) must be smaller than compact (${compact})`);
      assert.ok(fine < cue, `${s.name}: fine (${fine}) must be smaller than cue (${cue})`);
    }
  });

  it('INV-3 — both renderers stamp the class for every tier', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/scripts/renderer.js'), 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const { renderService } = require(path.join(ROOT, 'renderer.js'));

    for (const t of TIERS) {
      const b = { id: 'x', section: 'S', type: 'prayer', speaker: 'reader', text: 'probe', density: t };
      assert.match(sandbox.window.renderBlocks([b], {}), new RegExp(`class="prayer ${t}"`),
        `panel renderer must stamp the \`${t}\` class`);
      assert.match(renderService([b], { title: 't' }), new RegExp(`class="prayer ${t}"`),
        `print renderer must stamp the \`${t}\` class`);
    }
  });

  it('INV-4 — inside a litany, every short invariant answer carries `cue`', async () => {
    const bl = await blocks(`/api/service?date=2026-10-31&pronoun=tt${TYLER}`);
    const litany = bl.filter(b => /litany/i.test(b.section || ''));
    assert.ok(litany.length > 20, `expected a Great Vespers with litanies, saw ${litany.length} blocks`);

    // By POSITION: anything in a litany whose text is one of the fixed
    // acclamations, whatever its id or label.
    const ACCLAMATION = /^(lord,? have mercy\.?\s*)+$|^amen\.$|^grant this, o lord\.$|^to thee, o lord\.$|^and to thy spirit\.$/i;
    const missed = litany.filter(b => ACCLAMATION.test((b.text || '').trim()) && b.density !== 'cue');
    assert.deepEqual(missed.map(b => b.id), [],
      'these litany acclamations print at body size instead of `cue`');
  });

  it('INV-5 — inside a litany, the deacon and priest carry `compact`', async () => {
    const bl = await blocks(`/api/service?date=2026-10-31&pronoun=tt${TYLER}`);
    const missed = bl.filter(b =>
      /litany/i.test(b.section || '') &&
      b.type === 'prayer' &&
      (b.speaker === 'deacon' || b.speaker === 'priest') &&
      b.density !== 'compact');
    assert.deepEqual(missed.map(b => b.id), [],
      'these litany clergy texts print at body size instead of `compact`');
  });

  it('INV-6 — the psalmody read to the congregation carries `compact`', async () => {
    const bl = await blocks(`/api/service?date=2026-10-31&pronoun=tt${TYLER}`);
    for (const id of ['ps103-intro', 'ps103-body', 'ps140', 'ps141']) {
      const b = bl.find(x => x.id === id);
      assert.ok(b, `${id} must be in a Great Vespers`);
      assert.equal(b.density, 'compact', `${id} must be compact`);
    }
  });

  // Confirmed by the parish 2026-10-31, and worth pinning precisely BECAUSE
  // it was never really decided before. Both readings were tagged `compact`
  // by earlier work, but `#bk-root .prayer.compact` did not exist, so they
  // printed at full body size in italic for the whole life of that tag. The
  // CSS fix is what enacted the decision — the first time anyone saw a Gospel
  // at 11.5pt was the day this shipped. Asked explicitly, and kept: the
  // readings are read ALOUD to the congregation, not said by it.
  //
  // Pinned so a future reader does not see a 2047-character Gospel in small
  // type, assume it is the same half-applied bug, and "fix" it back.
  it('INV-8 — the Epistle and Gospel stay at the `compact` step', async () => {
    const bl = await blocks(`/api/liturgy?date=2026-11-01&pronoun=tt${TYLER}`);
    for (const id of ['ep-text', 'gos-text']) {
      const b = bl.find(x => x.id === id);
      assert.ok(b, `${id} must be in a Sunday Liturgy`);
      assert.equal(b.density, 'compact',
        `${id} is a reading the congregation follows but does not say; the `
        + 'parish confirmed the step down on 2026-10-31');
    }
    // The announcements around them stay at body size — they are the cues
    // that tell a reader where the reading starts and ends.
    for (const id of ['ep-reader', 'gos-rubric', 'gos-end']) {
      const b = bl.find(x => x.id === id);
      if (b) assert.equal(b.density, undefined, `${id} must stay at body size`);
    }
  });

  // The invariant that would have caught the half-tagged Liturgy. It sweeps
  // SERVICES, not one date, and keys off POSITION (a block's section, type
  // and speaker) rather than any id or label — so a thirteenth litany
  // emitter in a file nobody thought to grep is covered the day it lands.
  //
  // What it is guarding against: on 2026-10-31 density was set at each call
  // site, litanies turned out to be emitted from twelve files, and the two
  // obvious ones (both named `litanies.js`) were tagged while the Liturgy's
  // Great Litany, both Little Litanies, the Supplication litany and the
  // Litany of Thanksgiving were not — 75 of 98 blocks untagged in a single
  // booklet, with no test anywhere the poorer for it.
  it('INV-9 — no litany block in ANY service is left at body size', async () => {
    const CASES = [
      ['Great Vespers',     '/api/service?date=2026-10-31'],
      ['Daily Vespers',     '/api/service?date=2026-11-03'],
      ['Matins',            '/api/matins?date=2026-11-01'],
      ['Divine Liturgy',    '/api/liturgy?date=2026-11-01'],
      ['Presanctified',     '/api/presanctified?date=2026-03-04'],
      ['Lamentations',      '/api/lamentations?date=2026-04-10'],
      ['Bridegroom Matins', '/api/bridegroom-matins?date=2026-04-07'],
    ];
    const LITANY = /litany|litanies/i;
    const missed = [];
    let total = 0;

    for (const [name, url] of CASES) {
      const bl = await blocks(`${url}&pronoun=tt${TYLER}`);
      const inLitany = bl.filter(b => LITANY.test(b.section || ''));
      total += inLitany.length;
      inLitany.forEach((b) => {
        if (b.density) return;
        // A doxology inside a Little Litany ("Glory to the Father…") is sung
        // by everyone and stays at body size on purpose.
        if (b.type === 'doxology') return;
        missed.push(`${name}: ${b.id} (${b.type}/${b.speaker}) in "${b.section}"`);
      });
    }

    assert.ok(total > 400,
      `expected a real sweep of litany blocks, saw ${total}`);
    assert.deepEqual(missed, [],
      'these litany blocks print at body size while their neighbours are '
      + 'stepped down, which reads as arbitrary rather than as a system');
  });

  it('INV-7 — what the pew sings or says is NEVER stepped down', async () => {
    const bl = await blocks(`/api/service?date=2026-10-31&pronoun=tt${TYLER}`);
    // Hymns carry no density at all — a sticheron is the reason the booklet
    // exists and must never be shrunk to win a page.
    const shrunkHymn = bl.filter(b => b.type === 'hymn' && b.density);
    assert.deepEqual(shrunkHymn.map(b => b.id), [], 'a hymn must never carry a density step');

    // Nor may the texts the congregation says with the reader.
    for (const id of ['vouchsafe', 'our-father-2', 'nunc-dimittis']) {
      const b = bl.find(x => x.id === id);
      if (b) assert.equal(b.density, undefined, `${id} must stay at body size`);
    }
  });
});
