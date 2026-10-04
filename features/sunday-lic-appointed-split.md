# Feature: the Sunday Lord-I-Call split is appointed, not left over

**Status:** shipped 2026-10-03
**Contract test:** `test/contracts/sunday-lic-appointed-split.test.js`
**Audit rule:** `D21-sunday-lic-split-vs-order` (now enforcing, `KNOWN_RANK_GAPS` empty)
**Last verified:** this commit

## What was wrong

The split between resurrectional and Menaion stichera was two lines:

```js
const menaionCount        = licStichera.length;
const resurrectionalCount = totalStichera - menaionCount;
```

**The Resurrection got the remainder.** Whatever Menaion sticheron rows happened
to exist in the database claimed their slots first. Any Sunday carrying a second
stichera-bearing commemoration therefore demoted the Resurrection silently.

2026-10-04 (Hieromartyr Hierotheus) rendered **4 + 6** — four of Hierotheus and
two of Ven. Paul the Simple — where the published order appoints **7 + 3** and
names Paul zero times. It was sung that way at Great Vespers on 2026-10-03, six
of the ten stichera wrong, and **a person in church noticed**. `audit:date` was
0/0/0 on the date, and D21 was actively suppressing it as unfixable.

## Why rank could not fix it, and what could

`commemorations.rank` is NULL for all 2,638 rows. orthocal's `feast_level` gives
2026-07-12 (Proclus, correctly 4+6) and 2026-10-25 (Marcian, should be 7+3) the
**same level 0**. Both were tested; neither separates the cases. Do not re-try
them.

The published OCA order states the count in prose, per date:

```
7 stichera of the Resurrection, Tone 1
3 stichera of St. Hierotheus, Tone 4
```

and it *does* separate them — the Sundays that correctly render 4+6 (01-18,
07-12, 07-26, 09-20, 10-18 …) all read "4 stichera of the Resurrection", while
10-04 and 10-25 read 7 and 06-07/11-01 read 6.

**The oracle already parsed to detect the bug was sufficient to fix it.** D21 had
been reading that number since 2026-10-01 purely to report the mismatch. That is
the lesson worth keeping: a rule that can *detect* a defect from data often holds
everything needed to *prevent* it, and filing it as a data gap cost a service.

## How it works

`server-lib/sources/order-of-services.js` owns the parser. `for-date.js` consults
it to appoint the split; D21 consults it to check the result. One parser, so the
rule cannot drift from the thing it audits (INV-7).

**Only the MENAION count is appointed** — `totalStichera − appointed`. How many
resurrectional stichera fill the rest stays with the existing logic, so a parish
running `licNoLeadingRepeat` still gets its 9 rather than a doubled first
sticheron. Tone 1 publishes only 6 distinct resurrectional stichera, so:

| | Resurrection | Menaion |
|---|---|---|
| OCA base, 2026-10-04 | 7 (first doubled) | 3 |
| St John, Tyler (`licNoLeadingRepeat`) | 6 | 3 |

When the Menaion must be trimmed, the **principal's** stichera are kept. The
multi-saint merge concatenates in calendar order, so a plain `slice` would be at
the mercy of which commemoration happens to sort first.

Sundays with no order file (10 of 52 in 2026) fall back to the previous
behaviour. A missing oracle is not a finding.

## A rubric that does not do what its name suggests

`includeLesserSaints` is namespaced **`troparia.includeLesserSaints`** and is read
only by `liturgy-from-orthocal.js`. It governs **Liturgy troparia** and has never
applied to Vespers stichera. Tyler had it set to `0` throughout, which is why it
looked like it should have prevented this and did not.

## Invariants (tested)

- **INV-1** — 2026-10-04 renders 7 + 3.
- **INV-2** — Paul the Simple is not sung there at all.
- **INV-3** — the Menaion stichera are the principal's, at the appointed tone.
- **INV-4** — four Sundays the order appoints at 4 still render 4. **This is the
  over-correction guard**: D21's own comment warned that ~12 Sundays correctly
  render 4+6 and capping the Menaion at 3 by rank-signature would break twelve to
  fix three.
- **INV-5** — `licNoLeadingRepeat` still wins for the parish that set it.
- **INV-6** — a Sunday with no order file still renders.
- **INV-7** — D21 and the assembler share one parser.

Falsified by disabling the appointed trim: INV-1/2/3/5 fail, while INV-4/6/7
correctly stay green.

## Verification

D21 across all 365 dates with `KNOWN_RANK_GAPS` **empty**: 0 findings. All 42
Sundays that have a published order now match it, including the 12 that were
already correct.

## Follow-ups from the same date (2026-10-03)

Two things were reported alongside the split, both at 2026-07-12. **One was real
and one was my error.**

**REAL — the Glory followed the principal, not its own saint.** The Glory slot
took `sticheraLabel` (the principal's title) unconditionally, so on a Sunday where
the doxastikon belongs to the *other* saint it printed the right text under the
wrong name: 07-12 appoints "Glory… Ven. Michael, Tone 6" while the principal is
the Martyrs Proclus and Hilary. Fixed by carrying `commemorationId` on the merged
Glory and labelling from its owner — structure, not label parsing, the same
discipline the numbered stichera already use. Pinned by INV-9, with INV-10
guarding the ordinary case where the principal does own the Glory.

**NOT REAL — the "duplicate" sticheron.** I reported Ven. Michael's first two
stichera as byte-identical where the order appoints three distinct, and called it
data drift. OCR of the parish booklet (`docs/7-11 and 7-12`, source `tyler-booklet`)
shows the first sticheron marked **(X2)**: two distinct stichera, the first sung
twice to fill the order's three slots. The data is correct and matches the
booklet exactly. I declared a data gap without opening the source — the same
trap recorded in `project_d4_sat_aposticha_tone_fix`.

## Keep in sync

- `server-lib/sources/order-of-services.js` — the parser
- `server-lib/assemble/for-date.js` — `appointedRes` / `appointedMenaion`
- `audit/rules/D-structure/D21-…` — keep `KNOWN_RANK_GAPS` empty
- `features/lic-no-leading-repeat.md` — the parish 9-count this must not override
