# Feature: L45 — one antiphon, one translation

**Status:** shipped (this commit)
**Contract test:** `test/contracts/antiphon-translation-family.test.js`
**Rule:** `audit/rules/E-provenance/L45-antiphon-translation-family.js`
**Sibling:** `D23-translation-mix-within-service` (Vespers/Matins/Vigil)

## Purpose

A blended Liturgy antiphon is sung as one continuous section, so it should be
in one English. This rule resolves every hymn's text to a translation family
and reports a section that resolves to more than one.

## The defect, and the three reasons nothing caught it

At Liturgy on 2026-11-01 the reader's Third Antiphon portions were in two
Englishes — `htm` for the six Resurrection troparia, `stsergius` for the four
Unmercenaries troparia — against choir verses that were OCA/Dmitri. Heard from
the pew; reported the next morning. Three independent failures let it through,
all closed in this commit:

1. **D23 did not apply.** It is the translation-mix rule, and its `appliesTo`
   covers `vespers | matins | vigil`. The Liturgy was outside it entirely.
2. **D23 could not have seen it anyway.** It keys on
   `roleOf(block)` = `octoechos | menaion | moveable`; a blend block carries
   `source: 'feast'`, which maps to no role and is skipped.
3. **The provenance index laundered the evidence.** `index()` read only
   `node._source`, but the Sunday Beatitudes nodes tag themselves with a bare
   `source`. All eight tones inherited the file's no-tag default and resolved
   as family **`oca`**. The mix was invisible by construction — and so was the
   larger fact that the resurrectional half of *every* Sunday's Third Antiphon
   is non-OCA.

`L17-sunday-beatitudes-shape` was no help either, and could not have been: it
asserts `hymns.length >= 6`. The pre-fix 11-01 render had 8 and passed while
every troparion sat four stichoi late.

## What it asserts

Not a count, not a label, not a sequence. It resolves each hymn's **text**
through the provenance index and asserts the section resolves to a single
family. A section that is correctly ordered, correctly counted and correctly
right-aligned still fails if it is in two Englishes — which is the failure that
happened.

`unknown` is excluded: it means unattributed, not different. Counting it would
make every gap in the index look like a defect.

## Interface

| Field | Value |
|---|---|
| id | `L45-antiphon-translation-family` |
| family | `provenance` |
| severity | `medium` |
| needsAssembled | `true` |
| appliesTo | `ctx.service === 'liturgy'` |
| sections | First, Second, Third Antiphon |

### Why `medium`

Measured over 2026 on the Tyler stack: 49 Sundays render a Third Antiphon, **8
mix two known families**, all 8 real. But the remedy is sourcing, not code —
OCA publishes no Beatitudes troparia, so there is no OCA text to switch to and
a `high` would gate work it cannot unblock. Same posture as D24's tracked
burn-down. Raise to `high` when an OCA Beatitudes corpus lands.

## The finding set (2026, `st-john-damascus-tyler`)

| Date | Families |
|---|---|
| 2026-05-24 | HTM ×2 + St. Sergius ×1 |
| 2026-06-14 | HTM ×8 + OCA ×4 |
| 2026-07-19 | HTM ×6 + Lambertsen ×4 |
| 2026-08-16 | HTM ×4 + St. Sergius ×2 |
| 2026-09-20 | HTM ×4 + St. Sergius ×6 |
| 2026-11-01 | HTM ×6 + St. Sergius ×4 |
| 2026-11-08 | HTM ×6 + St. Sergius ×4 |
| 2026-11-22 | HTM ×6 + St. Sergius ×4 |

Every one is a date where `FEAST_BEATITUDES_BLENDS` or a feast-canon override
joins a second book to the Octoechos spine. The blend is correct practice; the
English not matching is the defect.

### The bigger fact this rule deliberately does NOT report

**37 of those 49 Sundays are entirely `htm`** — a uniform non-OCA family across
all eight tones' Sunday Beatitudes
(`variable-sources/octoechos.json`, `source: htm-octoechos-sunday-beatitudes`,
from saintjonah.org). A uniform wrong family is not an audible seam, so it is
not a finding here. It is the sourcing gap, and it is the larger of the two
problems: on a plain Sunday the entire Third Antiphon is in an English the
parish did not choose. Tracked in `project_beatitudes_oca_gap`.

## Code surface

- `audit/rules/E-provenance/L45-antiphon-translation-family.js` — the rule.
- `server-lib/sources/translation-provenance.js`:
  - `walkTagged()` reads **both** `_source` and bare `source` (the latter
    appears exactly 8 times in `octoechos.json`, all Beatitudes nodes —
    verified before the change).
  - `FAMILY['htm-octoechos-sunday-beatitudes'] = 'htm'`;
    `LABEL.htm = 'Holy Transfiguration Monastery'`. Its own family, not folded
    into `lambertsen`: a different artifact, and a detector should report the
    seam rather than decide two books are close enough.
  - `familyOfProse()` attributes the freeform `_meta._source` prose on
    variable-source files by pattern; an unrecognised string stays `unknown`
    rather than guessing, because a wrong attribution hides a mix.
  - Menaion day-files and feast-canons are now indexed (step 1b), before the DB
    so the DB's controlled vocabulary still wins on a text collision. Index
    grew 5,523 → 19,754 texts; the whole canon-ode corpus had been unindexed.
  - Texts with a glued genre prefix (`"Theotokion: …"`) are indexed in their
    stripped form too, because the blend lifts that prefix into the block label
    before rendering. Without it, 3 of 4 Unmercenaries troparia attributed.
- `audit/rules/E-provenance/L3-translation-consistency.js` — `ye` added to
  `TT_MARKER`.
- `scripts/yy-to-tt.js` — `PLURAL_ADDRESS_PATTERNS` gains generalized
  `O <modifiers> ones` and bare `ye`.

## The L3 false positive (same section, same day)

The one finding the audit *did* report for 2026-11-01 was wrong:

```
L3-translation-consistency — Third Antiphon (For the Unmercenaries) contains
YY pronoun(s) in an otherwise-TT service: "As benefactors curing sufferings
and pangs of body and soul, O most honored ones…"
```

`"ye heal those who have recourse to you"` is correct TT **plural** address for
two saints. Two gaps combined:

- `TT_MARKER` omitted `ye`, so a plural-addressed hymn with no singular verb
  form registered as having no TT marker at all;
- `isPluralAddress()` enumerated `venerable|holy|righteous|godly ones` but not
  `most honored ones`.

Both fixed. Blast radius measured over all 12,348 stichera+troparia rows before
the change: 38 rows newly plural via `O … ones`, 134 via bare `ye`, every
sampled one genuinely plural (`"ye gates of heaven"`, `"Come ye, let us all"`).

So the audit reported `high=1` on the wrong thing and `0` on the real thing. It
now reports `high=0, medium=1`.

## Invariants (tested)

- **INV-1** — A section whose hymns resolve to two known families produces
  exactly one finding naming both, with counts.
- **INV-2** — A section whose hymns resolve to one family produces none.
- **INV-3** — `unknown` never counts as a family: a section of one known family
  plus any number of unattributed hymns produces none.
- **INV-4** — The rule reads resolved provenance, not block metadata: with the
  two families folded into one, the 11-01 finding disappears. (Falsified by
  hand against the live assembler on 2026-11-02; the first attempt folded the
  wrong resolution path and was itself caught by the rule still firing.)
- **INV-5** — `familyOfText` attributes the Sunday Beatitudes as `htm`, not
  `oca` — the bare-`source` regression guard.
- **INV-6** — L3 does not flag the 11-01 Unmercenaries troparion, and still
  flags a genuinely YY text.

## Keep in sync

- Adding a section to `BLENDED_SECTIONS` asserts everything sung under that
  heading is one translation — check the finding count first.
- Adding a translation family: add to both `FAMILY`/`familyOfProse` and `LABEL`,
  or findings print a bare slug.
- If an OCA Beatitudes corpus lands: author
  `variable-sources/translations/oca/octoechos.json`, raise this rule to `high`,
  and update the finding table above.
