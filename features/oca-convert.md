# Feature: converting stichera to the OCA translation

**Status:** shipped 2026-10-05 — chunk 3 of the OCA-standardisation plan
**Contract test:** `test/contracts/oca-convert.test.js`
**Scripts:** `node scripts/oca-convert-plan.js` → `node scripts/oca-convert-apply.js --apply`
**corrections_log:** #13

## What shipped

9 commemorations, 29 rows, moved from Lambertsen/st-sergius.org English to the
OCA text published for that saint's own day. Same hymns, same slots, verified
row by row before writing. Martyr Gordius (14) also gained tones — his three
rows had `tone` NULL and are now Tone 8 per the OCA text.

Two scripts, deliberately split: **the plan holds every judgement, the applier
holds none.** A reviewer reads `audit/reports/oca-convert-plan.json` to know what
will change; `oca-convert-apply.js` only writes what the plan already proved.

## The estimate fell twice, and both drops were real

| Stage | Convertible | Why it fell |
|---|---|---|
| Chunk 2 proxy | **87 comms / 467 rows** | "saint named anywhere in the OCA file" |
| Subject must own the stichera | **22 / 77** | OCA publishes a day for its *principal* saint and prints nothing for minor co-commemorations |
| Slot-to-slot mapping required | **9 / 29** | OCA often prints a different number of stichera than we hold |

The middle drop is the substantive one. On 1-2 the OCA text prints the Forefeast
and St Seraphim — not Sylvester or Juliana. On 1-21 it prints Ven. Maximus and
St Neophytus — not Agnes. Those saints have no OCA stichera to convert *to*.

**The second drop caught a real bug before it wrote anything.** The planner
compared counts only, and proposed replacing St Hierotheus's Now-and-ever
Theotokion (order −1) and his fourth sticheron (order 4) with OCA's three
numbered stichera — the wrong hymns into the wrong slots. He is now correctly
skipped: OCA prints no counterpart for either row. INV-5 pins it.

## Held back, not guessed

- **32 slot mismatches** — OCA prints a different number than we hold (e.g. 1-2
  Seraphim: OCA 5, we hold 8; 11-30 Andrew: OCA 8, we hold 3). Choosing which to
  keep is a liturgical decision about an appointed count, not a mechanical one.
- **3 ambiguous subjects** — e.g. 8-2 matches both "St. Stephen" and "St.
  Stephen, by Anatolius".

Both are reported in the plan with reasons. A pipeline that quietly dropped its
hard cases would look like success.

## The measured effect — and why it is the real finding

D23 mixed-translation Vespers went **225 → 224**. One date.

That is not a disappointment; it is the answer to the question chunk 3 was
asked. These are minor saints who rarely render as principal, and **the mix is
dominated by the weekday Octoechos**, every day-node of which is
`_source: 'stSergius'`. Converting every remaining Menaion sticheron we can
source would still leave the great majority of mixes standing.

**The lever is chunk 4** — the weekday cycle, one decision across ~210 dates.

## Safety properties (tested)

- **INV-1/2** — the parser lifts a saint's stichera, verses, tone and podoben,
  and reproduces text independently verified against files.oca.org.
- **INV-3** — the sheet's `//` becomes a newline, the house convention.
- **INV-4** — a subject the file does not print yields nothing, so one saint's
  hymns can never be attributed to another.
- **INV-5** — the planner maps slot to slot; Hierotheus is not proposed.
- **INV-6** — the applier is dry-run by default, backs up the DB, re-verifies
  every target row against the plan, and **only UPDATEs** — never INSERT or
  DELETE, so no saint can lose a hymn.

The applier also refuses a stale plan: if a target row's source is no longer the
non-OCA one the plan saw, it exits rather than replay.

`reference/scrape/` is gitignored, so INV-1..4 skip when the archive is absent
(a fresh clone, or CI). A missing local cache is not a defect in this code.

## Keep in sync

- `server-lib/sources/oca-docx-parse.js` — the parser
- `scripts/oca-convert-plan.js` / `oca-convert-apply.js`
- `features/oca-coverage.md` — chunk 2, which sized this
- `features/translation-mix.md` — chunk 1, which measures the effect
