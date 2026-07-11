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
