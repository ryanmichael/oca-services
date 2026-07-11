# Feature: Sunday Liturgy Kontakia Restructure

**Status:** shipped 2026-06-14 (commit `8e51af4`); low-rank Glory-slot fix 2026-06-14 (commit `f10e1e2`); **Resurrection-kontakion-leads correction 2026-07-11** (INV-1 inverted, verified vs OCA OOS)
**Contract test:** `test/contracts/sunday-kontakia-restructure.test.js`
**Last verified:** 2026-07-11 (OCA OOS 2021-1003, 2021-0926)
**Session context:** memory `project_session_handoff_2026_06_14.md` § "Sunday kontakia structural restructure"

> The principal-saint picker change in `d5f5ea2` shifted the 2026-06-21
> day-saint witness from Ananias to Julian of Tarsus; INV-2's saint-name
> regex was updated to match. Section shape (Glory: <saint> / Now:
> Kontakion-Theotokion) unchanged. Bump `Last verified` after the next
> intentional change to this feature's surface.

## Purpose

At the Divine Liturgy on a Sunday, the rendered Kontakia section follows a specific OCA shape:

- The **Kontakion of the Resurrection leads** the section (first kontakion).
- **Glory:** → the principal commemoration's kontakion (or the patron-of-temple's, on simple-rank Sundays — see `features/patron-of-temple.md`).
- **Now:** → the Kontakion-Theotokion *"Protection of Christians that cannot be put to shame…"* (Romanos, OCA translation), keyed at `liturgy-fixed.json#kontakion-theotokion`.

> **Correction (2026-07-11):** the original restructure *dropped* the Resurrection
> kontakion, claiming it was "carried by the troparion above." That was wrong and
> uncited. The OCA Order of Services for ordinary Sundays keeps it as the first
> kontakion — verified against oca.org OOS **2021-1003** (15th Sun, St Dionysius)
> and **2021-0926** (14th Sun, St John): `Kontakion of the Resurrection` →
> [Church] → `Glory: <saint>` → `Now: "Steadfast Protectress"`. INV-1 inverted.

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
| Sunday, saint kontakion present, no patron | `Resurrection` → `Glory: <saint>` → `Now: Kontakion-Theotokion` |
| Sunday, saint kontakion present, patron set, `hasCocelebratedOverlay` true | `Resurrection` → `Glory: <saint>` → `Now: Kontakion-Theotokion` (patron dropped — see patron-of-temple INV-3) |
| Sunday, saint kontakion present, patron set, `hasCocelebratedOverlay` false (simple-rank) | `Resurrection` → `<saint>` (no connector) → `Glory: <patron>` → `Now: Kontakion-Theotokion` (see patron-of-temple INV-2) |
| Sunday, no saint kontakion, no patron | Resurrection kontakion alone |
| Weekday Liturgy | Restructure does not apply — kontakia render as upstream authored |

The Resurrection kontakion leads every Sunday path (prepended in the standard-Sunday branch); only the Lenten-commemoration-Sunday branch (day's own kontakion claims both Glory+Now slots) omits it by design.

## Code surface

- `server-lib/routes/api-liturgy.js` — Sunday-kontakia restructure block. Reads `lit.feastOnly`, `lit.hasCocelebratedOverlay`, the upstream `lit.kontakia` array, and the patron kontakion (if any) from the patron-of-temple injection above. Writes back the restructured `lit.kontakia`.
- `fixed-texts/liturgy-fixed.json#kontakion-theotokion` — the *"Protection of Christians"* text, tone, and rubric used at the Now slot.
- `assemblers/liturgy-parts/kontakia.js` (or wherever `_litKontakia` lives) — renders the per-block `connector` field as a `Glory:`/`Now:` rubric line before each block.

## Invariants (tested)

- **INV-1** — On an ordinary Sunday, the rendered Kontakia section **leads** with the Resurrection kontakion (a block matching `/Kontakion of the Resurrection/`), before `Glory: <saint>` and `Now: Kontakion-Theotokion`. (Per OCA OOS — see Purpose correction.)
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
