# Feature: Vigil/Polyeleos weekday feast suppresses daily-cycle Liturgy propers

**Status:** shipped 2026-06-28 (commit `e2488fc`)
**Contract test:** `test/contracts/weekday-feast-suppresses-daily-propers.test.js`
**Closing audit rules:** `audit/rules/D-structure/L25-weekday-feast-suppresses-daily-propers.js`, `audit/rules/D-structure/L26-feast-epistle-gospel-symmetry.js`
**Session context:** audit of 2026-06-29 SS Peter and Paul Liturgy; memory `MEMORY.md` (this date)

## Purpose

On a Vigil- or Polyeleos-rank saint that falls on a weekday (i.e. not Sunday, and not one of the 12 Great Feasts of the Lord/Theotokos which take their own dedicated `feast` branch), OCA practice is that the saint's propers **REPLACE** the daily/weekday cycle rather than layering as `.secondary`:

- **Prokeimenon**: saint's prokeimenon is primary; no Monday-Angels / Tuesday-Forerunner / etc. daily refrain.
- **Alleluia**: saint's alleluia is primary; no daily alleluia.
- **Epistle**: feast epistle becomes primary; daily epistle dropped.
- **Gospel**: feast Gospel becomes primary; daily Gospel dropped.
- **Communion Hymn**: saint's koinonikon replaces the day-of-week koinonikon.
- **Dismissal**: `dayPatron` commemoration ("bodiless Powers of Heaven" on Monday, etc.) is suppressed; `dismissal.opening` reads `'feast'`.

Before this fix (audit 2026-06-28), tomorrow's SS Peter and Paul (Mon, vigil) on 2026-06-29 rendered the Mon-Angels weekday prokeimenon + alleluia + koinonikon as **primary**, with the feast as `.secondary` — and the feast Gospel (Matt 16:13-19, Peter's Confession) was **missing entirely** because the secondary-Gospel slot is gated behind a per-parish opt-in.

## Interface

No request-side toggle. Activation is purely a function of date + style:

```js
const isWeekdayGreatSaintFeast =
     !isSunday
  && (feastRank === 'vigil' || feastRank === 'polyeleos')
  && !feast        // not a 12-Great-Feast date (those take the dedicated `feast` branch)
  && !pentOverride // not a Pentecostarion-Sunday override
```

See `server-lib/sources/liturgy-from-orthocal.js` (after the `pickPrimaryAndSecondary` calls).

## Behavior table

| Day signal | Render shape |
|---|---|
| Vigil/Polyeleos weekday, principal has recognized category | Saint prokeimenon/alleluia/koinonikon as **primary**. Daily cycle entirely suppressed. Feast epistle + Gospel as primary readings. |
| Vigil/Polyeleos weekday, principal has **unrecognized** category | Safety fallback to the day-of-week daily prokeimenon/alleluia/koinonikon. (Better to render the daily than nothing.) Track gap in `variable-sources/general-menaion-propers.json` `_coverageNote`. |
| Vigil/Polyeleos **Sunday** | Sunday cycle stays primary; saint propers attach as `.secondary`. Same behavior as before. |
| Great Feast (e.g. Theophany, Annunciation) on any day | `feast` branch handles propers; this gate doesn't fire. |
| Ordinary weekday (no vigil/polyeleos rank) | Daily cycle renders normally. |

## Invariants (pinned by contract test)

| ID | Invariant |
|---|---|
| INV-1 | On 2026-06-29 (Mon, Peter and Paul, vigil), Liturgy prokeimenon's FIRST hymn is the feast prokeimenon (Tone 8, "Their proclamation has gone out…"), NOT the Monday-Angels daily prokeimenon (Tone 4, "Who maketh His angels spirits…"). |
| INV-2 | On 2026-06-29, Liturgy Gospel section contains the feast Gospel (Matt 16:13-19, "Whom do men say that I the Son of man am?"), NOT the daily-Monday Gospel (Matt 12:9-13). |
| INV-3 | On 2026-06-29, Liturgy Communion Hymn renders the apostles' koinonikon ("Their proclamation…"), NOT the Mon-Angels koinonikon ("He maketh His angels spirits…"). |
| INV-4 | On 2026-06-29, priestly dismissal does NOT name "bodiless Powers of Heaven" (the dayPatron[monday] commemoration); it goes straight from the Theotokos to "Holy Apostles Peter and Paul". |
| INV-5 | On 2026-06-24 (Wed, Forerunner Nativity, vigil) — the General Menaion Prophet common prokeimenon ("Thou, O Lord, shalt keep us…") renders via the interim forerunner→prophet alias, not the Wednesday-Theotokos daily. **NOT canonical** — the proper Forerunner Nativity prok is Luke 1:76 "And thou, child, shalt be called the prophet of the Most High"; the alias is an approximation pending per-date proper-overrides. Pinned to detect drift from the interim state; the test text will change when the canonical override lands. |
| INV-6 | On an ordinary weekday (e.g. 2026-06-22 Monday, no vigil/polyeleos rank), the daily Monday-Angels prokeimenon DOES render normally (gate must not over-fire). |
| INV-7 | On a polyeleos Sunday (e.g. 2026-07-05 Sergius), Sunday cycle stays primary and the saint propers attach as secondary (existing `polyeleos-saint-propers` behavior is preserved — this gate doesn't override Sundays). |

## Implementation pointers

- `server-lib/sources/liturgy-from-orthocal.js`:
  - Flag computed after `pickPrimaryAndSecondary(epistleAll/gospelAll, principalTitle)`.
  - Epistle/Gospel slot-flip: `[epistleR, epistleR2] = [epistleR2, null]` when daily is first and feast-co-celebrated is second.
  - Prokeimenon/Alleluia/Koinonikon cascades gate the WEEKDAY_PROKEIMENA fallback behind `!isWeekdayGreatSaintFeast`; gmp promotion `if (gmp && !prokeimenon && isWeekdayGreatSaintFeast)` makes the saint propers primary; safety fallback to daily cycle when gmp is null.
  - Dismissal: `opening: (feast || isWeekdayGreatSaintFeast) ? 'feast' : …`, `dayPatron: isWeekdayGreatSaintFeast ? null : …`.

## Related

- [polyeleos-saint-propers](polyeleos-saint-propers.md) — the Sunday/secondary path this new behavior extends.
- `general-menaion-propers.json` `_coverageNote` — the `forerunner → prophet` alias is an interim approximation; see note for canonical Forerunner texts pending per-date proper-override design.

## Follow-up: per-date proper-override mechanism

The category-alias mechanism cannot express feast-specific propers when the same saint has different category-of-the-day across feasts (Forerunner: Nativity uses Luke 1:76 prok; Beheading uses Martyr common). Authoring a `FEAST_SPECIFIC_PROPERS` map keyed by `MM-DD` that beats the saint_type lookup would close this. Affected dates (initial scope):

| Date | Feast | Canonical OCA propers source |
|---|---|---|
| 6-24 | Nativity of Forerunner | Luke 1:76 prok, own alleluia & koinonikon |
| 8-29 | Beheading of Forerunner | Martyr common (Tone 4 "Precious in the sight of the Lord") |
| 10-1 | Pokrov | Theotokos-feast propers (not in any common) |
| 5-21 | Constantine & Helen | own propers (equal-to-apostles) |
| 1-30 | Three Hierarchs | own propers (hierarchs-plural specifics) |
| 8-15 | Dormition | Theotokos-feast propers (currently handled via `GREAT_FEAST_VARIANTS`) |

Source for authoring: OCA Festal Menaion + Festal Menaion of Bishop Kallistos translation. Until done, interim alias + safety fallback are the documented behavior.
