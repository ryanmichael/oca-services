/**
 * Feature contract: a hymn row's descriptor label is clean enough to print.
 * Spec: features/hymn-label-choice.md § "Known consequence: bad label data is now visible"
 *
 * Once a row's bare descriptor can win over the slot's title, whatever sits in
 * `stichera.label` reaches the page. On 2026-10-31 the Aposticha Glory of
 * 11-01 printed "the holy unmercinaries" to the choir — a parse artifact that
 * every structural rule passed, because no rule looked at the label's *text*.
 *
 * Two artifact families were cleaned and are guarded here:
 *
 *   1. The N6 class — a footnote digit glued onto the descriptor by the
 *      importer ("the holy martyr: 4", "the great martyr; 3"). Both separators
 *      occur. A sticheron's position already lives in the `order` column, so a
 *      trailing digit in the label is always junk.
 *   2. Misspellings with no correctly-spelled sibling to be caught against
 *      ("unmecinaries", "unmercinaries" — 13 rows, zero correct ones).
 *
 * This asserts the *shape* of the stored label, not any one date's wording, so
 * a re-import that re-introduces the class fails here rather than in church.
 *
 * Run: node --test test/contracts/hymn-label-hygiene.test.js
 *      npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { openDb } = require('../../server-lib/cache/sqlite');

// Labels that legitimately carry a digit. These are real editorial descriptors,
// not parse artifacts, and must survive any cleanup.
const LEGITIMATE_NUMERIC = [
  '(24 stichera by Simeon the Translator)',
  '(Holy 40 Martyrs)',
  '(for the 42 Martyrs) (Called from on high)',
  '(from the 2nd Canon of Pentecost, by John of',
];

describe('hymn label hygiene (stichera.label)', () => {
  const db = openDb();

  it('has a database to check', () => {
    assert.ok(db, 'storage/oca.db is missing — the rest of this suite cannot run');
  });

  it('no label ends in a glued footnote digit (the N6 class)', () => {
    if (!db) return;
    const rows = db.prepare(
      `SELECT id, label FROM stichera WHERE label GLOB '*[:;] [0-9]' ORDER BY id`
    ).all();
    assert.deepEqual(
      rows, [],
      `labels still carry a trailing footnote digit:\n` +
      rows.map(r => `  id ${r.id}: ${JSON.stringify(r.label)}`).join('\n')
    );
  });

  it('no label misspells "unmercenaries"', () => {
    if (!db) return;
    const rows = db.prepare(
      `SELECT id, label FROM stichera
        WHERE (label LIKE '%unmerc%' OR label LIKE '%unmec%')
          AND label NOT LIKE '%unmercenar%'
        ORDER BY id`
    ).all();
    assert.deepEqual(
      rows, [],
      `labels still misspell "unmercenaries":\n` +
      rows.map(r => `  id ${r.id}: ${JSON.stringify(r.label)}`).join('\n')
    );
  });

  it('keeps the labels that legitimately contain a digit', () => {
    if (!db) return;
    // Falsification guard: if this list goes empty the two rules above would
    // pass vacuously on a table that had simply lost its numeric labels.
    const found = db.prepare(
      `SELECT DISTINCT label FROM stichera WHERE label GLOB '*[0-9]*' ORDER BY label`
    ).all().map(r => r.label);
    assert.deepEqual(
      found, LEGITIMATE_NUMERIC,
      'the set of digit-bearing labels changed; a real descriptor may have been ' +
      'stripped by a cleanup, or a new artifact family has appeared'
    );
  });
});
