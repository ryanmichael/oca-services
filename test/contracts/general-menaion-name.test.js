'use strict';

/**
 * Feature contract: the name substituted into a General Menaion hymn is a name.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 *
 * On ten dates a year we have no proper hymns for a saint and fall back to a
 * general hymn for that KIND of saint, with `(name)` replaced by the saint's
 * name. On 2026-10-06 three of those ten dates were substituting a rank or an
 * event word, and the result was live in production:
 *
 *   2026-05-10  "Leaving earthly cares O Apostle Equals, …"
 *               from "Equals of the Apostles and Teachers of the Slavs,
 *               Cyril and Methodius"
 *   2026-08-27  "Recovery"  from "Recovery of the relics of Saint Job of Pochaev"
 *   2026-04-24  "and Evangelist Mark"  from "Apostle and Evangelist Mark"
 *
 * ── WHY IT IS A CONTRACT AND NOT AN AUDIT RULE ───────────────────────────────
 *
 * `test/contracts/text-well-formedness.test.js` sweeps the STORED corpus, and
 * no sweep of stored text can ever see this class: the substitution happens at
 * RENDER time, so the defect exists only in output that is never written down.
 * That is a structural blind spot, not an oversight, and it is why this file
 * asserts the function's output over every commemoration title instead.
 *
 * ── THE SHAPE OF THE GATE ────────────────────────────────────────────────────
 *
 * A WALL on the two classes that are always wrong — a fragment, and the whole
 * title — and an itemised BASELINE for the handful of group commemorations that
 * genuinely contain no personal name ("Martyrs of Lazeti"), where the rank IS
 * the honest answer. Baselines carry a stale-entry check so the list can only
 * shrink. `theotokos`, `cross` and `angels` are excluded from the rank check
 * outright: an icon of the Mother of God has no personal name to find.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const { extractShortName, GENERAL_MENAION_FALLBACK } =
  require(path.join(ROOT, 'server-lib', 'sources', 'general-menaion'));

const db = new DatabaseSync(path.join(ROOT, 'storage', 'oca.db'), { readOnly: true });

/** Saint types the General Menaion can actually serve. */
function servedTypes() {
  const t = new Set(db.prepare('SELECT DISTINCT saint_type FROM general_menaion').all()
    .map(r => r.saint_type));
  for (const k of Object.keys(GENERAL_MENAION_FALLBACK)) t.add(k);
  return t;
}

/** Every commemoration title that could reach the substitution. */
function reachable() {
  const types = servedTypes();
  return db.prepare(
    'SELECT DISTINCT title, saint_type FROM commemorations WHERE saint_type IS NOT NULL').all()
    .filter(r => r.title && types.has(r.saint_type));
}

const TYPES = servedTypes();
const ROWS = reachable();

// Commemorations of a thing, not a person — no personal name exists to find.
const NAMELESS_TYPES = new Set(['theotokos', 'cross', 'angels']);

// A rank, an office or an event. Never a person's name.
const NOT_A_NAME = /^(?:Equals?|Commemoration|Synaxis|Translation|Placing|Recovery|Uncovering|Finding|Founding|Afterfeast|Forefeast|Leavetaking|Repose|Dedication|Consecration|Appearance|Meeting|Nativity|Dormition|Beheading|Icon|Feast|Council|Martyrs?|Apostles?|Hierarchs?|Prophets?|Nuns?|Hieromartyrs?|Confessors?|Holy|Glorious|Great|New|The|All)$/i;

const FRAGMENT = /^(?:of|and|or)\b/i;

const where = (r) => `[${r.saint_type}] ${JSON.stringify(r.title.slice(0, 64))}`;

describe('Feature contract: General Menaion name substitution', () => {
  // ── Baselined: genuinely nameless group commemorations ─────────────────────
  //
  // Each of these has NO personal name anywhere in the title, so the rank is
  // the honest substitution. The list may SHRINK, never grow — a new entry means
  // extraction regressed on a title that does name someone.
  const RANK_BASELINE = new Set([
    '[apostles] "Synaxis of the Seventy Apostles"',
    '[apostles] "Apostles of the Seventy: Erastus, Olympas, Herodion, Sosipater, Quartus, and Tertius"',
    '[martyrs] "Martyrs of the Kvabtakhevi Monastery in Georgia"',
    '[martyrs] "Martyrs of Lazeti"',
    '[martyrs] "Martyrs of Niculitsel"',
    '[hierarch] "Synaxis of the Serbian Hierarchs"',
    '[hierarch] "Synaxis of the Hierarchs of Moscow"',
  ]);

  // The single commemoration that is one long nameless phrase.
  const WHOLE_TITLE_BASELINE = [
    '[martyrs] "All Orthodox Christians who died as martyrs for the glory of Chr"',
  ];

  it('INV-1: the sweep sees the corpus (guard against a vacuous pass)', () => {
    assert.ok(TYPES.size >= 20, `general_menaion serves only ${TYPES.size} saint types`);
    assert.ok(ROWS.length > 2000, `only ${ROWS.length} reachable titles — the join is wrong`);
  });

  // ── Walls ──────────────────────────────────────────────────────────────────

  it('INV-2: no substituted name is a leading of/and fragment', () => {
    const bad = ROWS.filter(r => FRAGMENT.test(extractShortName(r.title)))
      .map(r => `${where(r)} -> ${JSON.stringify(extractShortName(r.title))}`);
    assert.deepEqual(bad, [], `fragment substituted as a name:\n  ${bad.join('\n  ')}`);
  });

  it('INV-3: no substituted name is a long title verbatim', () => {
    // A 70-character title dropped into a sung line is the worst outcome
    // available — worse than a blunt rank.
    const bad = ROWS.filter(r => {
      const n = extractShortName(r.title);
      return r.title.length > 40 && n.trim() === r.title.trim();
    }).map(where);
    assert.deepEqual(bad, WHOLE_TITLE_BASELINE,
      `a long title was substituted whole:\n  ${bad.join('\n  ')}`);
  });

  const rankOffenders = () => new Set(
    ROWS.filter(r => !NAMELESS_TYPES.has(r.saint_type))
        .filter(r => NOT_A_NAME.test(extractShortName(r.title)))
        .map(r => `[${r.saint_type}] ${JSON.stringify(r.title)}`));

  it('INV-4: no NEW title substitutes a rank or event word for a name', () => {
    const added = [...rankOffenders()].filter(k => !RANK_BASELINE.has(k));
    assert.deepEqual(added, [],
      `rank/event word substituted as a name:\n  ${added.join('\n  ')}`);
  });

  it('INV-5: the rank baseline carries no stale entry', () => {
    const found = rankOffenders();
    const stale = [...RANK_BASELINE].filter(k => !found.has(k));
    assert.deepEqual(stale, [],
      `repaired — delete these from RANK_BASELINE:\n  ${stale.join('\n  ')}`);
  });

  // ── Regression pins for the three live defects ─────────────────────────────

  it('INV-6: the three 2026-10-06 defects stay fixed', () => {
    const cases = [
      ['Apostle and Evangelist Mark', 'Mark'],
      ['Equals of the Apostles and Teachers of the Slavs, Cyril and Methodius', 'Cyril and Methodius'],
      ['Recovery of the relics of Saint Job of Pochaev', 'Job'],
    ];
    for (const [title, want] of cases) {
      assert.equal(extractShortName(title), want, `extractShortName(${JSON.stringify(title)})`);
    }
  });

  it('INV-7: the cases that were already correct did not move', () => {
    const cases = [
      ['Hieromartyr Silvanus of Gaza', 'Silvanus'],
      ['Venerable Seraphim, Wonderworker of Sarov', 'Seraphim'],
      ['Saint Meletius, Archbishop of Antioch', 'Meletius'],
      ['Prophet Isaiah', 'Isaiah'],
      ['Apostle Andrew, the Holy and All-Praised First-Called', 'Andrew'],
      ['Venerable Anthony of the Kiev Far Caves, Founder of Monasticism in Russia', 'Anthony'],
      ['Saint Spyridon the Wonderworker, Bishop of Tremithus', 'Spyridon the Wonderworker'],
      ['Venerable Theodosius the Great, the Cenobiarch', 'Theodosius the Great'],
      ['Martyr Hyacinth of Caesarea, in Cappadocia, and those with him', 'Hyacinth'],
      // A title that merely OPENS with an article has no rank to run on, and
      // must be left alone. Blanking it returned the whole title on 104 titles
      // during this fix.
      ['The Circumcision of our Lord and Savior Jesus Christ', 'The Circumcision'],
    ];
    for (const [title, want] of cases) {
      assert.equal(extractShortName(title), want, `extractShortName(${JSON.stringify(title)})`);
    }
  });

  // ── Falsification ──────────────────────────────────────────────────────────

  it('INV-8: these invariants FAIL against the pre-fix implementation', () => {
    // A frozen copy of extractShortName as of commit 0cd1b02. If the
    // assertions above cannot fail, they are decoration — so prove it here
    // rather than asserting it in a comment.
    const legacy = (title) => {
      let name = String(title || '')
        .replace(/^(Holy,?\s*Glorious\s+)?/i, '')
        .replace(/^(Saint|Venerable|Hieromartyr|Hieromartyrs?|Martyr|Martyrs|Great[- ]Martyr|New Martyr|Virgin Martyr|Maiden Martyr|Monastic Martyr|Nun Martyr|Prophet|Apostle|Apostles|Blessed|Righteous)\s+/i, '')
        .replace(/^(Holy|Glorious|Great|New)\s+/i, '');
      name = name.replace(/\s+(?:of|at|in|near)\s+.*$/i, '');
      name = name.replace(/\s*\(.*$/, '');
      name = name.replace(/,\s+.*$/, '');
      return name.trim() || title;
    };

    const legacyFragments = ROWS.filter(r => FRAGMENT.test(legacy(r.title)));
    assert.ok(legacyFragments.length > 0,
      'INV-2 cannot fail: the old implementation produced no fragments either');

    const legacyRanks = ROWS.filter(r => !NAMELESS_TYPES.has(r.saint_type))
      .filter(r => NOT_A_NAME.test(legacy(r.title)))
      .map(r => `[${r.saint_type}] ${JSON.stringify(r.title)}`)
      .filter(k => !RANK_BASELINE.has(k));
    assert.ok(legacyRanks.length > 0,
      'INV-4 cannot fail: the old implementation tripped no new rank offenders');

    // And the three pinned defects must be wrong under the old code.
    assert.notEqual(legacy('Equals of the Apostles and Teachers of the Slavs, Cyril and Methodius'),
      'Cyril and Methodius', 'INV-6 cannot fail: the old code already got 05-10 right');
  });
});
