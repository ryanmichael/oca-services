# Feature: Menaion service sets (whole and partial)

**Status:** whole-shape shipped 2026-09-24 (undocumented until now); partial sets shipped 2026-10-02
**Contract tests:** `test/contracts/menaion-service-set-partial.test.js`
**Last verified:** this commit

## Purpose

A parish may sing a fixed-calendar day from a different book, or a different
edition of the same book, than our default resolution picks. `menaionServiceSet`
lets a parish name, per `MM-DD`, a prepared set of Menaion content to use for
that day's Vespers.

Two real cases drive the shape:

| Date | Set | Why |
|---|---|---|
| **10-1** Protection | `raphaela-protection-daily` | Tyler serves the Protection as **Daily** Vespers from the Mother Raphaela Menaion, where our default appoints the OCA Vigil. The whole service differs. |
| **10-8** Ven. Pelagia | `oca-music-general-venerable-woman` | One hymn differs. The OCA publishes **two** troparia for her and the parish sings the other one. |

Those two needs are not the same size, and that is the whole design problem.

## The two troparia for Pelagia

Worth recording, because it was misdiagnosed once:

- `oca.org/saints/troparia/2026/10/08/` publishes her **proper** troparion,
  Tone 4, *"Like a fragrant rose growing among thorns."* This is what we render
  by default, and it is **correct** — not drift.
- The OCA **Music Department**'s sheet appoints the **general** troparion for a
  woman monastic, Tone 8, *"The image of God was truly preserved in thee."*
  This is what the parish sings.

Both are OCA. The first dry run classified this `calendar-data` — "our row is the
outlier" — and would have changed the row for every parish. The director's own
question, *"Where did you find the other troparion in tone 4? I can't locate
it,"* is what forced the check that showed our row was right. (She could not find
it because a **second** Pelagia on the same OCA page carries a Tone 8 troparion.)

**The lesson generalises:** two OCA-published texts for one slot is not a defect.
Route it to a parish-scoped branch, not a data fix.

## Interface

`parish_settings.rubrics_extra_json → menaionServiceSet` — an object keyed by
`MM-DD`, each value a set id defined in `variable-sources/menaion-service-sets.json`.

```json
"menaionServiceSet": {
  "10-1": "raphaela-protection-daily",
  "10-8": "oca-music-general-venerable-woman"
}
```

⚠️ It is **not** a boolean registry rubric, so `parish-admin` does not render it
(that UI renders BOOLEAN registry rubrics only — see `omit-read-kathisma.md`).
Picks are set by DB write, and `scripts/capture-rubrics-snapshot.js` must be
re-run afterwards or INV-D in `rubric-registry.test.js` fails.

⚠️ Write `rubrics_extra_json` with `CAST(readfile(…) AS TEXT)`. A BLOB write
**silently drops every other extra rubric** (`project_practice_layer.md`).

## A set may carry only part of a service

Each block of a set is optional. `applyServiceSet` applies the blocks present and
leaves everything else to normal resolution:

| Block | Effect when present | Effect when absent |
|---|---|---|
| `lordICall` | replaces the Lord I Call stichera | Lord I Call resolves normally |
| `aposticha` | replaces the Aposticha | Aposticha resolve normally |
| `troparia` | replaces the troparia slots | — |
| *(troparion only, no `lordICall`)* | swaps the non-`now` troparion in place and re-keys the dismissal Theotokion to its tone | — |

Before 2026-10-02 the Lord I Call block was effectively mandatory: a set without
one fell through and applied nothing. Re-specifying all of October 8 to change one
troparion would have put the stichera that **already** match the director's sheet
at risk of regressing — so the smaller mechanism is the lower-blast-radius one.

The Theotokion re-key is deliberate and is repeated here. `for-date.js` already
re-keys the dismissal Theotokion to the troparion's tone, but it has run by the
time a set applies; without repeating it, a Tone 4 Theotokion sits under the new
Tone 8 troparion.

## Invariants (tested)

- **INV-1** — a troparion-only set swaps the troparion, and the Tone 4 proper
  does not also render.
- **INV-2** — the dismissal Theotokion follows the new tone.
- **INV-3** — a parish without the pick keeps the OCA default (her Tone 4 proper).
- **INV-4** — a set with no `lordICall` leaves Lord I Call untouched. Compared
  against base **except** the closing Theotokion, which Tyler sings in the week's
  tone under the separate `licTheotokionWeekTone` rubric.
- **INV-5** — the whole-shape 10-1 set still applies in full (Daily Vespers, the
  Protection stichera), the regression a partial-set change would most plausibly
  cause.

Both new invariants were falsified by disabling the branch before being trusted.

## Known gap — the weekday dismissal Theotokion

Found while verifying this correction, **not caused by it**, and not fixed here:

`dismissalTheotokion` exists only under `saturday`, in all 8 tones, in **both**
`variable-sources/octoechos.json` and `octoechos-myrrhbearers.json`. Every
weekday Vespers therefore falls back to the Saturday dismissal Theotokion. The
director's 10-07 sheet prints a Wednesday one ("O Pure Theotokos and gate of
eternal life") where we render the Saturday ("For our sake Thou wast born of the
Virgin"). Confirmed present at `43166d3`, before this change.

Bucket: **source-incomplete** — the canonical weekday texts are simply not in our
Octoechos. Needs the OCA weekday dismissal theotokia for all 8 tones × 5
weekdays before it can be closed.

## Keep in sync

- `server-lib/assemble/service-set.js` — `applyServiceSet`
- `variable-sources/menaion-service-sets.json` — the set definitions
- `scripts/capture-rubrics-snapshot.js` / `test/contracts/rubric-registry.test.js` INV-D
- `corrections_log` rows 8 (10-1) and 9 (10-8)
