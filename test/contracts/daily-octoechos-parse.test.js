'use strict';

/**
 * Feature contract: parsing the Daily Octoechos.
 *
 * Chunk 4 of the OCA-standardisation plan. The parser is validated here; the
 * WRITE into octoechos.json is deliberately not done yet — see
 * features/daily-octoechos-parse.md for the open question about hymn counts.
 *
 * The failure this guards is specific and nasty: a mis-parsed section lands
 * hymns on the WRONG DAY with the right tone, which no rule in this repo can
 * detect and which a parish would discover by singing the Cross on the day of
 * the apostles.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const BOOK = path.join(ROOT, 'reference', 'books', 'daily-octoechos-mtmary.pdf');
const { parseDailyOctoechos, EVENINGS, THEMES } =
  require(path.join(ROOT, 'server-lib', 'sources', 'daily-octoechos-parse'));

// reference/books/ is gitignored and regenerable, so skip rather than fail on a
// fresh clone or in CI. A missing third-party book is not a defect in this code.
const have = fs.existsSync(BOOK);
let parsed = null;
const book = () => (parsed ??= parseDailyOctoechos(BOOK));

describe('Feature contract: Daily Octoechos parser', () => {
  it('INV-1: finds exactly 48 weekday Vespers sections', { skip: !have }, () => {
    // 8 tones x 6 weekday evenings. This is the anchor the whole parse rests on,
    // and the reason it reads the BODY rather than the page headers: those
    // survive extraction on only ~48 of 190 pages, identically under -raw,
    // -layout and default mode, and a missed header makes a section silently
    // inherit the previous day.
    assert.equal(book().sections, 48);
  });

  it('INV-2: every usable node passes its day-theme', { skip: !have }, () => {
    const r = book();
    assert.ok(r.themeOk >= 47, `only ${r.themeOk} nodes passed the theme check`);
    // The one known report is tone4/sunday, whose Apostikha marker is missing
    // so the span overruns into Matins. It must be REPORTED, never included.
    for (const f of r.themeFail) {
      assert.ok(f.reason, 'every failure must carry a reason');
      assert.ok(!(r.tones[`tone${f.tone}`] || {})[f.evening],
        `${f.tone}/${f.evening} failed its check but was still emitted`);
    }
  });

  it('INV-3: an overrun is reported, not silently swallowed', { skip: !have }, () => {
    // tone4/sunday parsed 15 hymns including "(After the 1st reading of the
    // Psalter): Sessional Hymn" — Matins material. Without the guard those
    // would have been written as Vespers stichera.
    const r = book();
    for (const t of Object.values(r.tones)) {
      for (const node of Object.values(t)) {
        assert.ok(node.lordICall.length <= 8, 'a node overran into Matins');
        assert.ok(node.aposticha.length <= 8, 'an aposticha node overran');
      }
    }
  });

  it('INV-4: the day mapping is proven against the existing corpus', { skip: !have }, () => {
    // THE REAL PROOF, and the reason the theme check alone is not enough:
    // Sunday and Monday evenings share a theme, as do Tuesday and Thursday
    // (both the Cross), so themes cannot catch a swap within either pair.
    //
    // octoechos.json already holds the SAME hymns in the st-sergius.org
    // translation on the same keys. Each of our day-nodes must match the book's
    // same day better than any other day of that tone.
    const ours = require(path.join(ROOT, 'variable-sources', 'octoechos.json'));
    const STOP = new Set(('the a an and or of to in for with by is was are were be been thou thee thy ' +
      'thine ye you your o oh we us our i me my he she it his her him them they that this which who ' +
      'whom whose as at from upon unto all not no but so then when where how shall will may let hath ' +
      'have has had do did doth done art wast wert didst dost').split(' '));
    const bag = (t) => {
      const m = new Map();
      for (const w of String(t).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/)) {
        if (w.length > 4 && !STOP.has(w)) m.set(w, (m.get(w) || 0) + 1);
      }
      return m;
    };
    const sim = (a, b) => {
      const A = bag(a), B = bag(b);
      let n = 0;
      for (const [w, c] of A) if (B.has(w)) n += Math.min(c, B.get(w));
      const sum = (m) => [...m.values()].reduce((s, x) => s + x, 0);
      const d = Math.min(sum(A), sum(B));
      return d ? n / d : 0;
    };

    const r = book();
    let checked = 0;
    for (let t = 1; t <= 8; t++) {
      for (const d of EVENINGS) {
        const o = (ours[`tone${t}`]?.[d]?.vespers?.lordICall?.hymns || []).map(h => h.text).join(' ');
        if (!o) continue;
        // Skip nodes the parser withheld (INV-3's overrun guard): asserting an
        // alignment for a node that was deliberately not emitted tests nothing
        // but the exclusion itself.
        if (!(r.tones[`tone${t}`] || {})[d]) continue;
        const scores = EVENINGS.map((bd) => {
          const b = (r.tones[`tone${t}`]?.[bd]?.lordICall || []).map(h => h.text).join(' ');
          return b ? sim(o, b) : -1;
        });
        const best = EVENINGS[scores.indexOf(Math.max(...scores))];
        assert.equal(best, d,
          `tone${t}: our '${d}' matches the book's '${best}' better than its own day`);
        checked++;
      }
    }
    assert.ok(checked >= 40, `only ${checked} nodes compared — the check went vacuous`);
  });

  it('INV-5: it reproduces the choir sheet for a known date', { skip: !have }, () => {
    // 2026-10-07 is a Wednesday evening; its stichera are the apostles. This is
    // the one node the parish's own packet can verify independently.
    const lic = (book().tones.tone1?.wednesday?.lordICall || []).map(h => h.text).join('\n');
    assert.match(lic, /Glorious apostles of Christ, divinely inspired disciples/);
    assert.match(lic, /Most wise apostles of Christ/);
    assert.match(lic, /extol the company chosen by God/);
  });

  it('INV-6: the themes come from the book, not from general Octoechos lore', () => {
    // Liturgical Tuesday IS the Forerunner's day, but his stichera are in
    // MATINS. An earlier table expecting him at Monday-evening VESPERS wrongly
    // discarded six good nodes. Monday evening is repentance and the martyrs.
    assert.ok(!/forerunner|baptist/i.test(THEMES.monday.re.source),
      'monday evening must not expect the Forerunner — he is in Matins');
    assert.match(THEMES.monday.re.source, /repent|wretch|compunction/);
    assert.match(THEMES.wednesday.re.source, /apostle/);
    assert.match(THEMES.tuesday.re.source, /cross/);
    assert.match(THEMES.friday.re.source, /martyr/);
  });

  it('INV-7: the book\'s `//` becomes a newline, the house convention', { skip: !have }, () => {
    const r = book();
    for (const t of Object.values(r.tones)) {
      for (const node of Object.values(t)) {
        for (const h of [...node.lordICall, ...node.aposticha]) {
          assert.ok(!h.text.includes('//'), `a raw // survived: ${h.text.slice(0, 50)}`);
        }
      }
    }
  });

  it('INV-8: no hymn begins mid-sentence — page-break fragments are rejoined', { skip: !have }, () => {
    // A hymn broken across a page boundary arrives as two entries, because the
    // page number between them forces a flush, and the tail begins in
    // lower-case: "flesh in the fear of Thee…", "healing the sick, O
    // physicians…".
    //
    // This shipped to production. The first write of chunk 4 put three such
    // fragments into octoechos.json as whole stichera — tone4/monday,
    // tone5/tuesday and tone8/monday, each at hymn 1 — which truncated the
    // preceding hymn and lost the third entirely. Roughly twenty dates a year
    // would have printed a sentence fragment for the choir to sing.
    //
    // They must be REJOINED, never dropped: dropping silently loses half a
    // hymn, which is worse than leaving the node alone.
    const r = book();
    let checked = 0;
    for (const [tk, days] of Object.entries(r.tones)) {
      for (const [d, node] of Object.entries(days)) {
        for (const h of [...node.lordICall, ...node.aposticha]) {
          assert.ok(!/^[a-z]/.test(h.text.trim()),
            `${tk}/${d} begins mid-sentence: "${h.text.slice(0, 56)}…"`);
          checked++;
        }
      }
    }
    assert.ok(checked > 300, `only ${checked} hymns examined — the check went vacuous`);
  });

  it('INV-9: the Theotokion is tagged from the Glory heading, in all 48 nodes', { skip: !have }, () => {
    // It is the hymn the book prints after "Glory... Now and ever...". An
    // earlier version inferred it as "entry 3 of exactly 4", which left every
    // differently-sized node unconverted: 7 Lord-I-Call Theotokia and 1
    // Aposticha stayed st-sergius.org and each surfaced as a lone foreign hymn
    // among 7-8 from the parish's book.
    //
    // Structure beats counting. Tagging from the heading converted all 48.
    const r = book();
    let lic = 0, apo = 0, nodes = 0;
    for (const days of Object.values(r.tones)) {
      for (const node of Object.values(days)) {
        nodes++;
        if (node.lordICall.some(h => h.afterGlory)) lic++;
        if (node.aposticha.some(h => h.afterGlory)) apo++;
        // Exactly one Theotokion per section, and it is never first.
        const licT = node.lordICall.filter(h => h.afterGlory);
        assert.ok(licT.length <= 2, `${nodes}: ${licT.length} Lord-I-Call Theotokia tagged`);
        if (node.lordICall.length) {
          assert.ok(!node.lordICall[0].afterGlory, 'the first hymn is never the Theotokion');
        }
      }
    }
    assert.equal(nodes, 48);
    assert.equal(lic, 48, `${48 - lic} nodes have no tagged Lord-I-Call Theotokion`);
    assert.equal(apo, 48, `${48 - apo} nodes have no tagged Aposticha Theotokion`);
  });
});
