'use strict';

// Regression tests for the 2026-09-23 fixes found verifying 9-23 Vespers.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getPsalter, psalmBody } = require('../oca-psalter');
const { transform } = require('../scripts/yy-to-tt');

// psalmBody() strips the superscription. The scrape stored some superscriptions
// glued to verse 1 ("A Song of Degrees. Out of the depths have I cried…"), so
// stripping the title deleted a real verse — Kathisma 18 read Pss 122/129/131
// without their first lines, and Ps 22 lost "The Lord tends me as a shepherd".
test('psalmBody keeps verse 1 when the superscription was scraped onto it', () => {
  const p = getPsalter();
  const first = n => psalmBody(p[String(n)])[0];
  assert.equal(first(2),   'Wherefore did the heathen rage, and the nations imagine vain things?');
  assert.equal(first(22),  'The Lord tends me as a shepherd, and I shall want nothing.');
  assert.equal(first(122), 'Unto thee who dwellest in heaven have I lifted up mine eyes.');
  assert.equal(first(129), 'Out of the depths have I cried to thee, O Lord.');
  assert.equal(first(131), 'Lord, remember David, and all his meekness:');
  assert.equal(first(134), 'Praise ye the name of the Lord; praise the Lord, ye his servants,');
});

test('psalmBody removes exactly the superscription lines, nothing more', () => {
  for (const [n, ps] of Object.entries(getPsalter())) {
    if (!ps || !ps.title) continue;
    const dropped = ps.verses.slice(0, ps.verses.length - psalmBody(ps).length);
    assert.equal(dropped.join(' '), ps.title, `Psalm ${n}`);
  }
});

test('yy→tt: object after a preposition is thee, even sentence-initially', () => {
  assert.equal(transform('In you the image was preserved'), 'In thee the image was preserved');
  assert.equal(transform('Christ our God Who was born of you'), 'Christ our God Who was born of thee');
  assert.equal(transform('for in you do we hope'), 'for in thee do we hope');
  assert.equal(transform('we are slaughtered for love of You, O Savior'), 'we are slaughtered for love of Thee, O Savior');
});

test('yy→tt: before/after + finite verb is a conjunction, not a preposition', () => {
  assert.equal(transform('chose you before you were formed'), 'chose thee before thou wast formed');
});

test('yy→tt: object-taking verbs, and plural "all you" / "all of you"', () => {
  assert.equal(transform('and it glorifies you, O Mother of God'), 'and it glorifies thee, O Mother of God');
  assert.equal(transform('in faith we always call you blessed.'), 'in faith we always call thee blessed.');
  assert.equal(transform('Come all you people'), 'Come all ye people');
  assert.equal(transform('Come, all of you, let us sing'), 'Come, all of you, let us sing');
  assert.equal(transform('and all of you were found worthy'), 'and all of you were found worthy');
  // -ies nouns are not verbs
  assert.equal(transform('within its boundaries you shone'), 'within its boundaries thou didst shine');
});
