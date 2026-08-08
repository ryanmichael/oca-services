# Feature: "Glory to the Father" placement at the antiphons

## Purpose

Rubric **`antiphons.gloryAfterLittleLitany`** (registry id `gloryAfterLittleLitany`).

**Default OFF** — the OCA standard shape, and what every parish gets unless they
opt out:

```
First Antiphon    Ps 102 verses
                  Glory to the Father… now and ever… Amen.
                  Through the intercessions of the Theotokos…
Little Litany
Second Antiphon   Ps 145 verses
                  Now and ever… Amen.
                  Only-begotten Son…
```

**ON** — the doxology moves to the end of the Little Litany:

```
First Antiphon    Ps 102 verses
                  Through the intercessions of the Theotokos…
Little Litany     …
                  Glory to the Father, and to the Son, and to the Holy Spirit.
Second Antiphon   Ps 145 verses
                  Now and ever… Amen.
                  Only-begotten Son…
```

Note the relocated text is the **doxology alone** — "now and ever" is not
duplicated, because it already belongs to the close of the Second Antiphon. The
bare text lives at the fixed-text key `antiphon-glory`.

## Who sings it this way

St. John of Damascus (Tyler). Their choir book carries a separate piece headed
`"Glory . . ." before Psalm 145 (Second Antiphon)` containing only the doxology,
and none at the end of Psalm 102. The choir director confirmed the placement on
2026-08-08: *"The Glory portion goes at the end of the Little Litany section."*

## Assumption worth revisiting

**Only the doxology moves.** The antiphon's refrain still closes the First
Antiphon, and the relocated Glory carries no refrain — which matches the choir
book's Glory piece, that being the doxology alone. The director spoke to the
Glory, not the refrain. If the refrain should travel with it, INV-2 and INV-3
are where to change it.

## Where it lives

- **Text:** `antiphon-glory` in `fixed-texts/liturgy-fixed.json`.
- **Rubric:** `data/rubric-registry.json` → `gloryAfterLittleLitany`. No typed
  column; it lives only in `parish_rubrics` (see below).
- **Suppression:** `_litTypicalAntiphon1` in `assemblers/liturgy-parts/antiphons.js`.
- **Emission:** the typical-antiphon branch of `assemblers/liturgy.js`, after the
  first Little Litany.

## Invariants (tested)

`test/contracts/antiphon-glory-placement.test.js`

- **INV-1** — Default OFF: the First Antiphon keeps "Glory… now and ever…"
  followed by its refrain, and the Little Litany carries no doxology.
- **INV-2** — ON: the First Antiphon has no doxology and closes with its refrain.
- **INV-3** — ON: a bare Glory is the block **immediately before** the Second
  Antiphon begins. Asserted on ordered block position, not section membership —
  there are two Little Litanies, so filtering by section name collects both.
- **INV-4** — ON: "Now and ever" still closes the Second Antiphon, and
  "Only-begotten Son" still follows it.
- **INV-5** — In both states, "Glory to the Father" appears **exactly once**
  across the three sections. Catches both a lost Glory and a doubled one.

## Registry-only rubrics and the settings page

This is the third rubric with **no typed column** on `parish_settings`
(`hoursPrecedeService` and `licNoLeadingRepeat` came first). Before this change
none of the three could be set from the settings page at all — the same
invisibility that hid Tyler's trilingual Trisagion until 660347a.

Two pieces close it:

- **Server** — `handlePostSettings` accepts a `rubric_picks` array and upserts
  via `setRubricPick`, ignoring anything unknown or column-backed.
- **UI** — `renderRegistryRubrics` in `public/scripts/parish-admin.js` renders a
  toggle for every registry rubric that has no `dbColumn`, into
  `[data-rubric-slots="<service>"]`. Column-backed rubrics keep their existing
  hand-written markup and `rubric_*` payload fields; this is additive.

Verified in a real browser: the toggle renders, reflects DB state, round-trips
through save/reload in both directions, and leaves sibling settings untouched.

## Keep in sync

- `antiphon-glory` in `fixed-texts/liturgy-fixed.json`
- `gloryAfterLittleLitany` in `data/rubric-registry.json`
- The suppression in `_litTypicalAntiphon1` and the emission in `liturgy.js` —
  they must move together or the Glory is lost or doubled (INV-5)
- `test/contracts/__snapshots__/rubrics-pre-refactor.json`, which embeds live
  Tyler rubric state
