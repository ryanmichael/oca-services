/**
 * Feature contract: how the LLM judge resolves its OCA reference document
 *
 * The judge compares our assembled output against an OCA publication. There are
 * two, and they answer different questions:
 *
 *   order of services  (oca.org/PDF/Music/Rubrics/YYYY-MMDD-order-services.docx)
 *       the SHAPE — how many stichera and in what split, whether a Litya is
 *       served, which prokeimenon. SUNDAYS ONLY.
 *   service texts      (files.oca.org/service-texts/YYYYMMDD-texts-tt.docx)
 *       the WORDS.
 *
 * Nearly every structural defect this project has fixed came from the order, so
 * it must win wherever both are available.
 *
 * Established 2026-08-09 while wiring the weekly fetch:
 *   - the texts DOCX previously outranked the order on disk, silently
 *     downgrading the judge on any date with a cached texts file;
 *   - `files.oca.org/service-texts/` now 404s for EVERY date checked (2024,
 *     2025, 2026), so the judge's only working fetch is the rubrics URL. The
 *     nightly rescrape harness survives on its local cache, which is why this
 *     went unnoticed.
 *
 * These tests are offline by design — they must not depend on oca.org being up.
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
process.chdir(ROOT);   // findLocalReference uses repo-relative paths

const { extractText, looksLikeDocx, findLocalReference } =
  require(path.join(ROOT, 'audit', 'llm-judge.js'));

const ORDER_DOCX = 'reference/orders/2026-0809-order-services.docx';
const ORDER_TXT  = 'reference/orders/2026-0809-order-services.txt';

describe('Feature contract: judge reference resolution', () => {

  it('INV-1: DOCX extraction is paragraph-aware, not space-collapsed', () => {
    const out = extractText(ORDER_DOCX);
    const lines = out.split('\n');

    assert.ok(lines.length > 100,
      `expected real line structure, got ${lines.length} lines — the extraction ` +
      `has collapsed to one line again, which breaks every line-oriented comparison`);

    // The old `sed 's|<[^>]*>| |g'` inserted a space for every tag, so a
    // paragraph split into runs came out as "202 6" and "10 th".
    assert.doesNotMatch(out, /\b202 6\b/, 'year split across runs — tags are inserting separators');
    assert.doesNotMatch(out, /\b10 th Sunday\b/, 'ordinal split across runs');
    assert.match(out, /Order of Services for Sunday, August 9, 2026/);
  });

  it('INV-2: extraction reproduces the hand-made .txt reference', () => {
    // The committed .txt files were prepared by hand. If a fetched DOCX extracts
    // to materially different structure, freshly-fetched weeks would be lower
    // quality than the 22 hand-prepared ones — the whole point of automating is
    // that they are equivalent.
    const fromDocx = extractText(ORDER_DOCX).split('\n').length;
    const fromTxt  = fs.readFileSync(ORDER_TXT, 'utf8').split('\n').length;
    assert.ok(Math.abs(fromDocx - fromTxt) <= 3,
      `extracted ${fromDocx} lines vs ${fromTxt} committed — extraction has drifted ` +
      `from the reference files`);
  });

  it('INV-3: the structural markers the judge relies on survive extraction', () => {
    const out = extractText(ORDER_DOCX);
    assert.match(out, /^Vigil$/m,        'section headings must land on their own line');
    assert.match(out, /^\[Litya\]$/m,    'bracketed optional sections must be greppable');
    assert.match(out, /^\d+ stichera of the Resurrection, Tone \d+$/m,
      'stichera-count directives must be line-addressable — this is how the ' +
      '3+3+4 split was caught');
  });

  it('INV-4: a non-DOCX response can never be accepted as one', () => {
    // oca.org answers a missing rubric with HTML. Without both checks an error
    // page lands on disk named .docx and gets parsed as liturgical text.
    const pk   = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const html = Buffer.from('<!DOCTYPE html><html>404</html>');

    assert.equal(looksLikeDocx(pk, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), true);
    assert.equal(looksLikeDocx(html, 'text/html; charset=UTF-8'), false, 'HTML body accepted');
    assert.equal(looksLikeDocx(pk, 'text/html; charset=UTF-8'), false, 'HTML content-type accepted');
    assert.equal(looksLikeDocx(Buffer.from('PK'), null), false, 'truncated body accepted');
    assert.equal(looksLikeDocx(null, null), false);
  });

  it('INV-5: the order of services outranks the service texts on disk', () => {
    const chosen = findLocalReference('2026-08-09');
    assert.ok(chosen, 'no local reference found for a date we hold');
    assert.match(chosen, /orders\/2026-0809-order-services/,
      'the order of services must win — it carries the service SHAPE, which is ' +
      'where nearly every structural finding has come from');
  });

  it('INV-6: a date we hold nothing for resolves to null, not a stale neighbour', () => {
    assert.equal(findLocalReference('2099-01-01'), null);
  });
});
