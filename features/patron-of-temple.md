# Feature: Patron of Temple

**Status:** shipped 2026-06-13 (commit `821d3ec`); low-rank Sunday Glory-slot fix 2026-06-14 (commit `f10e1e2`)
**Contract test:** `test/contracts/patron-of-temple.test.js`
**Session context:** memory `project_patron_of_temple.md` (Claude collab notes, not in-repo)

## Purpose

A parish overlay declares its patron saint via manifest. On every Liturgy where the patron is not already commemorated by the calendar (and where the day isn't claimed wholly by a Great Feast), the patron's troparion and kontakion are injected into the Sunday hymn cycle at rubrically correct positions. This lets a parish "always remember" its patron without per-date data authoring.

## Interface

**Manifest (overlay `manifest.json`):**

```json
"rubrics": {
  "temple": {
    "commemorationId": 2471,
    "title": "Venerable John of Damascus"
  }
}
```

- `commemorationId` (required) — row id in `oca.db` `commemorations` table.
- `title` (required) — used in the "Troparion/Kontakion of the Patron of the Temple, <title>" rubric label.

**Query params:** none.
**Env vars:** none.

## Behavior table

| Day signal | Troparia order (Sunday) | Kontakia Glory slot |
|---|---|---|
| `feastOnly` true (Great Feast / Pentecostarion-feast Sunday) | patron logic skipped entirely | feast claims all slots |
| `hasCocelebratedOverlay` true (curated principal-feast / polyeleos+ Sunday — e.g. 6/14 NA Saints) | Res → Patron → Saint | Saint (patron kontakion dropped) |
| Simple-rank Sunday with patron set (e.g. 6/21 Ananias) | Res → Patron → Saint | **Patron** (saint kontakion read above, no Glory tag) |
| Simple-rank Sunday with no menaion saint | Res → Patron | Patron |
| Sunday with no menaion kontakion and no patron | Res only | (Resurrection kontakion alone) |
| Non-Sunday (weekday Liturgy) | day's hymns → Patron appended | (Sunday restructure does not apply) |

The Resurrection kontakion is dropped in the Sunday restructure path; it's carried by the Resurrection troparion above. When any Glory slot is filled, Now → Kontakion-Theotokion ("Protection of Christians") closes the section.

The signal that distinguishes principal-feast/polyeleos+ Sundays from simple-rank Sundays is `lit.hasCocelebratedOverlay`, surfaced from `buildLiturgyFromOrthocal`. This uses the curated `variable-sources/cocelebrated-overlays.json` list as the "polyeleos+ on Sunday" registry. A polyeleos+ commemoration without an overlay entry would currently be treated as simple-rank — accuracy improves as the curated list grows.

## Code surface

- `server-lib/sources/liturgy-from-orthocal.js` — surfaces `hasCocelebratedOverlay` and `feastOnly` on the return.
- `server-lib/routes/api-liturgy.js` — patron injection block + Sunday kontakia restructure.
- `server-lib/sources/menaion.js` — `getMenaionPatron(commemorationId)` helper.
- `variable-sources/cocelebrated-overlays.json` — the principal-feast Sunday registry that drives the Glory-slot decision.

## Invariants (tested)

Each `INV-*` below corresponds to a named test in `test/contracts/patron-of-temple.test.js`.

- **INV-1** — Sunday troparia order is `Resurrection → Patron → Saint(s)` when the manifest declares a patron.
- **INV-2** — On a simple-rank Sunday (no cocelebrated overlay), the patron's kontakion occupies the Glory slot; the day's saint kontakion is rendered immediately above without a Glory connector; Now is `Kontakion-Theotokion`.
- **INV-3** — On a principal-feast Sunday (cocelebrated overlay present, e.g. 6/14 NA Saints), the day's saint kontakion holds Glory and the patron's kontakion is dropped; Now is `Kontakion-Theotokion`.
- **INV-4** — When `feastOnly` is true (Great Feast / Pentecostarion-feast Sunday), patron logic is skipped entirely: no patron troparion or kontakion appears in the output.
- **INV-5** — A request with no parish overlay sees no patron-of-temple blocks at all (baseline regression check).

## Edge cases & follow-ups

- **Polyeleos+ saint without a cocelebrated-overlay entry.** Will be treated as simple-rank (patron takes Glory). Mitigation: keep `cocelebrated-overlays.json` current as new polyeleos+ Sunday-dates are added.
- **Weekday patron-injection order.** Currently appended at end of troparia; rubrical position on weekday Liturgy not yet specified or tested. Open question.
- **Multiple patrons.** Schema supports a single `commemorationId`. Multi-patron parishes (rare) would need a schema extension.
- **Patron whose own feast day falls on a Sunday.** No deduplication: patron will appear twice (once as principal commemoration, once via this mechanism). Not yet observed in practice; flag if it surfaces.

## Verified dates

- 2026-06-14 — NA Saints (polyeleos+), St. John Tyler overlay — INV-3 path. Verified in commit `8e51af4`.
- 2026-06-21 — Ven. Ananias the Iconographer (simple-rank), St. John Tyler overlay — INV-2 path. Verified in commit `f10e1e2`.

## Keep in sync

Code changes that require updating the behavior table and contract tests:
- `getMenaionPatron` or the patron-injection block in `server-lib/routes/api-liturgy.js`
- `_litKontakia` connector logic in the assembler
- `feastOnly` or `hasCocelebratedOverlay` gating from `buildLiturgyFromOrthocal`
- Order/position of patron troparion in the troparia list
- Rank-based kontakion slotting rules
- New entries in `variable-sources/cocelebrated-overlays.json` (each one shifts that Sunday from simple-rank to polyeleos+ for patron-kontakion purposes — re-verify any low-rank contract test using that date)
