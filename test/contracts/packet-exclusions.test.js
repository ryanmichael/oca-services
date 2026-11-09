'use strict';

/**
 * Feature contract: pieces a packet PRINTS but the service does not SING.
 *
 * A packet page is a library. The director strikes through in pen whatever the
 * rubric does not reach, and OCR cannot see a pen stroke — so choir-packet-diff
 * counted struck hymns as hymns we failed to print. On great-vespers-2026-11-07
 * one diagonal X covers three Aposticha stichera; we print exactly what
 * survives it and were marked down for it.
 *
 * It now matters beyond the number: the per-sheet ratchet is a BLOCKING
 * pre-push gate, so a false miss on a newly-filed packet stops a push, and the
 * only other way to green would be refreshing the baseline — which is how an
 * oracle rots.
 *
 * AN EXCLUSIONS LIST IS AN ESCAPE HATCH. These invariants exist to stop it
 * becoming one. Each asserts a constraint that is enforced in code rather than
 * left to discipline, and each was falsified by removing the thing it guards.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'scripts', 'lib', 'packet-exclusions.js'));
const LIVE = require(path.join(ROOT, 'audit', 'packet-exclusions.json'));

const SHEET = 'great-vespers-2026-11-07';
const piece = (text, marker = '?') => ({ marker, text });

/** A well-formed entry for an arbitrary text. */
function entryFor(text, over = {}) {
  return {
    reason: 'struck',
    incipit: text.slice(0, 40),
    sha256: E.shaOf(text),
    citation: 'p.11 — one large diagonal X through this sticheron and the two following it.',
    ...over,
  };
}

describe('Feature contract: packet exclusions', () => {

  it('INV-1: an excluded piece leaves the scoring set entirely', () => {
    // Not merely "not a miss": it must not sit in the denominator either, or
    // excluding it would still depress the rate it was excluded to protect.
    // FALSIFIED BY: dropping the EXCLUSIONS.applyTo call in choir-packet-diff —
    // `kept` keeps the struck piece and the counts below flip.
    const struck = 'Let us who in the world celebrate as the angels, sing out to God.';
    const sung   = 'Since you, leader of hosts, are first in rank and an archangel.';
    const doc = { sheets: { [SHEET]: [entryFor(struck)] } };

    const { kept, excluded, stale } = E.applyTo(SHEET, [piece(struck), piece(sung)], doc);
    assert.equal(kept.length, 1, 'the struck piece must not be scored');
    assert.equal(kept[0].text, sung);
    assert.equal(excluded.length, 1);
    assert.equal(excluded[0].reason, 'struck');
    assert.deepEqual(stale, []);
  });

  it('INV-2: an entry that matches nothing is STALE, and reported', () => {
    // A list that silently stops applying is worse than no list: the sheet
    // quietly regains a false miss and nobody is told why.
    // FALSIFIED BY: removing the staleAll push in choir-packet-diff — --check
    // stops failing and the entry rots unnoticed.
    const doc = { sheets: { [SHEET]: [entryFor('a hymn that is not on this sheet at all')] } };
    const { kept, excluded, stale } = E.applyTo(SHEET, [piece('something else entirely')], doc);
    assert.equal(kept.length, 1, 'nothing may be excluded');
    assert.deepEqual(excluded, []);
    assert.equal(stale.length, 1, 'the unmatched entry must be reported as stale');
  });

  it('INV-3: an entry cannot drift onto a different hymn', () => {
    // Content-addressed, like the Menaion override. Re-wording the piece
    // DETACHES the exclusion instead of silently excusing whatever drifted in.
    const text = 'Let us who in the world celebrate as the angels, sing out to God.';
    const doc = { sheets: { [SHEET]: [entryFor(text)] } };
    const changed = text.replace('angels', 'archangels');
    const { kept, stale } = E.applyTo(SHEET, [piece(changed)], doc);
    assert.equal(kept.length, 1, 'a re-worded piece must NOT inherit the exclusion');
    assert.equal(stale.length, 1, 'and the entry must surface as stale');
  });

  it('INV-4: the guard rails reject a malformed entry', () => {
    // Closed vocabulary, real sha, a citation long enough to point at the scan,
    // and an incipit, because a human reviews this file.
    // FALSIFIED BY: weakening any clause in validate() — the matching case passes.
    const good = entryFor('some struck hymn text here');
    assert.deepEqual(E.validate({ sheets: { [SHEET]: [good] } }), []);

    const bad = {
      'reason outside the vocabulary': { ...good, reason: 'probably-not-sung' },
      'sha that is not a sha':         { ...good, sha256: 'deadbeef' },
      'citation too thin to check':    { ...good, citation: 'struck' },
      'no incipit for a human':        { ...good, incipit: '' },
    };
    for (const [why, entry] of Object.entries(bad)) {
      const problems = E.validate({ sheets: { [SHEET]: [entry] } });
      assert.ok(problems.length > 0, `validate() must reject: ${why}`);
    }
  });

  it('INV-5: the committed list is valid and names sheets that exist', () => {
    // A typo in a sheet name makes an entry permanently stale, excusing
    // nothing while looking like it does.
    assert.deepEqual(E.validate(LIVE), [], 'audit/packet-exclusions.json must be valid');

    const ocrNames = new Set();
    const dir = path.join(ROOT, 'docs', 'choir-packets');
    for (const d of fs.readdirSync(dir)) {
      const o = path.join(dir, d, 'ocr');
      if (!fs.existsSync(o)) continue;
      for (const f of fs.readdirSync(o)) if (f.endsWith('.txt')) ocrNames.add(f.replace('.txt', ''));
    }
    for (const sheet of Object.keys(LIVE.sheets || {}))
      assert.ok(ocrNames.has(sheet), `exclusions name a sheet with no OCR: ${sheet}`);
  });

  it('INV-6: every reason in the vocabulary is documented', () => {
    // The vocabulary is the brake. A reason with no stated meaning is a blank
    // cheque, so the map must carry a description for each.
    for (const [id, text] of Object.entries(E.REASONS)) {
      assert.equal(typeof text, 'string');
      assert.ok(text.length > 10, `reason "${id}" needs a real description`);
    }
    assert.ok(!E.REASONS['not-sung'], 'a catch-all reason would defeat the vocabulary');
  });
});
