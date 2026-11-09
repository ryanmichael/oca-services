# Packet exclusions — what the sheet prints but nobody sings

**Status:** shipped 2026-11-09
**Contract test:** `test/contracts/packet-exclusions.test.js`
**Code:** `scripts/lib/packet-exclusions.js`
**Data:** `audit/packet-exclusions.json`
**Curate with:** `node scripts/choir-packet-diff.js --sheet <name> --pieces`

## The gap this closes

A choir packet page is a **library, not a rubric**. The Menaion day-files and
the Octoechos tone pages print every hymn the day could use, and the director
strikes through in pen whatever the rubric does not reach. OCR cannot see a pen
stroke, so `choir-packet-diff` counted a struck hymn as a hymn we failed to
print.

On `great-vespers-2026-11-07` one large diagonal X covers the Tone 1 Aposticha
sticheron and both "Michael the archangel" stichera; "Glory… Now and ever…
Tone 8" is circled and kept. We print exactly what survives the X — and were
marked down for it.

This became load-bearing when the per-sheet ratchet turned into a **blocking
pre-push gate**: a false miss on a newly-filed packet now stops a push, and the
only other route to green would be refreshing the baseline, which is how an
oracle rots.

## An escape hatch, built to resist becoming one

An exclusions list can explain away any inconvenient finding, which would
destroy the only ground truth we have about what the parish actually sings.
Four constraints, all in code rather than etiquette:

1. **Closed vocabulary.** `reason` must be one of `REASONS`. Today that is
   exactly one value, `struck`. Adding another means editing the module, which
   means review.
2. **Content-addressed.** An entry names the sha256 of the piece's letters, so
   it cannot drift onto a different hymn — and cannot be written from an
   impression of the scan, because you need the piece in front of you.
3. **A stale entry is a finding.** An entry matching no piece fails `--check`
   with exit 2. A list that silently stops applying is worse than no list.
4. **Always visible.** Every report prints the per-sheet exclusion count and a
   section naming each one with its citation, so a sheet carried by exclusions
   looks like one.

`citation` must say *where* the mark is and *what it looks like*, so a reviewer
can open the scan and disagree. Read the scan **visually**; the OCR sidecar is
an index, never evidence.

## What does NOT go in here

Hymns we print in the wrong words, in the wrong place, or not at all. Those are
defects and must stay visible. `struck` means an **unambiguous pen strikethrough** —
not a highlight, box, arrow or marginal note. Those are selection aids whose
meaning we do not know, and reading one wrongly put a choir sheet's pen marks
onto the anaphora once already.

A worked example of restraint: on p.3 of the same packet, sticheron (6) carries
a drawn arrow/banner and (5) and (4) carry the same singer underlay marks as
hymns that *were* sung. Those are **not** excluded. The Octoechos library prints
seven stichera numbered 10–4 for the case where the Menaion supplies only
three; here the Menaion supplies six, so 10–7 are sung. That is a structural
fact we could assert — but the pen marks alone do not say so, and this list
takes evidence, not inference.

## Invariants

- **INV-1** — an excluded piece leaves the scoring set entirely, denominator
  included. Merely "not a miss" would still depress the rate it was excluded to
  protect.
- **INV-2** — an entry matching nothing is reported stale and fails the gate.
- **INV-3** — re-wording a piece **detaches** the exclusion rather than silently
  excusing whatever drifted in. Same rule as the Menaion override.
- **INV-4** — the validator rejects a reason outside the vocabulary, a
  malformed sha, a citation too thin to check, and a missing incipit.
- **INV-5** — the committed list is valid and every sheet it names has OCR on
  disk; a typo'd sheet name would make an entry permanently stale while looking
  like it worked.
- **INV-6** — every reason in the vocabulary carries a real description, and
  there is no catch-all.

Each was falsified by removing the thing it guards, including the stale gate
end-to-end: detaching the live entry's sha made `audit:packet-diff:check` exit 2.

## Measured effect

`great-vespers-2026-11-07`: 19 pieces printed, 1 excluded, 18 scored. Located
17/18 (94%) where it had been 17/19 (89%). Great Vespers overall: 136 pieces,
located 88%, verbatim 43%.

## The bigger noise is elsewhere

Dumping every piece with `--pieces` showed the struck hymn is **not** the main
distortion on this sheet. Three measurement bugs matter more, and none is an
exclusions matter:

- **Packet p.3 is classified `[music]`** though it is plain text, so four
  Octoechos stichera on it are invisible — neither located nor missed. This
  flatters the corpus rather than hurting it.
- **Page-break fragments** score as separate pieces: "Who in His love took
  flesh…" is the tail of a hymn we print in full, counted as a miss.
- **Headings glued into piece text** ("Tone 4", "Octoechos: Sunday
  Resurrectional Troparion Tone 6") drag otherwise-exact matches below the
  0.92 verbatim threshold.

Open.
