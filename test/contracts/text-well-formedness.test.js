'use strict';

/**
 * Feature contract: every stored hymn is well-formed English in BOTH registers.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 *
 * On 2026-10-05 a session fixed, in one sitting:
 *
 *   - 61 truncated verb stems ("thou didst conceiv", "didst denounc" x9,
 *     "didst acquir" x8), 44 of them in `troparia`
 *   - 18 rows whose MODERN rendering read "You evered instruct yourself" and
 *     "for whom you alsoed pray"
 *   - 6 objective-case errors ("the Russian Church reveres thou as a priest")
 *   - 3 rows opening with a podoben melody name instead of a verse, one of them
 *     register-mangled into "Thou Have Given A Sign"
 *
 * Every one of those is a defect in a TRANSFORM, not in the data — and every one
 * would have come back, because the fix for the previous round had been applied
 * to the rows rather than to the code. `scripts/yy-to-tt.js` carries a
 * hand-maintained E_STEM_BASES list that had been grown one verb at a time since
 * at least 2026-06-19 ("'provide' -> 'didst provid'" is in its comments), and 61
 * sites accumulated behind it. The adverb bug had been serving ungrammatical text
 * to every modern-register parish for as long as it existed.
 *
 * None of it was caught by `drift:check`, `audit:quick`, 367 contract tests or
 * 232 unit tests, because nothing asserted that rendered text is well formed.
 * This file is that assertion. It is deliberately a corpus sweep rather than an
 * audit rule: these are properties of the stored text, independent of any date or
 * service, so a per-date rule would report the same row on dozens of dates.
 *
 * ── HOW TO ADD A CLASS ───────────────────────────────────────────────────────
 *
 * Assert ZERO wherever the class is clean, so the gate is a wall and not a
 * watermark. Use a baseline only for a class with a real backlog, and write the
 * ids down so the list can only shrink. Every pattern here must be whole-word:
 * an earlier version of the adverb check used \w* and flagged "strengthened" via
 * "thened".
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const { applyYouYour } = require(path.join(ROOT, 'server-lib', 'assemble', 'pronouns'));

const db = new DatabaseSync(path.join(ROOT, 'storage', 'oca.db'), { readOnly: true });

/** Every sung text we hold, from both tables. */
function corpus() {
  const out = [];
  for (const tbl of ['stichera', 'troparia']) {
    for (const r of db.prepare(`SELECT id, text FROM ${tbl}`).all()) {
      if (r.text) out.push({ tbl, id: r.id, text: r.text });
    }
  }
  return out;
}

const ROWS = corpus();
const where = (r) => `${r.tbl} ${r.id}`;

// A stem yy-to-tt produced by removing "-ed" from a verb whose root keeps its
// final 'e' (or doubles a consonant). Each of these is a non-word.
const TRUNCATED_STEMS = ['persuad', 'denounc', 'acquir', 'increas', 'prov', 'caus',
  'cleans', 'rebuk', 'consum', 'escap', 'convers', 'conceiv', 'advanc', 'plac',
  'judg', 'sacrific', 'rever', 'repos', 'pledg', 'exchang', 'nurtur', 'announc',
  'mov', 'cal', 'fil', 'kil', 'sham', 'wip', 'dar', 'tam', 'chok'];

// An adverb that applyYouYour ran through verbToPast. Whole words only.
const CONJUGATED_ADVERBS = ['evered', 'alsoed', 'aloned', 'nevered', 'thused',
  'soed', 'indeeded', 'nowed', 'thened', 'likewised', 'alreadyed', 'firsted',
  'onlyed', 'agained', 'stillled', 'trulyed'];

describe('Feature contract: stored text is well-formed in both registers', () => {
  it('the sweep sees the whole corpus', () => {
    // Guards every assertion below: a vacuous sweep passes everything.
    assert.ok(ROWS.length > 10000, `only ${ROWS.length} rows loaded`);
  });

  it('INV-1: no truncated verb stem after an auxiliary', () => {
    // "In the midst of the unbearable fire thou didst cal upon God" shipped to
    // production, and was on a list of 10 rows a 2026-09-20 commit recorded as
    // already corrected — id 40718 had been missed.
    const re = new RegExp(
      `\\b(?:didst|dost|doth|to|shalt|wilt|canst|mayest|couldst|wouldst|shouldst)\\s+(?:${TRUNCATED_STEMS.join('|')})\\b`,
      'i');
    const bad = ROWS.filter((r) => re.test(r.text))
      .map((r) => `${where(r)}: ${r.text.match(re)[0]}`);
    assert.deepEqual(bad, [], `truncated verb stems:\n  ${bad.join('\n  ')}`);
  });

  it('INV-2: no conjugated adverb in the modern rendering', () => {
    // The bug fired only in the yy direction, so the stored tt looked fine and
    // nothing that read the stored text could see it.
    const re = new RegExp(`\\b(?:${CONJUGATED_ADVERBS.join('|')})\\b`);
    const bad = [];
    for (const r of ROWS) {
      const y = applyYouYour(r.text);
      if (re.test(y)) bad.push(`${where(r)}: ${y.match(re)[0]}`);
    }
    assert.deepEqual(bad, [], `adverbs conjugated by applyYouYour:\n  ${bad.join('\n  ')}`);
  });

  it('INV-3: no reflexive pronoun carrying a past-tense suffix', () => {
    // "Thou didst ally thyself" rendered "You ally thyselfed": the verb ends in
    // -ly, so it was mis-read as an adverb and the suffix landed on the pronoun.
    //
    // Matches any suffix glued after "self", not just "-ed": the first version
    // of this pattern was /\w*selfed\b/ and missed "thyselfeded", which is what
    // the transform actually produced on already-mangled input. "yourselves" is
    // excluded as the legitimate plural.
    const re = /\b(?:my|thy|your|him|her|it|our|them)self(?!\b|ves\b|'s\b|’s\b)[a-z]+\b/;
    const bad = [];
    for (const r of ROWS) {
      const y = applyYouYour(r.text);
      if (re.test(y)) bad.push(`${where(r)}: ${y.match(re)[0]}`);
    }
    assert.deepEqual(bad, [], `reflexive artifacts:\n  ${bad.join('\n  ')}`);
  });

  it('INV-4: no objective-case "thou" where "thee" is required', () => {
    // "the Russian Church reveres thou as a priest". The discriminator is what
    // FOLLOWS: a subject "thou" is followed by a verb ("thou didst", "thou
    // prayest"), an object by punctuation or a preposition.
    //
    // "for thou" is excluded on purpose — it is overwhelmingly the conjunction
    // "because" ("for thou art good"), and including it produced 59 false
    // positives against 6 real ones.
    const PREP = 'to|unto|with|in|on|of|before|by|through|from|against|upon|at|among|' +
                 'amongst|beside|above|beneath|within|without|beyond|about|around|' +
                 'behind|between|over|under|toward|towards|concerning';
    const AFTER = '[,;:.!?]|as\\b|in\\b|with\\b|to\\b|for\\b|from\\b|by\\b|of\\b|on\\b|' +
                  'at\\b|the\\b|a\\b|an\\b|and\\b|O\\b|who\\b|that\\b|which\\b';
    const re = new RegExp(`\\b(?:(?:${PREP})|\\w+(?:ns|ds|ts|es|eth))\\s+[Tt]hou\\s*(?=${AFTER})`);
    const bad = ROWS.filter((r) => re.test(r.text))
      .map((r) => `${where(r)}: …${r.text.match(re)[0]}…`);
    assert.deepEqual(bad, [], `objective-case "thou":\n  ${bad.join('\n  ')}`);
  });

  // ── Baselined: a real backlog, so the gate ratchets rather than walls ───────
  //
  // A hymn whose text starts lower-case is either a page-break fragment (the
  // 2026-10-05 Daily Octoechos write shipped three of those) or, more often
  // here, a rubric glued to the front of the verse: "of the feast, in the same
  // tone, He Who is borne upon the cherubim". drift:check reports "Rubric bleed
  // in sung text: clean" on every one of these, so its detector is narrower than
  // this one-line signal.
  //
  // Repairing them needs the source each row came from, not a regex, so they are
  // listed instead of asserted away. The list may SHRINK, never grow.
  const MID_SENTENCE_BASELINE = new Set([
    'stichera 8388', 'stichera 8393', 'stichera 8416', 'stichera 8454',
    'stichera 8543', 'stichera 8630', 'stichera 8893', 'stichera 9030',
    'stichera 9122', 'stichera 9486',
  ]);

  it('INV-5: no NEW hymn begins mid-sentence', () => {
    const found = ROWS.filter((r) => /^[a-z]/.test(r.text.trim())).map(where);
    const added = found.filter((k) => !MID_SENTENCE_BASELINE.has(k));
    assert.deepEqual(added, [],
      `new mid-sentence hymns — a rubric bleed or a page-break fragment:\n  ${added.join('\n  ')}`);
  });

  it('INV-6: the mid-sentence baseline carries no stale entry', () => {
    // The other half of a ratchet, and the half that is usually left out: once a
    // row is repaired its id must leave the list, or the list quietly becomes a
    // licence for the bug to come back on that row.
    const found = new Set(ROWS.filter((r) => /^[a-z]/.test(r.text.trim())).map(where));
    const stale = [...MID_SENTENCE_BASELINE].filter((k) => !found.has(k));
    assert.deepEqual(stale, [],
      `repaired — delete these from MID_SENTENCE_BASELINE:\n  ${stale.join('\n  ')}`);
  });
});
