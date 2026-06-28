# Feature: licNoLeadingRepeat (Sat Great Vespers LIC 9-count)

**Status:** shipped (this commit)
**Contract test:** `test/contracts/lic-no-leading-repeat.test.js`
**Registry entry:** `data/rubric-registry.json > rubrics.licNoLeadingRepeat`
**Storage:** `parish_rubrics` (registry KV table) — no typed column.

## Purpose

At Saturday Great Vespers Lord-I-Have-Cried the canonical typikon calls for 10 stichera: 7 from the Octoechos (3 Resurrectional + 4 Anatolika) and 3 from the Menaion. **OCA's published chant arrangement (the Obikhod) only contains 6 Resurrectional stichera per tone — the 4th Anatolikon is not published in OCA chant form.** Default behavior: the assembler doubles sticheron 1 (the standard typikon rule when stichera < slots) to fill the 7th octoechos slot, then renders 10 total.

That doubling is rubrically permitted but produces two consecutive identical text blocks in the rendered service. Parish choirs reading the sheet often perceive the duplicate as a typo and skip the second one, breaking the verse-to-sticheron alignment. The duplicate that prompted this rubric was observed at Sat Jun 27 2026 Great Vespers (Tone 3): the choir sang "By Thy Cross, O Christ our Savior…" once and skipped its repeat at v.9.

This rubric opts the parish into honoring strictly what OCA publishes: **9 stichera total** (6 octoechos verse-stichera + 3 menaion), Sun-eve verses 9 → 1. The Doxastikon, Theotokion, and Menaion content are unaffected.

## Interface

**Registry entry:**

```json
{
  "label": "Lord I Call — no leading sticheron repeat (9-count)",
  "namespace": "lordICall.noLeadingRepeat",
  "type": "boolean",
  "default": false,
  "appliesTo": ["greatVespers"]
}
```

**Runtime rubrics object:**

```json
{ "lordICall": { "noLeadingRepeat": true } }
```

Default false. No query-param override; per-parish.

## Behavior table

| Flag | LIC stichera total | Octoechos slots | Menaion slots | Doxastikon | Verses iterated |
|---|---|---|---|---|---|
| absent / 0 | 10 | 7 (sticheron 1 doubled) | 3 | Menaion glory | 10 → 1 |
| 1 | 9 | 6 (no doubling) | 3 | Menaion glory | 9 → 1 |

Glory/Now slots and Theotokion-Dogmatikon selection are unchanged.

## Code surface

- `server-lib/assemble/for-date.js` Saturday-injection branch — when `opts.rubrics?.lordICall?.noLeadingRepeat` is true and the spec's `totalStichera === 10`, reduce to 9 before computing the verse split. Result: `lic.slots[0].verses = [9..4]` (6 octoechos), `lic.slots[1].verses = [3..1]` (3 menaion).
- `assemblers/vespers-parts/lord-i-call.js:34-37` — the doubling logic still exists as a fallback for any future case where slots > unique hymns, but doesn't fire when slots == hymns (the 9-count case).

## Invariants (tested)

- **INV-1** — Default (no overlay rubric): Sat Great Vespers on Tone 3 (2026-06-27) emits 10 octoechos+menaion hymn blocks; the first two octoechos hymns have identical text (sticheron 1 doubled per typikon rule).
- **INV-2** — Tyler overlay (`licNoLeadingRepeat=1`): same date emits 9 octoechos+menaion hymn blocks (6 + 3); no two consecutive blocks have identical text; verse `lic-verse-10` is absent.
- **INV-3** — Tyler overlay: Doxastikon (`lic-glory-hymn`) and Theotokion-Dogmatikon (`lic-now-hymn`) still render with their expected source/tone.
- **INV-4** — Tyler overlay: weekday Daily Vespers and feast-vigil Vespers are unaffected (rubric is Saturday-Great-Vespers-scoped).

## Forward note

This rubric papers over a data gap. The long-term solution is to source the missing 4th Anatolikon per tone (×8) from the HTM text Octoechos and ship 10 distinct stichera. When that data lands, this rubric can either be deprecated (universal 10-count) or repurposed as a parish-preference toggle for parishes that explicitly prefer the OCA chant arrangement's count.
