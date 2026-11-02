/**
 * Feature contract: per-stack cascade for `variable-sources/`
 * Spec: features/variable-source-cascade.md
 *
 * One test per INV-* invariant. If you change how a variable-source file is
 * resolved for a stack, update both the feature file and these tests in the
 * same commit.
 *
 * No server needed: the loader and the Beatitudes builder are both pure
 * functions over the filesystem.
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

const { loadVariableSourceJSON, listOverlaysFor } =
  require(path.join(ROOT, 'server-lib', 'sources', 'variable-source-overlay'));
const { buildBeatitudesTroparia } =
  require(path.join(ROOT, 'server-lib', 'sources', 'beatitudes'));
const { loadSources } = require(path.join(ROOT, 'server-lib', 'sources', 'load'));
const { resolveOctoechos } =
  require(path.join(ROOT, 'server-lib', 'sources', 'octoechos-overlay'));

// The committed test fixture. A `_`-prefixed stack is a fixture, not a
// selectable translation — same convention as fixed-texts/translations/.
const FIXTURE = '_test-diff';
const REL     = 'menaion/november-01.json';

// 2026-11-01, Sunday, Tone 5: Unmercenaries Cosmas and Damian. Its Beatitudes
// blend draws 6 Resurrection troparia from the Octoechos and 4 from Ode 3 of
// the Menaion canon — so it exercises the Menaion half of the blend, which is
// the half the cascade could not reach before.
const DATE = '2026-11-01';
const TONE = 5;

const sources = loadSources();
function srcsFor(stack) {
  return { ...sources, octoechos: resolveOctoechos(sources, stack) };
}
function troparia(stack) {
  return buildBeatitudesTroparia(true, TONE, srcsFor(stack), DATE, null, stack);
}

describe('Feature contract: variable-source cascade', () => {

  it('INV-1: with no stack, returns the base file unchanged', () => {
    const base = require(path.join(ROOT, 'variable-sources', REL));
    const got  = loadVariableSourceJSON(REL, null);
    assert.ok(got, 'base file should resolve');
    assert.deepEqual(
      got.matins.canon.ode3.troparia.map(t => t.text),
      base.matins.canon.ode3.troparia.map(t => t.text),
    );
  });

  it('INV-2: a stack with no overlay for the file is identical to no stack', () => {
    // Every real translation is in this position today, so this invariant is
    // what guarantees the cascade changed nobody's text when it shipped.
    const bare = loadVariableSourceJSON(REL, null);
    for (const stack of ['oca', 'dmitri-royster', 'htm-boston',
                         'st-john-damascus-tyler']) {
      assert.ok(!listOverlaysFor(REL).includes(stack),
        `precondition: ${stack} must not have an overlay for ${REL}`);
      assert.deepEqual(loadVariableSourceJSON(REL, stack), bare,
        `${stack} should fall through to base`);
    }
  });

  it('INV-3: a sparse overlay replaces only the keys it names', () => {
    const base = loadVariableSourceJSON(REL, null);
    const over = loadVariableSourceJSON(REL, FIXTURE);
    // The fixture names only matins.canon.ode3.troparia.
    assert.notDeepEqual(over.matins.canon.ode3.troparia,
                        base.matins.canon.ode3.troparia);
    // Siblings of the replaced key survive.
    assert.equal(over.matins.canon.ode3.irmos, base.matins.canon.ode3.irmos,
      'ode3.irmos is not named by the overlay and must survive');
    assert.deepEqual(over.troparion, base.troparion,
      'top-level troparion is not named by the overlay and must survive');
    assert.deepEqual(over.kontakion, base.kontakion,
      'top-level kontakion is not named by the overlay and must survive');
  });

  it('INV-4: the cascade reaches the Beatitudes blend', () => {
    const baseFeast = troparia(null).filter(t => t.source === 'feast');
    const overFeast = troparia(FIXTURE).filter(t => t.source === 'feast');

    assert.equal(baseFeast.length, 4, 'blend appoints 4 feast troparia');
    assert.equal(overFeast.length, 4);

    // Base comes from the Menaion file; the fixture stack does not.
    assert.ok(baseFeast.every(t => !/_TEST-DIFF OVERLAY_/.test(t.text)),
      'base must not contain fixture text');
    assert.ok(overFeast.every(t => /_TEST-DIFF OVERLAY_/.test(t.text)),
      'every feast troparion should come from the overlay');

    // The Octoechos half is untouched — it cascades separately, via srcs.
    const baseOct = troparia(null).filter(t => t.source === 'octoechos');
    const overOct = troparia(FIXTURE).filter(t => t.source === 'octoechos');
    assert.deepEqual(overOct.map(t => t.text), baseOct.map(t => t.text),
      'a Menaion overlay must not disturb the Octoechos half');
  });

  it('INV-5: overlay troparia land on the same stichoi as the base ones', () => {
    // Positional, not a count. The renderer right-aligns the troparia list
    // into twelve slots (antiphons.js: startSlot = totalSlots - list.length),
    // so a list whose length changed would keep its order and its labels while
    // every troparion moved to a different Beatitude verse — the 8-16 / 9-20
    // failure, which passed every count- and label-based check.
    //
    // Asserting the LENGTHS match is what pins the alignment here, because
    // startSlot is a pure function of the length. Pair that with INV-4's
    // identity checks and each troparion provably occupies the same slot.
    const base = troparia(null);
    const over = troparia(FIXTURE);
    // Guard against this invariant going vacuous: with the fixture missing,
    // `over` would simply be `base` and every assertion below would pass while
    // testing nothing. Falsified 2026-11-02 by moving the fixture aside.
    assert.ok(over.some(t => /_TEST-DIFF OVERLAY_/.test(t.text)),
      'precondition: the overlay must actually be in effect');
    assert.equal(over.length, base.length,
      'an overlay must not change the troparia count — that moves every ' +
      'earlier troparion onto the wrong stichos');

    // And slot-for-slot the two lists agree on which BOOK fills each slot.
    assert.deepEqual(over.map(t => t.source), base.map(t => t.source),
      'each slot must still be filled by the same book');

    // The genre-bearing tail must stay the tail: the last troparion is the
    // Theotokion, which the renderer puts at "Now and ever".
    assert.match(base[base.length - 1].label || '', /Theotokion/,
      'base: last troparion is the Theotokion');
    assert.match(over[over.length - 1].label || '', /Theotokion/,
      'overlay: last troparion is still the Theotokion');
  });

  it('INV-6: `_`-prefixed overlay metadata does not reach the merged result', () => {
    const over = loadVariableSourceJSON(REL, FIXTURE);
    assert.equal(over._note, undefined,
      '_note is overlay-only metadata and must be stripped on merge');
    // The fixture does declare one, so this test can actually fail.
    const raw = require(
      path.join(ROOT, 'variable-sources', 'translations', FIXTURE, REL));
    assert.ok(raw._note, 'precondition: the fixture declares a _note to strip');
  });
});
