# Feature: Sunday Before the Exaltation + 9-13 Founding of the Church propers

**Status:** shipped 2026-09-13
**Contract test:** `test/contracts/sunday-before-exaltation-propers.test.js`
**Audit rules:** `L41-sunday-before-elevation-propers`, `L42-founding-church-secondary-propers`
**Session context:** memory `project_session_handoff_2026_09_13_liturgy.md`; oracle `reference/orders/2026-0913-order-services.txt`

## Purpose

Two recurring feasts that were both un-wired at Liturgy, surfaced by the choir
packet for 2026-09-13 (a Sunday that is both):

1. **Sunday Before the Exaltation of the Cross** (movable; the Sunday in Sept
   7-13; orthocal feast `"Sunday before Elevation"`). It carries its OWN
   prokeimenon (Tone 6) and alleluia (Tone 1) which REPLACE the Octoechos-tone
   pair, and its Epistle/Gospel are read *as one* with the Sunday-cycle
   pericopes — OCA order: "Galatians 6:11-18 and 2 Corinthians 4:6-15 read as
   one, then Hebrews 3:1-4". `pickPrimaryAndSecondary` was treating it like
   the Forefathers / Sunday-before-Nativity overrides, which DO suppress the
   cycle, so both cycle readings vanished and the ordinary Tone-N alleluia sang.
2. **9-13 Founding of the Church of the Resurrection** (fixed; doxology rank;
   DB comm 1881). Its troparion/kontakion never rendered because the Forefeast
   of the Cross holds the principal slot and the Founding is not a saint the
   picker knows; its prokeimenon / alleluia / koinonikon were never authored.

Sources: OCA DLMT texts `reference/scrape/2025-09-07.docx` (Sunday Before) and
`reference/scrape/2024-09-13.docx` (Founding).

## Interface

No request-side toggle. Detection in `server-lib/sources/liturgy-from-orthocal.js`:

- `sundayBeforeElevation` = Sunday, no Great Feast, no Pentecostarion override,
  orthocal feast matches `/sunday before (the )?(elevation|exaltation)/i`.
- `foundingChurchDay` = month 9 day 13, no Great Feast, no Pentecostarion
  override. Plus `FEAST_WINDOW_COCOMMEMORATIONS['9-13'] = 'Founding of the Church'`
  so the DB hymns render beside the Forefeast's.

Data: `variable-sources/daily-propers.json` → `sundayBeforeElevationProper`,
`foundingChurchResurrectionProper`; exported from `propers.js`.

A reading spec may now carry `continuation: { display, text }` — a pericope read
under the primary's announcement. `_litEpistle` / `_litGospel` emit it as
`ep-cont-ref` + `ep-cont-text` / `gos-cont-ref` + `gos-cont-text` between the
primary text and any `.secondary`.

## Behavior table

| Day | Prokeimenon | Alleluia | Epistle | Gospel | Koinonikon |
|---|---|---|---|---|---|
| Sunday Before (any year) | Tone 6 "O Lord, save Thy people" (replaces tone pair) | Tone 1 Ps 88:18b, 20 (replaces) | Gal 6:11-18 + cycle **as one**, then saint/feast `.secondary` | John 3:13-17 + cycle **as one**; saint/feast `.secondary` behind `includeSecondGospel` | day's |
| 9-13 (any day) | day's + `.secondary` Tone 4 "Holiness befits Thy house" | day's + `.secondary` Tone 2 Ps 86:1-2 | Heb 3:1-4 as `.secondary` (orthocal) | Matt 16:13-18 `.secondary` behind `includeSecondGospel` | day's + `.secondary` "I have loved the beauty of Thy house" unless `includeSecondKoinonikon === false` |
| 9-13 troparia (Sunday) | Resurrection · [patron] · Founding · Forefeast | | | | |
| 9-13 kontakia | standard Sunday restructure — shape deliberately NOT special-cased (memory `feedback_kontakia_shape_needs_measured_evidence`) | | | | |

## Invariants

- **INV-1** On a Sunday Before the Exaltation, the FIRST prokeimenon refrain is
  "O Lord, save Thy people…" in Tone 6 — the Octoechos-tone prokeimenon is not
  rendered.
- **INV-2** The Alleluia rubric is Tone 1 and its FIRST verse is "I have
  exalted one chosen out of My people."
- **INV-3** After the Galatians 6:11-18 text, the Sunday-cycle pericope follows
  under the same announcement (no second "The reading from…" between them);
  any saint/feast Epistle comes after that, with its own announcement.
- **INV-4** After the John 3:13-17 text, the Sunday-cycle Gospel follows before
  the closing "Glory to Thee, O Lord" and before any second announcement.
- **INV-5** On 9-13 the Founding troparion renders after the Resurrection
  troparion (Sunday) and before the Forefeast troparion; the Founding kontakion
  renders.
- **INV-6** On 9-13 the Founding prokeimenon, alleluia verse and koinonikon each
  render AFTER the day's, never first.
- **INV-7** A parish with `includeSecondKoinonikon = false` sees one koinonikon
  on 9-13 (the base render sees two).
- **INV-8** The Sunday After the Exaltation, the Holy Fathers Sundays and the
  Lenten second-Gospel path are untouched (sibling regression watch).

## Known gaps

- Beatitudes on 9-13: OCA appoints 4 troparia from Ode 3 of the Canon of the
  Founding. The Dedication canon is not in `september-13.json` (omitted per the
  menaion-matins-track convention); tracked by `L40` — do not wire a partial set.
- Weekday 9-13 shape (whether the Founding set displaces the daily cycle as
  primary) is unverified; attached as `.secondary` on every day.
- Sunday After the Exaltation (Sept 15-21) has the same read-as-one shape per
  OCA practice but no local source yet — reviewed next.
