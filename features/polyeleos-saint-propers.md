# Feature: Polyeleos+ saint secondary propers

**Status:** shipped 2026-06-18
**Contract test:** `test/contracts/polyeleos-saint-propers.test.js`
**Session context:** memory `project_liturgy_audit_2026_06_17_pm_sundays.md` finding #2

## Purpose

On Sundays (and weekdays) where the principal commemoration is a polyeleos- or vigil-rank saint of a recognized category, the OCA General Menaion appoints a secondary prokeimenon, alleluia, and koinonikon co-sung with the Sunday-cycle propers. Previously these never rendered; the audit on 2026-06-17 caught this on Jul 5 2026 (Uncovering of Relics of Sergius of Radonezh) where OCA reads Tone 7 Ps. 115:6 / Tone 6 alleluia / Ps. 111:6 koinonikon, but the system rendered only the Tone 4 Sunday set.

## Interface

There is no request-side toggle — secondary propers attach automatically when:

1. `calendar-rules.getFeastRank(date)` is `'polyeleos'` or `'vigil'`, AND
2. No Great Feast or Pentecostarion-Sunday override is active for the date, AND
3. The menaion principal commemoration has a `saint_type` (or one inferable from its title) that matches a category in `variable-sources/general-menaion-propers.json`.

The polyeleos saint list is hardcoded in `calendar-rules.js` as `POLYELEOS_SAINTS` (mirroring `VIGIL_SAINTS`); there is no DB rank column, so additions live in code.

## Behavior table

| Day signal | Render shape |
|---|---|
| Polyeleos+ Sunday, recognized category | Sunday prokeimenon + `prok-2-*` (category set) ; Sunday alleluia + `all-2-*` ; Sunday `ch-text` + `ch-2-*` |
| Polyeleos+ weekday, recognized category | Weekday prokeimenon + `prok-2-*` ; weekday alleluia + `all-2-*` ; day-of-week `ch-text` + `ch-2-*` |
| Polyeleos+ day with `cocelebratedOverlay` providing same secondary | Overlay wins (already a complete secondary set; no double-attach) |
| Polyeleos+ day, unrecognized category | No secondary rendered (silent fallthrough) |
| Great Feast or Pentecostarion-Sunday override active | No secondary rendered (feast claims the propers slot) |

## Category coverage (initial)

`variable-sources/general-menaion-propers.json` ships with:
- `monastic` (venerable) + alias `monasticConfessor`
- `hierarch`
- `hieromartyr`
- `martyr` + aliases `martyrs`, `monasticMartyr`, `monasticMartyrs`, `maidenMartyr`
- `apostle` + alias `apostles`
- `prophet`

Deliberately omitted pending source verification: `forerunner`, `unmercenaries`, `theotokos`, `fool`, `cross`, `nun`. Unrecognized categories fall through to Sunday/weekday cycle only.

## Code surface

- `variable-sources/general-menaion-propers.json` — category → `{prokeimenon, alleluia, communionHymn}`. String values resolve transitively (e.g. `"monasticConfessor": "monastic"`).
- `server-lib/sources/propers.js` — loads + resolves aliases; exports `GENERAL_MENAION_PROPERS`.
- `calendar-rules.js` — `POLYELEOS_SAINTS` map + extended `getFeastRank()` returns `'polyeleos'`.
- `server-lib/sources/liturgy-from-orthocal.js` — `inferSaintTypeFromTitle()` falls back when the DB's `saint_type` column is blank (common on "Uncovering / Translation / Repose / Glorification" rows); attaches `.secondary` to prokeimenon, alleluia, communionHymn when the principal saint has a matching category.
- `assemblers/liturgy-parts/readings.js` — already supports `prok.secondary` / `alleluia.secondary`; `assemblers/liturgy-parts/communion.js` already supports `communionHymn.secondary`. No assembler changes were needed.

## Invariants (tested)

- **INV-1** — Polyeleos Sunday with monastic principal (2026-07-05 Sergius): `prok-2-refrain` matches the venerable category text; `prok-2-rubric` carries Tone 7.
- **INV-2** — Same date: `all-2-rubric` carries Tone 6 and `all-2-v0` matches the venerable category first verse.
- **INV-3** — Same date: `ch-2-text` matches the venerable category communion verse.
- **INV-4** — Simple-rank Sunday with no polyeleos+ rank (2026-06-21 Julian of Tarsus): no `prok-2-*` / `all-2-*` / `ch-2-*` blocks render. (Baseline regression check — confirms secondary propers don't leak to non-polyeleos days.)
- **INV-5** — Great Feast Sunday (2026-04-12 Pascha): no `prok-2-*` blocks attached via the polyeleos path even though `getFeastRank` returns `'greatFeast'`. (Confirms the guard `!feast && !pentOverride`.)
- **INV-6** — Righteous polyeleos Sunday (2026-07-26 Repose of St. Jacob Netsvetov): the full secondary set renders — `prok-2-refrain`, `all-2-v0`, `ch-2-text` — via the `righteous` category.
- **INV-7** — `includeSecondKoinonikon` is **tri-state**, not boolean. On 2026-07-26: unset renders `ch-2-text`; `?secondKoinonikon=hide` suppresses it; `?secondKoinonikon=show` renders it. Guards the original defect where the polyeleos-path koinonikon was attached with no gate, making an explicit `false` a silent no-op on every General-Menaion day. `undefined` must stay distinct from `false` — coercing unset to false would drop the saint's Communion Verse for every parish that never set the rubric.

## Verified dates

- 2026-07-05 — Sunday + polyeleos (Sergius uncovering); monastic. INV-1, INV-2, INV-3.
- 2026-06-21 — Sunday + simple-rank (Julian). INV-4.
- 2026-04-12 — Pascha. INV-5.
- 2026-07-26 — Sunday + polyeleos (Repose of St. Jacob Netsvetov); righteous. INV-6, INV-7.

## Keep in sync

Code changes that require updating the behavior table or contract tests:
- `POLYELEOS_SAINTS` map in `calendar-rules.js` — adding/removing dates.
- `general-menaion-propers.json` — adding/removing categories.
- `inferSaintTypeFromTitle` in `server-lib/sources/liturgy-from-orthocal.js`.
- The `isPolyeleos` gate condition (currently `!feast && !pentOverride`).
- The `includeSecondKoinonikon` tri-state in `liturgy-from-orthocal.js` / `api-liturgy.js` — the `overlayKoinonikonOptIn` (explicit-`true`) and `secondKoinonikonAllowed` (not-explicit-`false`) split. Do not collapse either back to `!!`.
- Either `_litReadings*` or `_litCommunionHymn` shape changes that affect how `.secondary` renders.
