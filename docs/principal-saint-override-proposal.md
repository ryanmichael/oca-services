# Proposal: Parish-Configurable Principal-Saint Selection

**Status:** Proposal (2026-07-08). Prompted by the July 12 booklet audit
([[project_july_booklet_audit]]): our render picks **Proclus** as principal;
the parish booklet elevates **Michael of Maleinus**.

## TL;DR

This is **not a picker bug.** Our `pickPrincipalByOrthocalOrder` correctly
follows OCA/orthocal (July 12: orthocal `saints[0]` = "Martyrs Proclus and
Hilary"; Michael of Maleinus is not in orthocal's list at all). The **parish
diverges from OCA** — a legitimate local/traditional ranking difference with **no
single objectively-correct answer** (both are simple saints sharing a 3+3 LIC;
whoever gets the Glory doxastikon + primary troparion is a local choice).

So the fix is a **per-parish per-date principal override**, not a picker rewrite.
A systematic rank-aware picker is the documented landmine (broke 50+ afterfeast
days; the parked branch estimates "56 collision days"). Reject it.

## Problem, precisely

On a multi-saint day, exactly one commemoration becomes `primary` and supplies:
- Vespers: LIC stichera + **Glory doxastikon**, aposticha + Glory, **troparion**
- Liturgy/Matins: **troparion + kontakion** (others only if the
  `includeLesserSaints` rubric is on)

`primary` = `pickPrincipalByOrthocalOrder(ranked.notable, orthocal, ranked.principal)`,
wired into **all three** render paths (`for-date.js:115`, `matins-spec.js:656`,
`liturgy-from-orthocal.js:271`) and mirrored by audit rule
`A2-saint-aligns-orthocal.js`. It picks by orthocal title order — correct for OCA.

**Two coupled gaps** the audit exposed on July 12:
1. **Selection:** parish wants Michael principal; OCA/orthocal (and thus we) pick
   Proclus. There is no rank signal to change this (the `rank` column is NULL for
   all 2,638 commemorations, and orthocal omits Michael) — and we *shouldn't*
   change the default, because the OCA default is correct for OCA.
2. **Coverage:** both 1404 (Proclus) and 1405 (Michael) have **0 stichera** (only
   troparion+kontakion). So even with the right principal, the LIC/aposticha Glory
   fall to the **generic General-Menaion fallback**, not the saint's proper
   doxastikon. Picker and coverage are coupled *for the doxastikon*; decoupled for
   troparion/kontakion (those are present and render correctly).

## Options

| Option | What | Verdict |
|---|---|---|
| **A. Systematic rank-aware picker** | Populate `rank` across 2,638 saints (from orthocal, season-aware) + make the picker respect it | **Reject.** The landmine — broke 50+ afterfeast/forefeast days before; high blast radius across 3 services + A2; and it wouldn't even match the parish (OCA ranks Proclus first). No single-right-answer to encode. |
| **B. Global per-date override** | The parked `feature/afterfeast-principal-override` branch: hand-curated `PRINCIPAL_OVERRIDES` map `'M-D'→title` | **Partial.** Right shape, but (a) *global* — changes it for every parish, wrong for a *local* choice; (b) **Vespers-only** (doesn't touch Matins/Liturgy). |
| **C. Per-parish per-date override** *(recommended)* | Parish declares `{ "7-12": "Michael Maleinos" }`; applied after the orthocal picker in all 3 services | **Recommend.** Default stays OCA-correct; parishes opt in per date; reuses parish-overlay + rubric-registry + temple-patron precedent; low blast radius (opt-in). |

## Recommended design (Option C)

1. **DRY the hook.** Promote the parked branch's `applyPrincipalOverride(mm, dd,
   candidates, primary, overrides)` into `menaion-principal.js` and call it in **all
   three** paths (Vespers/Matins/Liturgy) — the parked branch only wired Vespers.
   Search `ranked.all` (not just `notable`) so a saint with no troparion is
   reachable. This is a single shared insertion after the picker.
2. **Make overrides parish-scoped.** Store `{ "M-D": "<title substring | commId>" }`
   per parish. Cleanest home: the parish manifest / `parish_settings` via the rubric
   registry (`data/rubric-registry.json` + `server-lib/parishes/`), mirroring how the
   **temple patron** (`patron_natural_key`) already resolves a per-parish
   commemoration. Resolve the override to a commemoration on that (mm,dd); if it
   doesn't match, no-op (safe).
3. **Keep a small GLOBAL default map too** (the parked Euphemia 9-16 case) for
   overrides that are objectively-correct-but-orthocal-misses, applied to everyone;
   parish overrides layer on top.
4. **Guard audit rule A2.** `A2-saint-aligns-orthocal` asserts principal ∈ orthocal
   saints; a parish override to a saint orthocal omits (Michael) would trip it.
   Fix: A2 validates the **base** (un-overridden) pick — parish overrides are
   intentional local divergences, so exclude them (or allowlist per parish). The
   base pick stays orthocal-aligned, so A2 stays meaningful.
5. **Pair with coverage (for the doxastikon).** For the override to render the
   saint's *proper* Glory/stichera (not generic fallback), that saint needs menaion
   propers. July 12 Michael has 0 stichera → needs coverage. This links to the
   parked menaion ingest ([[project_myrrhbearers_intake]] / the OCANWA-vs-Lambertsen
   question). Troparion/kontakion already render, so the override *alone* fixes the
   Liturgy troparion/kontakion and the Vespers troparion immediately — only the
   *doxastikon* waits on coverage.

## Phasing

- **Phase 1 — override plumbing (contained, ~1 session).** DRY `applyPrincipalOverride`
  into `menaion-principal.js`; wire all 3 services; land the global default map;
  guard A2. Ship the parked Euphemia case correctly across all services. No parish
  config yet. Validate: Euphemia 9-16 principal across Vespers/Matins/Liturgy; A2
  green; existing dates unchanged.
- **Phase 2 — parish config (~1 session).** Add per-parish override storage (rubric
  registry + parish_settings) + resolver; add `{ "7-12": "Michael Maleinos" }` for
  St. John of Damascus (Tyler). Validate the Tyler render picks Michael's
  troparion/kontakion; other parishes unchanged.
- **Phase 3 — doxastikon coverage (couples to menaion ingest).** Add Michael's (and
  peers') menaion stichera so the overridden principal renders a proper Glory, not
  generic fallback. Blocked on the menaion-source decision (OCANWA vs Lambertsen).

## Effort / risk

- **Phase 1–2: moderate, low risk.** Override is opt-in; default behavior unchanged;
  the parked branch is a working starting point; reuses parish-overlay infra.
- **Phase 3: larger, coupled** to the parked menaion ingest.
- **Contrast Option A** (rank-aware picker): high risk, high blast radius, the
  documented landmine. Do not.

## Open questions

1. Override key granularity — per-(mm,dd) is enough for fixed saints; do we ever need
   per-*year*/movable overrides? (Start fixed-date only.)
2. Should a parish override also flip **which saints' stichera** render (not just the
   doxastikon/troparion)? On July 12 the parish sings *both* saints' stichera (3+3) —
   so this is really "elevate Michael to the Glory/troparion slot," not "replace
   Proclus." The override should set the *doxastikon/troparion owner*, and coverage
   should provide *both* saints' stichera. Worth confirming against more booklets.
3. Confirm A2's allowlist strategy with the nightly calendar-drift cron.
