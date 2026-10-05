'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyYouYour, resolvePronoun } = require('../server-lib/assemble/pronouns');

test('applyYouYour: "didst <verb>" → simple past (not "did <verb>")', () => {
  assert.equal(applyYouYour('Thou didst descend to hell'),      'You descended to hell');
  assert.equal(applyYouYour('Who didst come in these last days'),'Who came in these last days');
  assert.equal(applyYouYour('Thou didst overthrow the gates'),   'You overthrew the gates');
  assert.equal(applyYouYour('for Thou didst know all things'),   'for You knew all things');
  assert.equal(applyYouYour('Thou didst appoint repentance'),    'You appointed repentance');
});

test('applyYouYour: negation keeps the base verb ("did not forsake")', () => {
  assert.equal(applyYouYour('Thou didst not forsake us'), 'You did not forsake us');
});

test('applyYouYour: existing thee/thy/hast rules still hold', () => {
  assert.equal(applyYouYour('By Thy Cross Thou hast saved us'), 'By Your Cross You have saved us');
  assert.equal(applyYouYour('I cry to Thee'),                   'I cry to You');
});

test('resolvePronoun: explicit ?pronoun wins > parish defaultPronoun > "tt"', () => {
  // explicit query param always wins
  assert.equal(resolvePronoun({ pronoun: 'yy' }, { defaultPronoun: 'tt' }), 'yy');
  assert.equal(resolvePronoun({ pronoun: 'tt' }, { defaultPronoun: 'yy' }), 'tt');
  // no query param → parish/overlay default
  assert.equal(resolvePronoun({}, { defaultPronoun: 'yy' }), 'yy');
  assert.equal(resolvePronoun({}, { defaultPronoun: 'tt' }), 'tt');
  // no query, no parish default → traditional
  assert.equal(resolvePronoun({}, {}),   'tt');
  assert.equal(resolvePronoun({}, null), 'tt');
  // an invalid query value falls through to the parish default
  assert.equal(resolvePronoun({ pronoun: 'bogus' }, { defaultPronoun: 'yy' }), 'yy');
});

// ── A bare adverb between "didst" and its verb (2026-10-05) ───────────────────
//
// The rule carried an intervening -ly adverb through and conjugated the verb
// after it ("didst voluntarily endure" → "voluntarily endured"), but an adverb
// WITHOUT -ly was not recognised, so it landed in the verb slot and went through
// verbToPast. 13 stored rows served "You evered instruct" and "you alsoed pray"
// to every parish on the modern register — ungrammatical text in a rendered
// service, not a lint nit.
//
// The fix also had to guard the -ly re-read branch: that branch exists for
// "didst multiply the loaves", where the verb itself ends in -ly and gets
// mis-captured as the adverb. Applying it to a BARE adverb turned
// "didst alone in" into "aloned in", so it now fires only on an -ly token.
test('applyYouYour: a bare adverb after didst keeps its place and the VERB takes the past', () => {
  assert.equal(applyYouYour('Thou didst ever instruct thyself'), 'You ever instructed yourself');
  assert.equal(applyYouYour('for whom thou didst also pray'),    'for whom you also prayed');
  assert.equal(applyYouYour('Thou didst never cease'),           'You never ceased');
});

test('applyYouYour: "didst <adverb>" with no following verb falls through to "did"', () => {
  // "the deeds thou didst alone in the Lord" — `alone` modifies didst itself and
  // no verb follows, so the preposition must not be conjugated ("alone ined").
  assert.equal(applyYouYour('the deeds thou didst alone in the Lord'),
               'the deeds you did alone in the Lord');
});

test('applyYouYour: the -ly cases the bare-adverb fix must not regress', () => {
  assert.equal(applyYouYour('Thou didst voluntarily endure'), 'You voluntarily endured');
  // the verb is the -ly token here, not an adverb
  assert.equal(applyYouYour('Thou didst multiply the loaves'), 'You multiplied the loaves');
  assert.equal(applyYouYour('Thou didst not forsake us'),      'You did not forsake us');
});

test('applyYouYour: an -ly VERB before a reflexive is not read as an adverb', () => {
  // Same shape as "didst multiply the loaves" — the verb ends in -ly and gets
  // mis-captured as the adverb — but with a reflexive pronoun in the slot that
  // branch keys on. Before the fix: "You ally thyselfed mystically".
  assert.equal(applyYouYour('Thou didst ally thyself mystically'), 'You allied yourself mystically');
  assert.equal(applyYouYour('Thou didst humble thyself'),          'You humbled yourself');
});

test('applyYouYour: no adverb artifact survives anywhere in the stored corpus', () => {
  // The falsifiable form of the bug: sweep every stored hymn through the
  // transform and assert the output contains no conjugated adverb. Whole-word
  // match only — an earlier \w* version flagged "strengthened" via "thened".
  const { DatabaseSync } = require('node:sqlite');
  const path = require('node:path');
  const db = new DatabaseSync(path.join(__dirname, '..', 'storage', 'oca.db'), { readOnly: true });
  const ART = /\b(?:evered|alsoed|aloned|nevered|thused|soed|indeeded|nowed|thened|likewised|alreadyed|firsted|onlyed|agained)\b/;
  const found = [];
  let checked = 0;
  for (const tbl of ['stichera', 'troparia']) {
    for (const r of db.prepare(`SELECT id, text FROM ${tbl}`).all()) {
      if (!r.text) continue;
      checked++;
      const y = applyYouYour(r.text);
      if (ART.test(y)) found.push(`${tbl} ${r.id}: ${y.match(ART)[0]}`);
    }
  }
  assert.ok(checked > 10000, `only ${checked} rows swept — the check went vacuous`);
  assert.deepEqual(found, [], `adverb artifacts in rendered modern text:\n  ${found.join('\n  ')}`);
});
