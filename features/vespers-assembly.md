# Feature: Vespers Assembly Contract

**Status:** spec extracted 2026-06-16 from the Vespers-hardening session (commits `aef1f6f`, `a3b0e8c`, `3156bb0`, `8139b3f`, `4a68d1f`).
**Contract test:** `test/contracts/vespers-assembly.test.js`
**Audit rules:** `audit/rules/D-structure/D1`–`D7`
**Last verified:** 5841b91
**Session context:** memory `project_sat_eve_vespers_glory_now`, `project_lenten_saturday_troparion_dup`

## Purpose

The Vespers assembly pipeline (HTTP route → calendar entry → injection → renderer) has accumulated seven invariants that govern *correctness* — not behavior of any single feature, but the contract every Vespers response must satisfy. These were learned the hard way: the four bugs fixed in this session all passed `npm test`, smoke tests, and contract tests for individual features, because no one had codified the assembly-shape contract itself.

This file is that contract. Each invariant is verified by a contract test and (where data-shape lets us) an audit rule.

## Interface

**HTTP route:** `GET /api/service?date=YYYY-MM-DD[&translation=<overlay>][&style=new|old][&pronoun=tt|yy]`

**Date semantics:** API `date` is the *civil evening* the Vespers is sung; content comes from the *next* liturgical day's calendar entry. Burial Vespers (Holy Friday afternoon) is the documented exception.

## Pipeline

```
api-service.js  (route — civil date in)
  ↓ vespersDate = isBurialVespers ? date : nextDateStr(date)
generateCalendarEntry(vespersDate, style)  in calendar-rules.js
  ↓ dispatches to one of ~13 season×dow×rank generators
spec: { vespers: { lordICall, prokeimenon, aposticha, troparia, ... } }
  ↓
assembleForDate  in server-lib/assemble/for-date.js
  ↓ Pentecostarion Sunday LIC override
  ↓ Menaion injection — LIC / Aposticha / Troparia / Litya
  ↓ Build dismissal spec
  ↓
assembleVespers  in assemblers/vespers.js
  ↓ per-section renderers in assemblers/vespers-parts/*
ServiceBlock[]
```

## Load-bearing conventions

These aren't preferences; they're invariants the rest of the system relies on.

- **`octoechos.json` weekday Vespers keys are sung-evening, not liturgical.** Wed-eve content lives at `tone${N}.wednesday.vespers.*`. `calendar-rules.js` exports `VESPERS_SUNG_EVE` (liturgical-dow → sung-eve-dow) precisely for this; every weekday generator must thread it through octoechos key lookups *and* the prokeimenon-table lookup.
- **`prokeimena.json.weekday.*` is keyed by the day Vespers is sung,** matching the OCA office structure. The same `VESPERS_SUNG_EVE` mapping applies.
- **Tone of the week for Sat Great Vespers** uses the tone of the week that is *ending* (the preceding Sunday's tone), not the upcoming Sunday's. Real liturgical rule, not a bug.
- **`combinesGloryNow` semantics.** Set on `lordICall.glory` or `aposticha.glory`. `true` means the spec wants `Glory ... now and ever` as a single doxology, absorbing the Theotokion slot (canonical: Tone 5 Sat Great Vespers dogmatikon). `false` (or unset) means a separate `Glory` and `Now and ever` doxology; the spec must also populate the corresponding `now` slot. The renderer skips the `now` slot when `combinesGloryNow` is true (see `assemblers/vespers-parts/lord-i-call.js:90`).
- **Triodion-vs-Menaion glory ownership.** When the calendar entry ships a `position:'glory'` troparia slot (Lenten Saturdays: Theodore + Soul Saturdays 2–4 ship the Triodion's saint as Glory), the Menaion-injection layer must NOT splice an additional Glory — Triodion wins.

## Invariants (tested)

Each `INV-*` below corresponds to a named test in `test/contracts/vespers-assembly.test.js` and, where applicable, a `D*-*` rule in `audit/rules/D-structure/`.

- **INV-1** — Vespers date-shift. API `?date=YYYY-MM-DD` serves the calendar entry for `nextDateStr(date)`. The response's `vespersDate` field exposes this.
- **INV-2** — Weekday evening prokeimenon is keyed by `VESPERS_SUNG_EVE[liturgicalDow]`, not raw `liturgicalDow`. Wed-eve (civil) → liturgical Thursday → `weekday.wednesday` → Tone 5 "Save me, O God". Guarded by `D1-vespers-prokeimenon-weekday`.
- **INV-3** — Weekday Daily Vespers LIC with a Menaion doxastichon renders: 6 stichera → separate `Glory` doxology → Menaion doxastichon (in saint's tone) → separate `Now and ever` doxology → Theotokion (Octoechos LIC `theotokion` at sung-eve day, in week tone). Guarded by `D2-vespers-lic-theotokion`.
- **INV-4** — Weekday Daily Vespers Aposticha with a Menaion doxastichon renders: 3 stichera + verses → `Glory` doxology → Menaion doxastichon (in saint's tone) → `Now and ever` doxology → Theotokion (Octoechos aposticha `theotokion` at sung-eve day, **in tone of the Glory** — not week tone). Guarded by `D4` (tone match) and `D6` (presence).
- **INV-5** — Weekday Daily Vespers Troparia with a Menaion troparion renders: saint's troparion (un-positioned; no preceding `Glory`) → `Now and ever` doxology → Resurrectional Dismissal Theotokion (Octoechos `tone${tropTone}.saturday.vespers.dismissalTheotokion`, in tone of the troparion). Guarded by `D3` (trailing Theotokion) and `D5` (no leading Glory).
- **INV-6** — Vigil-rank feast Troparia (`serviceType: 'all-night-vigil'`): troparion preceded by a "sung thrice" rubric, sung 3×, with NO trailing `Now and ever` / Theotokion (the `repeatThrice` filter in the troparia renderer drops `position:'now'` and `position:'glory'` slots).
- **INV-7** — Lenten Saturday with a Triodion-supplied Glory troparion: the section renders exactly one `Glory` block. The Menaion-injection layer detects the pre-existing `position:'glory'` slot from the Triodion and skips its own splice.
- **INV-8** — Multi-saint Sunday Great Vespers: a commemoration's `order < 0` stichera are the Now-and-ever slot, never a numbered sticheron. The combine in `for-date.js` renumbers only `order >= 1`; `order === 0` is the Glory. Renumbering a negative row into the run costs the saint a slot — 2026-08-09 sang the Afterfeast's "In Thy goodness" as a numbered sticheron and dropped St. Herman's third Tone-8 sticheron off the end. Guarded by `test/contracts/afterfeast-buries-polyeleos-saint.test.js` INV-4.
- **INV-9** — When a saint outranks an afterfeast/forefeast (so the feast window is NOT the principal), the concluding-Troparia `Now and ever` slot takes the **Feast's own troparion**, not the Octoechos resurrectional dismissal Theotokion. Applies to both the Great-Vespers shape (splice branch) and the Daily-Vespers shape (empty-slots branch). Detected via `FEAST_CYCLE_TITLE` in `menaion-principal.js` — deliberately narrower than `MOVEABLE_CYCLE_TITLE` (Afterfeast/Forefeast/Leavetaking/Midfeast/Postfeast only), since Pascha and the Lenten Sundays are feast-only services whose hymns come from the Triodion/Pentecostarion rather than a Menaion row. Only 4 dates in the fixed calendar reach this branch (5-06, 8-09, 9-16, 12-20). Guarded by `test/contracts/afterfeast-buries-polyeleos-saint.test.js` INV-9.

## Code surface

- `server-lib/routes/api-service.js` — HTTP route + date-shift.
- `calendar-rules.js` — `generateCalendarEntry` dispatcher + 13 per-season generators + the `VESPERS_SUNG_EVE` table.
- `server-lib/assemble/for-date.js` — Pentecostarion override + Menaion injection (LIC / Aposticha / Troparia / Litya).
- `assembler.js` → `assemblers/vespers.js` → `assemblers/vespers-parts/*` — section-by-section rendering.
- `variable-sources/octoechos.json`, `prokeimena.json` — the variable data the spec references.
- `audit/rules/D-structure/D1`–`D7` — structural-shape regression coverage.

## Edge cases & follow-ups

- **Holy Week DAY_CONFIG prokeimena hardcoded** (`calendar-rules.js:1014–1041`). Mon–Thu entries key off liturgical day, not sung-eve. Same off-by-one shape as the five sites fixed under commit `aef1f6f` but deliberately left until verified against an OCA Holy Week order source. Tracked as 4 `D1` known-failure entries in `audit/known-issues.json`.
- **LIC Theotokion tone is week-tone, not Glory-tone** (unlike Aposticha — INV-4). Slavic strict rubric is to draw the LIC Theotokion from the Menaion appendix in the tone of the Glory; we have only the week-tone Octoechos version. This is a known content gap — when the Menaion appendix theotokia are indexed, INV-3 should be revised.
- **Pentecostarion weekday LIC** still collapses Glory+Now in some cases when the DB feast doxastichon at `${litKey}.vespers.lordICall.glory` doesn't resolve (renderer fall-back). Surfaced in the 2026-05-13 audit walk; not in this contract's scope.
- **Custom calendar entries** (`variable-sources/calendar/YYYY-MM-DD.json`) bypass `generateCalendarEntry` and must hand-author the right shape themselves. The `D-structure` rules audit them just the same.

## Verified dates

- 2026-06-17 (Wed eve → Thursday) — Leontius of Tripoli, simple-rank weekday saint. INV-1 through INV-5 path.
- 2026-06-15 / 16 / 18 — Sun/Mon/Thu eve, varied Menaion saints — same INV-3 / INV-4 / INV-5 path with different sung-eve mappings.
- 2026-01-29 (Three Hierarchs Vigil) — INV-6 path.
- 2026-02-27 (St Theodore Saturday) — INV-7 path.
- 2026-06-13 (Sat eve → NA Saints Sunday) — Sat-eve Great Vespers regression check; non-empty-slots path through Troparia injection.

## Keep in sync

Code changes that require updating the invariants and contract tests:

- `VESPERS_SUNG_EVE` table or any of its consumers (`calendar-rules.js` generators, `for-date.js`).
- The `combinesGloryNow` semantics or the LIC/Aposticha glory/now slot handshake in `for-date.js` injection.
- Troparia injection branch logic in `for-date.js` (empty-slots vs. has-glory-slot vs. has-no-glory-slot).
- New `D-structure` audit rules — add a corresponding INV if the rule asserts a contract-level shape.
- Holy Week `DAY_CONFIG` prokeimena values (will flip INV-2 from civil-eve-only to civil-eve-plus-Holy-Week-exception).
- Custom `variable-sources/calendar/YYYY-MM-DD.json` entries that intentionally violate an INV (rare — add to `audit/known-issues.json` with a reason).
