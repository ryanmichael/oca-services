# Feature: confessFirst (Communion Prayer order)

**Status:** shipped 2026-06-14 (commit `c7c34f6`)
**Contract test:** `test/contracts/confess-first.test.js`
**Session context:** memory `project_session_handoff_2026_06_14.md` § "confessFirst parish rubric"

## Purpose

The Communion Prayer section contains three components:

1. The priest's call **"In the fear of God, with faith, and with love, draw near!"**
2. The choir's response **"Blessed is He that comes in the Name of the Lord…"**
3. The pre-Communion prayer **"I believe, O Lord, and I confess…"** (Symeon Metaphrastes; rendered as 1–3 sub-blocks split on blank lines).

The OCA Service Book orders them call → response → prayer (communicants pray "I believe and confess" as they approach the chalice). HTM/Jordanville-influenced parish practice orders them prayer → call → response (the choir sings the prayer first, with everyone joining, before the priest's call). This rubric is a parish discretion — both orders are valid; pick the one your parish uses.

## Interface

**Manifest (overlay `manifest.json`):**

```json
"rubrics": {
  "preCommunion": {
    "confessFirst": true
  }
}
```

- Boolean. Default is `false` (OCA Service Book order).
- No query-param override; this is per-parish, not per-request discretion.

## Behavior table

| Day signal | `confessFirst` | Communion Prayer block order |
|---|---|---|
| Ordinary day | absent / false | `pc-draw-near` → `pc-blessed` → `pc-prayer-*` |
| Ordinary day | true | `pc-prayer-*` → `pc-draw-near` → `pc-blessed` |
| Paschal period (`brightWeek` or `pentecostarion` season) | (ignored) | `pc-prayer-*` only — the call/response are replaced by the Paschal Communion antiphon, rendered in the Pre-Communion section above |

The Paschal-period override takes precedence: even when a parish overlay sets `confessFirst: true`, the rubric is force-disabled during the Paschal period because the priest's call and choir response don't exist in that period to be reordered.

## Code surface

- `assemblers/liturgy.js` — computes `paschalCommunionOrder` from `liturgicalContext.season`, then `confessFirst = rubrics.preCommunion.confessFirst === true && !paschalCommunionOrder`. Passes both flags to `_litCommunionPrayer`.
- `assemblers/liturgy-parts/communion.js` — `_litCommunionPrayer(f, { confessFirst, paschal })` emits the three (or one, in paschal) blocks in the order specified.

## Invariants (tested)

- **INV-1** — Default (no overlay rubric): Communion Prayer block order is `pc-draw-near` → `pc-blessed` → `pc-prayer-*` on an ordinary-time Sunday.
- **INV-2** — `confessFirst: true` (Tyler overlay): Communion Prayer block order is `pc-prayer-*` → `pc-draw-near` → `pc-blessed` on an ordinary-time Sunday.
- **INV-3** — Paschal period: `pc-draw-near` and `pc-blessed` do NOT appear in Communion Prayer; only `pc-prayer-*` blocks render — regardless of overlay setting. (Tested with a Tyler-overlay request on a Paschal-period Sunday to confirm the rubric is suppressed even when set.)

## Edge cases & follow-ups

- **Mid-Paschal-period parish overlay change** — none observed; the suppression is purely date-driven.
- **Custom communion prayer text.** When the overlay replaces `pre-communion.prayer-chrysostom`, the split-on-blank-lines logic still applies; an overlay using a single-paragraph prayer renders as a single `pc-prayer` block. Not yet contracted.
- **Non-Sunday Liturgy** (weekday). The same order rules apply; no separate behavior. Not separately contracted because the assembler path is shared.

## Verified dates

- 2026-06-21 — ordinary Sunday, default + Tyler overlay — INV-1 and INV-2.
- 2026-04-19 — Thomas Sunday (Paschal period), Tyler overlay — INV-3.

## Keep in sync

Code changes that require updating the behavior table and contract tests:
- `_litCommunionPrayer` in `assemblers/liturgy-parts/communion.js`
- `paschalCommunionOrder` derivation or `confessFirst` gating in `assemblers/liturgy.js`
- Any new season key added to `liturgicalContext.season` that should suppress the call/response (currently `brightWeek` and `pentecostarion`)
- Changes to the block ids `pc-draw-near`, `pc-blessed`, `pc-prayer-*`, or to how the prayer text is split
