/**
 * Feature contract: L45 — one antiphon, one translation
 * Spec: features/antiphon-translation-family.md
 *
 * One test per INV-* invariant. If you change how a hymn's translation family
 * is resolved, or which sections L45 covers, update both the feature file and
 * these tests in the same commit.
 *
 * The rule is a pure function of `ctx.assembled`, so these tests build the ctx
 * directly rather than standing up a server. That also keeps them honest: a
 * synthetic ctx lets us assert the single-family and unknown-only cases, which
 * no real date would exercise in isolation.
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

const rule = require(path.join(ROOT, 'audit', 'rules', 'E-provenance',
                               'L45-antiphon-translation-family'));
const L3 = require(path.join(ROOT, 'audit', 'rules', 'E-provenance',
                             'L3-translation-consistency'));
const { familyOfText } =
  require(path.join(ROOT, 'server-lib', 'sources', 'translation-provenance'));
const { isPluralAddress } =
  require(path.join(ROOT, 'scripts', 'yy-to-tt'));

// Real texts, so the provenance index is genuinely exercised. These are the
// hymns a reader read aloud at Liturgy on 2026-11-01.
const HTM_RESURRECTION =
  'Believing Thee to be God, O Christ, the thief on the cross confessed Thee ' +
  'in a pure manner, crying out from the depths of his heart: Remember me in ' +
  'Thy Kingdom, O Lord!';
const HTM_RESURRECTION_2 =
  'By Thy death hast Thou destroyed the power of death, O Christ, and Thou ' +
  'didst raise up with Thyself the dead of ages past, who now hymn Thee as ' +
  'our true God and Savior.';
const STSERGIUS_UNMERCENARIES =
  'As is meet, let us all hymn the well-springs of healings, the streams of ' +
  'divine gifts, the resplendent receptacles of the immaterial Light.';
// The one L3 reported as YY drift. Correct TT plural address for two saints.
const STSERGIUS_PLURAL =
  'As benefactors curing sufferings and pangs of body and soul, O most ' +
  'honored ones, ye heal those who have recourse to you now with fervor.';

function hymn(text, label) {
  return { section: 'Third Antiphon', type: 'hymn', text, label: label || '' };
}
function ctxWith(blocks) {
  return { service: 'liturgy', date: '2026-11-01', assembled: { blocks } };
}

describe('Feature contract: L45 antiphon translation family', () => {

  it('INV-1: two known families in one section produce one finding naming both', () => {
    const found = rule.check(ctxWith([
      hymn(HTM_RESURRECTION,       'Resurrection'),
      hymn(HTM_RESURRECTION_2,     'Resurrection'),
      hymn(STSERGIUS_UNMERCENARIES, 'For the Unmercenaries'),
    ]));
    assert.equal(found.length, 1, 'exactly one finding per mixed section');
    assert.match(found[0].message, /Third Antiphon is sung in 2 translations/);
    assert.match(found[0].message, /Holy Transfiguration Monastery x2/);
    assert.match(found[0].message, /St\. Sergius x1/);
    // The hint must name the minority, so the finding is actionable.
    assert.match(found[0].hint, /minority is St\. Sergius/);
  });

  it('INV-2: a single family produces no finding', () => {
    const found = rule.check(ctxWith([
      hymn(HTM_RESURRECTION,   'Resurrection'),
      hymn(HTM_RESURRECTION_2, 'Resurrection'),
    ]));
    assert.deepEqual(found, [], 'one family is not a mix');
  });

  it('INV-3: `unknown` never counts as a family', () => {
    // Unattributed is not "different". Counting it would turn every gap in the
    // index into a finding and bury the real ones.
    assert.equal(familyOfText('A hymn text that is in no book we hold.'),
                 'unknown', 'precondition: this text is unattributed');
    const found = rule.check(ctxWith([
      hymn(HTM_RESURRECTION,   'Resurrection'),
      hymn(HTM_RESURRECTION_2, 'Resurrection'),
      hymn('A hymn text that is in no book we hold.', 'Mystery'),
      hymn('Another text attributable to nothing at all.', 'Mystery'),
    ]));
    assert.deepEqual(found, [], 'one known family + unknowns is not a mix');
  });

  it('INV-4: the rule reads resolved provenance, not block metadata', () => {
    // Same two texts, same labels, same `source` values — only the resolved
    // families differ between INV-1 and INV-2. If the rule were keying on
    // anything but provenance, INV-1 and INV-2 could not disagree.
    //
    // Falsified by hand on 2026-11-02 against the live assembler: folding the
    // two families into one silenced the 11-01 finding. The first attempt
    // folded the wrong resolution path (the FAMILY map rather than
    // familyOfProse) and the rule kept firing — which is how the bad test
    // design got caught instead of shipping as a green.
    const blocks = [hymn(HTM_RESURRECTION), hymn(STSERGIUS_UNMERCENARIES)];
    for (const b of blocks) b.source = 'octoechos';   // identical metadata
    assert.equal(rule.check(ctxWith(blocks)).length, 1,
      'differing families must still be caught when metadata is identical');
  });

  it('INV-5: the Sunday Beatitudes resolve as htm, not oca', () => {
    // The bare-`source` regression. `octoechos.json` tags its Beatitudes nodes
    // with `source`, not `_source`; while the index read only `_source` these
    // eight nodes inherited the file's no-tag default and reported as OCA, so
    // the whole resurrectional half of every Sunday's Third Antiphon was
    // laundered into the OCA family and no mix could ever be detected.
    assert.equal(familyOfText(HTM_RESURRECTION), 'htm');
    assert.equal(familyOfText(HTM_RESURRECTION_2), 'htm');
    // And the Menaion canon odes are indexed at all — they were not before.
    assert.equal(familyOfText(STSERGIUS_UNMERCENARIES), 'stsergius');
    // Including a text whose glued genre prefix is stripped at render time.
    assert.equal(familyOfText(
      'He Who before was invisible hath appeared in our form, O Birthgiver ' +
      'of God, when He united His Godhead to the flesh in thy most pure ' +
      'womb, O Bride of God.'), 'stsergius');
  });

  it('INV-6: L3 accepts TT plural address but still flags genuine YY', () => {
    assert.ok(isPluralAddress(STSERGIUS_PLURAL),
      '"O most honored ones … ye heal" is plural address');

    // L3 needs >=3 TT-marked blocks before it will report anything, so give it
    // a realistic section.
    const ttBlocks = [
      hymn(HTM_RESURRECTION), hymn(HTM_RESURRECTION_2),
      hymn(STSERGIUS_UNMERCENARIES), hymn(STSERGIUS_PLURAL, 'For the Unmercenaries'),
    ];
    const clean = L3.check(ctxWith(ttBlocks));
    assert.deepEqual(clean, [],
      'the 11-01 Unmercenaries troparion is correct TT and must not be flagged');

    // The detector must still work. A genuinely YY block in the same section.
    const withYY = [...ttBlocks, hymn(
      'You have shown Your mercy to all who call upon Your name, and Your ' +
      'kingdom endures for ever.', 'Modern')];
    const dirty = L3.check(ctxWith(withYY));
    assert.equal(dirty.length, 1, 'genuine YY drift is still reported');
    assert.match(dirty[0].message, /YY pronoun/);
  });
});
