/**
 * Rescrape harness — parser + normalizer integration tests.
 *
 * Uses Node's built-in test runner (node:test) — zero dependencies.
 * Anchored to the one DOCX we keep in-repo: reference/2026-0524-texts-tt.docx
 * (7th Sunday of Pascha — Holy Fathers / Afterfeast of the Ascension).
 *
 * Run: node --test test/rescrape-parse.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { parseDocx, docxToLines } = require('../server-lib/parsers/docx-tuples');
const {
  normalizeText, insertPunctuationSpaces, hasGluedPunctuation, stripLeadingTone,
} = require('../server-lib/parsers/normalize');

const REF = path.join(__dirname, '..', 'reference', '2026-0524-texts-tt.docx');
const haveRef = fs.existsSync(REF);

describe('normalizer', () => {
  it('strips a leading "Tone N" chant marker but keeps in-prose "Tone N"', () => {
    assert.equal(stripLeadingTone('Tone 6 Possessing victory'), 'Possessing victory');
    assert.equal(stripLeadingTone('we sing in Tone 6 today'), 'we sing in Tone 6 today');
  });

  it('inserts a space after punctuation glued to the next word', () => {
    assert.equal(insertPunctuationSpaces('denial.Therefore'), 'denial. Therefore');
    assert.equal(insertPunctuationSpaces('Me?"In this'), 'Me?" In this');
  });

  it('leaves scripture refs untouched (digit after colon/period)', () => {
    assert.equal(insertPunctuationSpaces('1 Peter 1:3-9'), '1 Peter 1:3-9');
    assert.equal(insertPunctuationSpaces('Psalm 3.14'), 'Psalm 3.14');
  });

  it('hasGluedPunctuation flags glued text and not clean text', () => {
    assert.equal(hasGluedPunctuation('denial.Therefore'), true);
    assert.equal(hasGluedPunctuation('denial. Therefore'), false);
    assert.equal(hasGluedPunctuation('1 Peter 1:3-9'), false);
  });

  it('normalizeText makes formatting-only variants converge', () => {
    const a = normalizeText('“Glory to Thee!”//Hear me,O Lord!');
    const b = normalizeText('"Glory to Thee!" Hear me, O Lord!');
    assert.equal(a, b);
  });

  it('normalizeText reuses the yy→tt transformer under the pronoun flag', () => {
    assert.equal(normalizeText('We praise your holy name', { pronoun: true }),
      'we praise thy holy name');
  });
});

describe('docxToLines', () => {
  it('rejoins chant syllable-split runs into whole words', { skip: !haveRef }, () => {
    const lines = docxToLines(REF);
    // "cal" + "l upon Thee!" must reassemble to "call upon Thee!", never "cal l".
    const joined = lines.map(l => l.text).join('\n');
    assert.match(joined, /call upon Thee/);
    assert.doesNotMatch(joined, /\bcal l\b/);
  });

  it('marks the day-header and section anchors as bold', { skip: !haveRef }, () => {
    const lines = docxToLines(REF);
    const anchor = lines.find(l => /Lord I Call/i.test(l.text));
    assert.ok(anchor, 'found the "Lord I Call" anchor line');
    assert.equal(anchor.bold, true);
    assert.equal(anchor.centered, true);
  });

  it('emits blank markers between stichera groups', { skip: !haveRef }, () => {
    const lines = docxToLines(REF);
    assert.ok(lines.some(l => l.blank), 'has at least one blank boundary marker');
  });
});

describe('parseDocx', () => {
  it('produces well-formed tuples with the expected sections', { skip: !haveRef }, () => {
    const tuples = parseDocx(REF, { sourceDate: '2026-05-24' });
    assert.ok(tuples.length > 15, `expected a healthy tuple count, got ${tuples.length}`);
    for (const t of tuples) {
      assert.equal(t.sourceDate, '2026-05-24');
      assert.ok(['lordICall', 'aposticha', 'litya', 'troparia', 'kontakia'].includes(t.section));
      assert.equal(typeof t.text, 'string');
      assert.ok(t.text.length > 0);
      assert.equal(typeof t.order, 'number');
    }
  });

  it('groups multi-line stichera into one tuple (not one tuple per line)', { skip: !haveRef }, () => {
    const tuples = parseDocx(REF, { sourceDate: '2026-05-24' });
    // The Dogmatikon "Who will not bless thee, O most holy Virgin?…" spans
    // several lines and must arrive as a single multi-sentence tuple.
    const dogmatikon = tuples.find(t => /Who will not bless thee/i.test(t.text));
    assert.ok(dogmatikon, 'found the Dogmatikon tuple');
    assert.ok(dogmatikon.text.length > 120,
      `Dogmatikon should be a full multi-line hymn, got ${dogmatikon.text.length} chars`);
  });

  it('assigns Glory=0 and Now=-1 order slots', { skip: !haveRef }, () => {
    const tuples = parseDocx(REF, { sourceDate: '2026-05-24' });
    assert.ok(tuples.some(t => t.order === 0), 'has a Glory (order 0) tuple');
    assert.ok(tuples.some(t => t.order === -1), 'has a Now (order -1) tuple');
  });

  it('does not mistake a scripture-reading citation for a commemoration', { skip: !haveRef }, () => {
    const tuples = parseDocx(REF, { sourceDate: '2026-05-24' });
    assert.ok(!tuples.some(t => /\d+\s*:\s*\d+/.test(t.commemorationTitle || '')),
      'no tuple is attributed to a "Book chapter:verse" citation');
  });
});
