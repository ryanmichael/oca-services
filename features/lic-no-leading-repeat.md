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

| Flag | Tone ships a promotable doxastichon | LIC total | Octoechos slots | Menaion slots | Verses |
|---|---|---|---|---|---|
| absent / 0 | no | 10 | 7 (sticheron 1 doubled) | 3 | 10 → 1 |
| 1 | no | 9 | 6 (no doubling) | 3 | 9 → 1 |
| absent / 0 | yes (Tone 8) | 10 | 7 (7th = displaced doxastichon) | 3 | 10 → 1 |
| 1 | yes (Tone 8) | 10 | 7 (7th = displaced doxastichon) | 3 | 10 → 1 |

When the tone's doxastichon is promotable the flag has no effect: there is nothing to
double and nothing to truncate, so both parishes land on the canonical 10.

Glory/Now slots and Theotokion-Dogmatikon selection are unchanged.

## Code surface

- `server-lib/assemble/for-date.js` Saturday-injection branch — when `opts.rubrics?.lordICall?.noLeadingRepeat` is true and the spec's `totalStichera === 10`, reduce to 9 before computing the verse split. Result: `lic.slots[0].verses = [9..4]` (6 octoechos), `lic.slots[1].verses = [3..1]` (3 menaion).
- `assemblers/vespers-parts/lord-i-call.js:34-37` — the doubling logic still exists as a fallback for any future case where slots > unique hymns, but doesn't fire when slots == hymns (the 9-count case).

## Invariants (tested)

- **INV-1** — Default (no overlay rubric): Sat Great Vespers on Tone 3 (2026-06-27) emits 10 octoechos+menaion hymn blocks; the first two octoechos hymns have identical text (sticheron 1 doubled per typikon rule).
- **INV-2** — Tyler overlay (`licNoLeadingRepeat=1`): same date emits 9 octoechos+menaion hymn blocks (6 + 3); no two consecutive blocks have identical text; verse `lic-verse-10` is absent.
- **INV-3** — Tyler overlay: Doxastikon (`lic-glory-hymn`) and Theotokion-Dogmatikon (`lic-now-hymn`) still render with their expected source/tone.
- **INV-4** — Tyler overlay: weekday Daily Vespers and feast-vigil Vespers are unaffected (rubric is Saturday-Great-Vespers-scoped).
- **INV-5** — Tone 8 (2026-08-01 eve → Sun 8-02, Stephen): both default and Tyler emit 10 LIC hymns (7 octoechos + 3 menaion) with no consecutive duplicates and verse 10 present — the displaced doxastichon fills the 7th slot.
- **INV-6** — Tone 3 (2026-06-27): the Glory-framed doxastichon never appears as a numbered sticheron; Tone 3 keeps default-doubles / Tyler-9.

## Displaced-doxastichon promotion (added 2026-08-01)

Partial close of the data gap below, for tones where it is verifiable.

Each tone's `lordICall.glory` node holds a resurrectional doxastichon. When the Menaion
claims the Glory slot that text is otherwise unused for the day. In **some** tones it is
written as a plain resurrectional sticheron and the typikon sings it as the 7th numbered
one; in most tones it is framed for the Glory position and must not be promoted (Tone 3:
"Standing unworthily in Thy most pure house … we offer our evening song").

Because the two cases are indistinguishable programmatically, promotion is **opt-in per
tone** via `_alsoNumberedSticheron: true` on the glory node, and fires only when the
Menaion supplies the Glory (so the text can never render twice in one service).

**Verified tones: 8 only.** Set against the St. John of Damascus (Tyler) choir booklet for
2026-08-02, which numbers the Octoechos block 10–4 and ends on this text. Do not set the
flag on another tone without the same kind of parish-booklet or service-book confirmation
— guessing here silently moves a Glory text into a numbered slot.

## Forward note

This rubric papers over a data gap. The long-term solution is to source the missing 4th Anatolikon per tone (×8) from the HTM text Octoechos and ship 10 distinct stichera. When that data lands, this rubric can either be deprecated (universal 10-count) or repurposed as a parish-preference toggle for parishes that explicitly prefer the OCA chant arrangement's count. The promotion above closes Tone 8 without new source text; the remaining 7 tones still need the Anatolikon.

## Now-and-ever rows are not numbered slots (added 2026-08-07)

The Menaion side's count is `licStichera.length`, so anything that leaks into that array displaces an Octoechos slot one-for-one. Stichera at `order < 0` are the Now-and-ever hymn and must be excluded — both by the single-commemoration filter (`order >= 1`) and by the multi-saint Sunday combine, which previously renumbered them into the run.

Surfaced 2026-08-09 (St. Herman of Alaska inside the Afterfeast of the Transfiguration): the Afterfeast's Now-and-ever sticheron took a numbered slot, yielding 4 Feast + 3 saint against the rubric's 3 + 4.

Note the related open gap: the Menaion path has **no repeat-expansion**. Where the OCA source fills N slots from fewer unique texts via explicit `(Repeat: …)` rubrics, we render only the unique texts and the Octoechos side absorbs the difference. 8-09 renders 4+3+3 where the order file asks for 3+3+4.
