---
name: liturgy-propers-wire
description: Wire a second set of Divine Liturgy propers (prokeimenon / alleluia / Gospel / koinonikon / Beatitude troparia) onto the base cycle for a movable or fixed feast that carries its own Liturgy set layered on the Sunday or weekday propers. Use when the user (or the LLM judge) finds a feast's second propers missing, half-rendered, or only the second Epistle coming through.
---

# Liturgy second-propers wiring workflow

Some days carry a **second complete set of Liturgy propers** layered on top of the base Sunday/weekday cycle: Sunday of the Holy Fathers, Lenten commemoration Sundays, polyeleos+ saints, co-celebrated feasts. The recurring failure is partial rendering — **only the second Epistle comes through**, because orthocal supplies it and the epistle builder emits `.secondary` unconditionally, while the prokeimenon / alleluia / Gospel / koinonikon / Beatitudes are each behind a separate gate and stay unwired.

The canonical worked example this codifies is Sunday of the Holy Fathers (commits `5496343` + `db06164`, rule `L39`, memory `[[project_holy_fathers_sunday_propers_2026_07_19]]`). Read it before wiring a new feast.

## Default mode: PLAN FIRST, EDIT SECOND

This skill writes code + data + a closing rule + a contract test. **Present the full wiring plan and get a go-ahead before editing** — a mis-detected feast leaks propers onto the wrong day (silent blast radius across every year).

Plan output ends with:

> Ready to wire. Reply "go" to make the edits, or tell me what to change in the plan.

## The `.secondary` layering model — know it cold

Base-cycle propers are objects (`prokeimenon`, `alleluia`, `communionHymn`, `gospelR`). A second set attaches as a **`.secondary` block on the same object**, never as a replacement. Consumers render base then `.secondary`.

- **Epistle** is the trap: `epistleR2` is emitted `.secondary` **unconditionally** from orthocal. So "the Epistle works but nothing else does" is the signature of an un-wired feast — not evidence the others are fine.
- **Gospel** `gospelR2` is behind the `includeSecondGospel` gate. Your detector must force it past the gate (see the `holyFathersSunday || lentenKey ∈ 1..5` disjunction at `liturgy-from-orthocal.js:704`).
- **Prokeimenon / alleluia / koinonikon** each attach only if `!x.secondary` already — so general-menaion-propers and Lenten paths don't collide. Attach yours in the same guarded style (`liturgy-from-orthocal.js:507, 605, 648`).

## The five wiring steps

### 1. Detector — key off orthocal, not the principal title
Add a boolean like `holyFathersSunday` in `server-lib/sources/liturgy-from-orthocal.js`. Conditions that have proven necessary:
- Gate on `isSunday` / `dow` as the feast requires.
- Exclude Great Feasts (`!feast`) and Pentecostarion overrides (`!pentOverride`) unless the feast IS one.
- Match the feast from **orthocal feasts + principal title** via a specific regex (`/fathers\b.*\bcouncil/i`), narrow enough to exclude look-alikes (Nativity Forefathers, Paschal Fathers Sunday).
- **Place the detector BEFORE the readings pick.** If it fires, you may need to *force the principal commemoration* (see landmine below), so it cannot run after `pickPrimaryAndSecondary`.

### 2. Data — author the propers into the right source file
| Feast shape | File | Export |
|---|---|---|
| One specific movable/fixed feast | `variable-sources/daily-propers.json` → named block | e.g. `HOLY_FATHERS_PROPER` from `propers.js` |
| A whole saint *category* (polyeleos+ by type) | `variable-sources/general-menaion-propers.json` (alias-resolvable) | `GENERAL_MENAION_PROPERS` |
| A Great Feast | `variable-sources/great-feast-variants.json` | `GREAT_FEAST_VARIANTS` |
| A date-keyed substitution / co-celebration | `variable-sources/cocelebrated-overlays.json` | `COCELEBRATED_OVERLAYS` |

Cite the source in the block's `_meta` (OCA/Lambertsen order, saintjonah.org `lit_*` id). Follow the OCA co-celebrated layout convention: a secondary prokeimenon renders **rubric + refrain only, no verse**.

### 3. Attach — mirror the guarded pattern
For each of prokeimenon / alleluia / communionHymn: `if (detector && x && !x.secondary && DATA?.x) x = { ...x, secondary: DATA.x }`. For the Gospel, add the detector to the `gospelR2` gate disjunction.

### 4. Beatitudes (if the feast has an Ode-3 Beatitude set)
- Author the canon into `variable-sources/feast-canons/<feast>.json` with `beatitudesReplaceGloryNow: true` (drops the Octoechos Glory+Theotokion tail so the count lands exactly, e.g. 6 Resurrectional + 4 feast = "on 10").
- Movable feasts have no M-D key — pass the feast name through `buildBeatitudesTroparia`'s `feastCanonName` param.
- Tag each Beatitude block with `source: 'octoechos' | 'feast'` for provenance — the closing audit rule reads it.

### 5. Close the regression class — rule + contract (mandatory)
- **Audit rule** in `audit/rules/D-structure/L<NN>-<feast>-secondary-propers.js`. Critical discipline: **detect the feast from a signal INDEPENDENT of the code path you're guarding** — L39 keys off the DB-sourced troparion/kontakion label, not the propers wiring. Assert the full second set present (≥2 prokeimena/alleluia/Gospels/koinonika + N feast-source Beatitude troparia).
- **Contract test** in `test/contracts/` asserting the invariants across both instances of the feast (e.g. July Six-Councils AND October Seventh-Council Sundays share one propers set — test both dates).

## Landmine — the stichera-richness principal picker

The menaion principal-saint picker ranks by stichera count. If a DB stichera move (e.g. a mis-key sweep) shifts which commemoration holds the most stichera, the picker can elevate the *wrong* saint as Liturgy principal — flipping troparion/kontakion/readings and contradicting the propers you just wired. Fix seen in `db061646`: when the detector fires, **force the feast's commemoration as principal** so troparia/kontakia and the secondary readings resolve correctly regardless of stichera count. See `[[project_principal_saint_picker_2026_06_20]]`.

## Verification (all required before "done")

```bash
npm run audit:date -- <date>          # green on THIS instance
npm run audit:date -- <other-date>    # AND the feast's other instance (July + Oct, etc.)
npm run audit:judge -- <date>         # N findings → 0
npm run test:contracts                # new + existing (esp. L27 Lenten 2nd-Gospel unbroken)
```

Regression watch: your `gospelR2`-gate edit can break a sibling second-Gospel path (Lenten weeks 1-5, parish `includeSecondGospel`). Confirm those still render.

## Model routing (cheaper bias)

| Sub-task | Model | Why |
|---|---|---|
| Authoring the propers JSON from a cited OCA source, running audit/judge/contract commands, wiring the mechanical `.secondary` attach lines once the plan is set | **Haiku 4.5** | Transcription + running tooling against a decided plan. |
| Detector regex + placement, forcing-the-principal decision, gate disjunction edits, Beatitude count convention, writing the independent-signal audit rule | **Sonnet 5** | Liturgical-structural judgment; the whole point is not leaking propers onto a look-alike day. |
| "What propers does this feast actually take?" for a feast with no prior worked example / conflicting sources | **Opus 4.8** — escalate only this | Genuine liturgical-correctness ambiguity where a wrong set is wrong every year. |

## Pointers

- Consumption + attach sites: `server-lib/sources/liturgy-from-orthocal.js` (detector ~L290, attaches L507/605/648, Gospel gate L704)
- Constants/exports: `server-lib/sources/propers.js`
- Worked example: commits `5496343` (wire) + `db06164` (force principal); rule `audit/rules/D-structure/L39-holy-fathers-sunday-secondary-propers.js`; memory `[[project_holy_fathers_sunday_propers_2026_07_19]]`
- Sibling patterns: Lenten Sunday secondary propers (`ca707d0`, rule L27), polyeleos-saint propers (`test/contracts/polyeleos-saint-propers.test.js`), weekday-feast suppression (rule L25/L26)
- Audit rule families + severities: `audit/rules/`, `audit/validation.md`
