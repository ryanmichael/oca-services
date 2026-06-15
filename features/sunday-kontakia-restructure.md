# Feature: Sunday Liturgy Kontakia Restructure

**Status:** shipped 2026-06-14 (commit `8e51af4`); low-rank Glory-slot fix 2026-06-14 (commit `f10e1e2`)
**Contract test:** `test/contracts/sunday-kontakia-restructure.test.js`
**Session context:** memory `project_session_handoff_2026_06_14.md` § "Sunday kontakia structural restructure"

## Purpose

At the Divine Liturgy on a Sunday, the rendered Kontakia section follows a specific OCA shape:

- The Resurrection kontakion is **not** printed in this section — it's carried by the Resurrection troparion immediately above.
- **Glory:** → the principal commemoration's kontakion (or the patron-of-temple's, on simple-rank Sundays — see `features/patron-of-temple.md`).
- **Now:** → the Kontakion-Theotokion *"Protection of Christians that cannot be put to shame…"* (Romanos, OCA translation), keyed at `liturgy-fixed.json#kontakion-theotokion`.

Before this restructure, the Kontakia section printed the Resurrection kontakion in full, then patron blocks with broken Glory/Now bracketing, and never closed with a Theotokion. The restructure makes the rendered output match what's actually sung at OCA parishes.

## Interface

No direct user-facing interface. The restructure is applied automatically in `server-lib/routes/api-liturgy.js` whenever:
- The request is a Liturgy
- The date is a Sunday (local UTC)
- `lit.feastOnly` is false (Great Feasts have their own kontakia shape and skip this path)

Inputs come from upstream sources (`buildLiturgyFromOrthocal`, menaion DB, the patron-of-temple injection).

## Behavior table

| Day signal | Kontakia section shape |
|---|---|
| Sunday, `feastOnly` true (Great Feast / Pentecostarion-feast) | Restructure skipped — feast's own kontakia render as authored |
| Sunday, saint kontakion present, no patron | `Glory: <saint>` → `Now: Kontakion-Theotokion` |
| Sunday, saint kontakion present, patron set, `hasCocelebratedOverlay` true | `Glory: <saint>` → `Now: Kontakion-Theotokion` (patron dropped — see patron-of-temple INV-3) |
| Sunday, saint kontakion present, patron set, `hasCocelebratedOverlay` false (simple-rank) | `<saint>` (no connector) → `Glory: <patron>` → `Now: Kontakion-Theotokion` (see patron-of-temple INV-2) |
| Sunday, no saint kontakion, no patron | Resurrection kontakion alone (only path where Res kontakion survives) |
| Weekday Liturgy | Restructure does not apply — kontakia render as upstream authored |

The Resurrection kontakion is dropped on every Sunday path except the final fallback (no saint, no patron) where there is nothing else to render.

## Code surface

- `server-lib/routes/api-liturgy.js` — Sunday-kontakia restructure block. Reads `lit.feastOnly`, `lit.hasCocelebratedOverlay`, the upstream `lit.kontakia` array, and the patron kontakion (if any) from the patron-of-temple injection above. Writes back the restructured `lit.kontakia`.
- `fixed-texts/liturgy-fixed.json#kontakion-theotokion` — the *"Protection of Christians"* text, tone, and rubric used at the Now slot.
- `assemblers/liturgy-parts/kontakia.js` (or wherever `_litKontakia` lives) — renders the per-block `connector` field as a `Glory:`/`Now:` rubric line before each block.

## Invariants (tested)

- **INV-1** — On an ordinary Sunday, the rendered Kontakia section contains **no** Resurrection kontakion (a block whose rubric matches `/Kontakion of the Resurrection/`).
- **INV-2** — On a Sunday with a menaion saint kontakion and no parish patron, the Kontakia section ends with: `Glory: …` → `<saint kontakion>` → `Now and ever: …` → `Kontakion-Theotokion`.
- **INV-3** — On a weekday Liturgy, the Sunday restructure does not apply: no `Kontakion-Theotokion` block appears in the rendered Kontakia section.
- **INV-4** — On a Great Feast / `feastOnly` Sunday, the Sunday restructure is skipped: no `Kontakion-Theotokion` block appears (the feast's own kontakia render as authored).
- **INV-5** — When the Now-slot Kontakion-Theotokion renders, its text matches the `kontakion-theotokion` fixed-text key (regression guard against silent text drift on the "Protection of Christians" wording).

## Edge cases & follow-ups

- **No saint kontakion AND no patron AND it's Sunday.** Rare in practice — most Sundays have at least one menaion kontakion. The fallback renders only the Resurrection kontakion, with no `Glory:`/`Now:` bracket. Not currently contracted because a clean fixture date is hard to find; flag if one surfaces.
- **Per-tone Sunday Theotokion alternative.** Some rubrics swap "Protection of Christians" for the Sunday Theotokion in the tone of the week. Could be wired as an overlay manifest flag; not done.
- **Pentecostarion Sunday overrides.** Some Pentecostarion Sundays inject their own kontakia via `pentOverride.kontakia`. The interaction with this restructure is upstream (those kontakia arrive in `lit.kontakia` before the restructure runs) and not separately contracted here.

## Verified dates

- 2026-06-21 — Ven. Ananias the Iconographer (simple-rank), default no-overlay — INV-1, INV-2, INV-5.
- 2026-06-22 — Monday Liturgy (Hieromartyr Eusebius) — INV-3.
- 2026-04-12 — Pascha (feastOnly) — INV-4.

## Keep in sync

Code changes that require updating the behavior table and contract tests:
- The Sunday-kontakia restructure block in `server-lib/routes/api-liturgy.js`
- `feastOnly` or `hasCocelebratedOverlay` derivation in `buildLiturgyFromOrthocal`
- The `kontakion-theotokion` entry in `fixed-texts/liturgy-fixed.json` (text, tone, or rubric — INV-5 will catch drift but the table should be updated too)
- `_litKontakia` connector rendering (label-only `Glory:`/`Now:` rubric lines)
- Any new rule (e.g. Pentecostarion-Sunday-specific) that bypasses or modifies the restructure
