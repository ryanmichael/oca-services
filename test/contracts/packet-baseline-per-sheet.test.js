'use strict';

/**
 * Feature contract: the packet baseline measures SHEETS, not just services.
 *
 * On 2026-11-07 a parishioner heard the six Menaion stichera to Michael and
 * Gabriel sung in a register the parish does not use. choir-packet-diff had
 * already scored that very sheet —
 *
 *     great-vespers-2026-11-07 — pieces 15 · located 10 · verbatim 2
 *
 * — and reported nothing, because the baseline held only per-service
 * aggregates. A new sheet landed in `better` ("new in this run") no matter how
 * badly it scored, and the next --capture-baseline folded 13% verbatim into
 * the accepted 38%.
 *
 * These invariants assert POSITIONS, not labels: each one is written so that
 * removing the rule it guards makes it fail. The falsification is recorded
 * next to each.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { buildBaseline, compare } =
  require(path.join(ROOT, 'scripts', 'lib', 'packet-baseline.js'));
const { positionMarker } =
  require(path.join(ROOT, 'scripts', 'lib', 'packet-pieces.js'));

/** The real 2026-11-07 numbers, and the great-vespers aggregate that hid them. */
const GV_ACCEPTED = { sheets: 13, pieces: 133, own: 133, crossService: 0,
                      located: 113, verbatim: 50, inOrder: 113 };
const SHEET_1107  = { name: 'great-vespers-2026-11-07', service: 'great-vespers',
                      pieces: 15, own: 15, crossService: 0,
                      located: 10, inOrder: 10, verbatim: 2 };

/** A baseline with per-sheet tracking armed but WITHOUT the 11-07 sheet. */
function baselineWithout1107() {
  return {
    'great-vespers': GV_ACCEPTED,
    _all: GV_ACCEPTED,
    _sheets: {
      'great-vespers-2026-10-30': { service: 'great-vespers', pieces: 10, own: 10,
                                    crossService: 0, located: 9, inOrder: 9, verbatim: 5 },
    },
  };
}

describe('Feature contract: packet baseline, per sheet', () => {

  it('INV-1: a NEW sheet matched worse than its service rate FAILS', () => {
    // The 11-07 scenario replayed exactly. 2/15 verbatim = 13%; the accepted
    // great-vespers rate is 50/133 = 38%. Under the old aggregate-only rule
    // this sheet produced zero `worse` entries.
    // FALSIFIED BY: deleting the new-sheet branch in packet-baseline.js —
    // `worse` empties and this assertion fails.
    const summary = { 'great-vespers': GV_ACCEPTED, _all: GV_ACCEPTED };
    const { worse } = compare(summary, [SHEET_1107], baselineWithout1107());

    assert.ok(worse.length > 0, 'a new sheet at 13% verbatim must be a regression');
    const v = worse.find(w => /great-vespers-2026-11-07/.test(w) && /verbatim/.test(w));
    assert.ok(v, `expected a verbatim finding for the new sheet, got: ${JSON.stringify(worse)}`);
    assert.match(v, /NEW sheet/);
    assert.match(v, /13%/, 'the finding must carry the sheet\'s own rate');
    assert.match(v, /38%/, 'and the accepted rate it is judged against');
  });

  it('INV-2: a NEW sheet at or above its service rate does NOT fail', () => {
    // The rule must not simply fail on every new packet; that is noise, not a
    // signal, and it would be abandoned within a week.
    const summary = { 'great-vespers': GV_ACCEPTED, _all: GV_ACCEPTED };
    const good = { ...SHEET_1107, name: 'great-vespers-2026-11-14',
                   located: 15, inOrder: 15, verbatim: 14 };
    const { worse } = compare(summary, [good], baselineWithout1107());
    assert.deepEqual(worse, [], 'a well-matched new sheet must pass');
  });

  it('INV-3: one sheet collapsing is caught even when the aggregate holds still', () => {
    // The masking case. Sheet A loses 4 verbatim, sheet B gains 4: the service
    // rate is byte-identical, and the old check saw nothing at all.
    // FALSIFIED BY: deleting the `if (b)` per-sheet branch — `worse` empties.
    const base = {
      'great-vespers': GV_ACCEPTED, _all: GV_ACCEPTED,
      _sheets: {
        A: { service: 'great-vespers', pieces: 10, own: 10, crossService: 0,
             located: 10, inOrder: 10, verbatim: 8 },
        B: { service: 'great-vespers', pieces: 10, own: 10, crossService: 0,
             located: 10, inOrder: 10, verbatim: 2 },
      },
    };
    const rows = [
      { name: 'A', service: 'great-vespers', pieces: 10, own: 10, crossService: 0,
        located: 10, inOrder: 10, verbatim: 4 },   // -4
      { name: 'B', service: 'great-vespers', pieces: 10, own: 10, crossService: 0,
        located: 10, inOrder: 10, verbatim: 6 },   // +4
    ];
    // The aggregate is unchanged by construction, so it contributes nothing.
    const summary = { 'great-vespers': GV_ACCEPTED, _all: GV_ACCEPTED };
    const { worse, better } = compare(summary, rows, base);

    assert.ok(worse.some(w => /^A: verbatim 80% -> 40%/.test(w)),
      `sheet A's collapse must be reported, got: ${JSON.stringify(worse)}`);
    assert.ok(better.some(b => /^B: verbatim/.test(b)), 'sheet B\'s gain is reported too');
  });

  it('INV-4: a baseline with no _sheets cannot fail on sheets, and says so', () => {
    // Every sheet reads as new against a pre-per-sheet baseline. Failing all of
    // them would make the upgrade impossible to land; the note is the upgrade
    // path. The service-level rules keep working untouched.
    const legacy = { 'great-vespers': GV_ACCEPTED, _all: GV_ACCEPTED };
    const summary = { 'great-vespers': GV_ACCEPTED, _all: GV_ACCEPTED };
    const { worse, notes } = compare(summary, [SHEET_1107], legacy);
    assert.deepEqual(worse, [], 'a legacy baseline must not fail on sheets');
    assert.ok(notes.some(n => /recapture/.test(n)), 'and must say how to arm the rule');
  });

  it('INV-5: a service-level regression still fails, as it always did', () => {
    // Guards against the refactor quietly dropping the behaviour it replaced.
    const base = { 'great-vespers': GV_ACCEPTED, _all: GV_ACCEPTED, _sheets: {} };
    const dropped = { ...GV_ACCEPTED, located: 90 };
    const { worse } = compare({ 'great-vespers': dropped }, [], base);
    assert.ok(worse.some(w => /great-vespers: located 85% -> 68%/.test(w)),
      `expected the aggregate rule to still fire, got: ${JSON.stringify(worse)}`);
  });

  it('INV-6: buildBaseline records every sheet, and compare reads it back clean', () => {
    // A baseline that cannot round-trip its own capture is a baseline that
    // fails on the next run for no reason.
    const summary = { 'great-vespers': GV_ACCEPTED, _all: GV_ACCEPTED };
    const rows = [{ ...SHEET_1107, misses: [{ marker: '?' }], positions: [1, 2] }];
    const captured = buildBaseline(summary, rows);

    assert.ok(captured._sheets['great-vespers-2026-11-07'], 'the sheet is recorded');
    assert.equal(captured._sheets['great-vespers-2026-11-07'].verbatim, 2);
    assert.ok(!('misses' in captured._sheets['great-vespers-2026-11-07']),
      'per-run detail must not be frozen into the baseline');

    const { worse } = compare(summary, rows, captured);
    assert.deepEqual(worse, [], 'a freshly captured baseline must verify clean');
  });

  it('INV-7: a parenthesised position marks a hymn boundary', () => {
    // The engraved-music sheets print "(6)." where the text sheets print "6".
    // Missing that form merged all six Archangel stichera of
    // great-vespers-2026-11-07 into one piece, and a six-hymn piece can never
    // score verbatim against a single rendered hymn — which is why that sheet
    // read 2/15 verbatim whatever we printed.
    // FALSIFIED BY: narrowing POSITION_MARKER back to /^(\d{1,2})$/ — every
    // parenthesised assertion below fails.
    assert.equal(positionMarker('6'), '6', 'the bare form still marks');
    for (const [line, want] of [['(6).', '6'], ['(5).-', '5'], ['(4)', '4'],
                                ['(1)', '1'], ['(10)', '10'], ['(2) ', '2']])
      assert.equal(positionMarker(line), want, `"${line}" must mark position ${want}`);
  });

  it('INV-8: a bare number with trailing punctuation is NOT a marker', () => {
    // Measured, not assumed. Allowing "1." / "2," to mark a boundary split
    // page footers and numbered lines inside the Liturgy sheets and cost five
    // sheets a located hymn. The parentheses are what make the marker a marker.
    // FALSIFIED BY: making the parens optional — these assertions fail.
    for (const line of ['1.', '2,', '3 -', '12.'])
      assert.equal(positionMarker(line), null, `"${line}" must not mark a boundary`);
  });

  it('INV-9: ordinary hymn text never marks a boundary', () => {
    for (const line of ['Michael the Archangel, you have been revealed',
                        'V. (6) If Thou, O Lord, shouldst mark iniquities',
                        'Tone 4', '(Repeat: "O Michael, the Chief Captain...")', ''])
      assert.equal(positionMarker(line), null, `"${line}" must not mark a boundary`);
  });
});
