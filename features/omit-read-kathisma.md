# Omit the read Kathisma at Vespers

**Rubric:** `omitReadKathisma` → `vespers.omitReadKathisma` (boolean, default `false`).
Registry-only (no typed column), so parish-admin renders it as a toggle in the
Vespers panel. Contract: `test/contracts/omit-read-kathisma.test.js`.

## Why

The appointed Kathisma is read in full at weekday Vespers — at Daily Vespers,
and at a weekday Great Vespers or Vigil. Many parishes do not read it. St. John
of Damascus, Tyler, does not (2026-09-30: "we don't read the full Kathisma",
applies "mostly everywhere").

## Behaviour when on

- Every **read** Kathisma at Vespers is left out (`assembleKathisma` returns
  nothing). The Little Litany after it goes too — the assembler already omits
  it whenever the Kathisma is empty, as the OCA rubric directs.
- The **sung** "Blessed is the Man" (Kathisma 1) on Saturday evening is kept,
  with its Little Litany.
- Matins kathismata are untouched.

Off (default): unchanged output for every parish.

## Open

- "Mostly everywhere" — if Tyler reads the Kathisma on some occasions, that is
  a follow-up (e.g. a season or rank exception), not a reason to widen this now.
