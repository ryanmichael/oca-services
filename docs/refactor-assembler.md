# Refactor sketch — `assembler.js` modularization

Design doc for the Phase 2 refactor in [`ROADMAP.md`](../ROADMAP.md). **No code changes yet.** This sketch is the artifact reviewed before any function is moved.

**Status:** Draft. Awaiting review.

## Why now

`assembler.js` is 5,665 lines in a single file. It has been comprehensible to the founder because he wrote every line; it will not be comprehensible to a contributor at month six, and it will be actively hostile when Greek and Antiochian variants need to land alongside the current OCA assembler. The Phase 2 trigger condition from `ASSESSMENT.md` §3 is "modularize *before* the next jurisdiction lands, not after."

The cost of splitting is a few days of careful, audit-verified mechanical extraction. The cost of *not* splitting is paid every time anyone — including future-you — needs to find, change, or test a specific service's logic, and it compounds with each jurisdiction added.

## Current shape

### Top-level exports (12 services + 1 utility)

| Function | Line | Service |
|---|---|---|
| `assembleVespers` | 56 | Daily / Great / All-Night-Vigil Vespers |
| `assembleLiturgy` | 1114 | Divine Liturgy of St. John Chrysostom |
| `assemblePresanctified` | 2323 | Liturgy of the Presanctified Gifts |
| `assemblePaschalHours` | 2566 | Paschal Hours (Bright Week) |
| `assembleMidnightOffice` | 2649 | Midnight Office |
| `assemblePaschalMatins` | 2756 | Paschal Matins (Bright Week) |
| `assembleBridegroomMatins` | 2986 | Bridegroom Matins (Holy Mon/Tue/Wed) |
| `assemblePassionGospels` | 3613 | Twelve Passion Gospels (Holy Thu eve) |
| `assembleLamentations` | 4124 | Lamentations (Holy Fri eve) |
| `assembleVesperalLiturgy` | 4469 | Vesperal Liturgy of St. Basil |
| `assembleRoyalHours` | 4691 | Royal Hours (Nativity / Theophany / Holy Fri) |
| `assembleMatins` | 4838 | Daily / Sunday / Festal / Polyeleos / Doxology Matins |
| `resolveSource` | 447 | Generic source lookup utility (also used by `server.js`) |

### Vespers building blocks (shared by Vespers + Presanctified + Vesperal Liturgy)

Lines 159–1082. Used by all services that include a Vespers segment.

```
assembleOpening         assemblePsalm103         assembleGreatLitany
assembleLittleLitany    assembleKathisma         assembleBlessedIsTheMan
assembleKathismaReading assembleLordICall        assembleOTReadings
assembleProkeimenon     assembleAugmentedLitany  assembleEveningLitany
assembleAposticha       assembleNuncDimittis     assembleTroparia
assembleLitya           assembleBlessingOfBread  assembleDismissal
assembleEpitaphion
```

`assembleTroparia` and `assembleDismissal` are used by *all* services, not just Vespers — they belong in a more general shared module rather than `vespers-parts`.

### Matins-private helpers

| Function | Line | Note |
|---|---|---|
| `_assembleCanon` | 5440 | The canon-rendering core (handles `irmos`, `troparia`, `secondCanon`, joint two-canon dates) |
| `_assembleMorningLitany` | 5619 | Morning litany of completion |

### Module-level state (the hidden contract)

```js
let _warnings = [];   // line 54 — reset at the start of every top-level assemble
```

This is the most fragile thing in the file. Every top-level service resets `_warnings = []`, accumulates warnings during assembly, and (presumably) flushes them somewhere. Extracting this safely is the precondition for every other extraction.

### Module imports

```js
const { getPsalter, psalmBody, resolveVerse } = require('./oca-psalter');
```

The only external require. Fixed-text JSON files are lazy-loaded inside getter functions (`getKathismata`, `getVespersFixed`, `getMatinsFixed`) — that pattern stays.

### `makeBlock` lives mid-file

```js
function makeBlock(id, section, type, speaker, text, extras = {}) { ... }   // line 2298
```

The factory for every ServiceBlock. Bizarrely placed (the file has ~2,300 lines of code above it that call it). First thing to extract.

---

## Target layout

```
assemblers/
  _shared/
    make-block.js         // makeBlock (the ServiceBlock factory)
    warnings.js           // reset / push / get — explicit API replacing module-level state
    resolve.js            // resolveSource, resolveFixedRef
    fixed-text-loader.js  // getKathismata, getVespersFixed, getMatinsFixed (lazy)
  vespers-parts/          // shared Vespers segments — used by Vespers, Presanctified, Vesperal Liturgy
    opening.js            // assembleOpening, assemblePsalm103
    litanies.js           // assembleGreatLitany, assembleLittleLitany, assembleAugmentedLitany, assembleEveningLitany
    kathisma.js           // assembleKathisma, assembleBlessedIsTheMan, assembleKathismaReading
    lord-i-call.js        // assembleLordICall
    ot-readings.js        // assembleOTReadings
    prokeimenon.js        // assembleProkeimenon
    aposticha.js          // assembleAposticha
    nunc-dimittis.js      // assembleNuncDimittis
    litya.js              // assembleLitya, assembleBlessingOfBread
    epitaphion.js         // assembleEpitaphion
  common-parts/           // segments used cross-family (not Vespers-specific)
    troparia.js           // assembleTroparia
    dismissal.js          // assembleDismissal
  vespers.js              // assembleVespers
  matins.js               // assembleMatins + _assembleCanon + _assembleMorningLitany
  liturgy.js              // assembleLiturgy
  presanctified.js        // assemblePresanctified
  paschal-matins.js       // assemblePaschalMatins
  paschal-hours.js        // assemblePaschalHours
  midnight-office.js      // assembleMidnightOffice
  bridegroom-matins.js    // assembleBridegroomMatins
  passion-gospels.js      // assemblePassionGospels
  lamentations.js         // assembleLamentations
  vesperal-liturgy.js     // assembleVesperalLiturgy
  royal-hours.js          // assembleRoyalHours
  index.js                // re-exports the 12 top-level functions + resolveSource

assembler.js              // thin facade: module.exports = require('./assemblers');
```

26 files. The file *count* is higher; the file *size* drops everywhere — no file over ~1,000 lines, most under 300. Each per-service file is grep-discoverable by name.

### Why this shape

- **One service per top-level file.** Matches how anyone (founder, contributor, future-AI) looks for a service — they search "matins" or "liturgy" and find one file.
- **`vespers-parts/` exists because three services compose Vespers segments.** Extracting these into a directory makes the composition explicit (`require('../vespers-parts/lord-i-call')`) rather than implicit (calling sibling functions in the same megafile).
- **`common-parts/` is small but real.** `assembleTroparia` and `assembleDismissal` belong somewhere neutral; they aren't Vespers-specific.
- **`_shared/` carries the load-bearing primitives.** Anything in `_shared/` is foundational; changes there ripple.
- **`assembler.js` stays as a facade.** Zero-disruption to `server.js` and `render.js` imports. After the move stabilizes, the facade can be removed in a separate, deliberate PR.

---

## The `_warnings` migration

Today:

```js
// assembler.js
let _warnings = [];

function assembleVespers(...) {
  _warnings = [];
  // ... accumulates via _warnings.push(...) inside helpers
}
```

After:

```js
// assemblers/_shared/warnings.js
let _warnings = [];
module.exports = {
  reset()    { _warnings = []; },
  push(w)    { _warnings.push(w); },
  get()      { return _warnings.slice(); },
};

// assemblers/vespers.js
const warnings = require('./_shared/warnings');
function assembleVespers(...) {
  warnings.reset();
  // ... helpers call warnings.push(...)
}
```

The explicit API replaces hidden module state. Same behavior, contractually clearer. **Critical:** since `_warnings` is shared across the request lifecycle today and Node modules are singletons, this preserves current behavior (single-process server, no concurrent assemblies). If the project ever moves to per-request workers or worker threads, swap `_shared/warnings.js` to use `AsyncLocalStorage`. Out of scope for this refactor.

---

## Future jurisdiction variants (deferred, sketched only)

Do **not** add the variant-dispatch layer in this refactor. Add it the moment Greek (or Antiochian) lands and needs to differ from OCA. The shape, when needed, will be:

```js
// assemblers/vespers.js  (future, when GOA Vespers ships)
const oca = require('./variants/vespers-oca');
const goa = require('./variants/vespers-goa');

const VARIANTS = { oca, goa };

function assembleVespers(calendarDay, fixedTexts, sources, opts = {}) {
  const variant = VARIANTS[opts.jurisdiction] || VARIANTS.oca;
  return variant(calendarDay, fixedTexts, sources);
}

module.exports = assembleVespers;
```

Today's `vespers.js` is just the OCA implementation. When the second variant is needed, the file is renamed `variants/vespers-oca.js` and the dispatch sits on top. Predictable, deferred until it's actually needed.

---

## Migration order

Six phases. Each phase is a single PR. Each PR must keep `npm test` (109 tests) and `npm run audit:quick` (365 dates strict) green; no merge otherwise.

### Phase A — Extract `_shared/` (zero-risk)
1. Create `assemblers/_shared/{make-block,warnings,resolve,fixed-text-loader}.js`
2. Move `makeBlock`, `_warnings` (via the new `warnings.js` API), `resolveSource`, `resolveFixedRef`, the three lazy getters
3. In `assembler.js`, replace inline definitions with requires from `_shared/`
4. Re-export `resolveSource` from the facade so `server.js` keeps working
5. Run `npm test`, `audit:quick`, `audit` — all green
6. Commit: `Phase 2 modularize: extract assemblers/_shared/ (make-block, warnings, resolve, fixed-text-loader)`

**Verification:** Module-level `_warnings = []` is gone from `assembler.js`. All 109 tests pass. No behavioral diff.

### Phase B — Extract `vespers-parts/`
1. Create the 10 files under `assemblers/vespers-parts/`
2. Move the Vespers building-block functions (`assembleOpening` through `assembleEpitaphion`, minus `assembleTroparia` and `assembleDismissal` which go to `common-parts/`)
3. Update `assembler.js`'s `assembleVespers`, `assemblePresanctified`, `assembleVesperalLiturgy` to require from `vespers-parts/`
4. Run full audit (`npm run audit`) — 365 × {vespers, presanctified, vesperal-liturgy}
5. Commit: `Phase 2 modularize: extract vespers-parts/`

### Phase C — Extract `common-parts/`
1. Create `assemblers/common-parts/{troparia,dismissal}.js`
2. Move `assembleTroparia` and `assembleDismissal`
3. Update all 12 top-level assemblers to require from `common-parts/`
4. Run full audit
5. Commit: `Phase 2 modularize: extract common-parts/ (troparia, dismissal)`

### Phase D — Extract leaf services (one PR each, or batched 3-at-a-time)

Order, easiest first:
1. `paschal-hours.js` — small, few deps
2. `midnight-office.js` — small, few deps
3. `royal-hours.js` — medium, mostly self-contained
4. `paschal-matins.js` — larger but isolated
5. `bridegroom-matins.js`
6. `passion-gospels.js`
7. `lamentations.js`

Each extraction:
- Move the function and any private helpers
- Add explicit requires for `_shared`, `common-parts`, `vespers-parts`
- Update `assembler.js` to require from the new file
- Run `npm test` + `audit:quick`
- Commit: `Phase 2 modularize: extract <service>.js`

### Phase E — Extract the core trio (most-used services)

In order:
1. `vespers.js`
2. `liturgy.js`
3. `matins.js` (also moves `_assembleCanon` and `_assembleMorningLitany`)

These are extracted last because they have the most dependents. By Phase E, `vespers-parts/` and `common-parts/` are already extracted, so `vespers.js` is a clean lift.

### Phase F — Extract the composed services + facade

1. `presanctified.js`, `vesperal-liturgy.js` — these compose Vespers parts + Liturgy parts; extract once both are stable
2. Create `assemblers/index.js` that re-exports the 12 + `resolveSource`
3. Replace `assembler.js` body with `module.exports = require('./assemblers');`
4. Run full audit + LLM judge on 5 canonical dates spanning seasons (Pascha, Theophany, Lenten Saturday, ordinary Sunday, Pentecost) — verify byte-identical output
5. Commit: `Phase 2 modularize: collapse assembler.js into a facade over assemblers/`

---

## Safety net

The existing audit infrastructure is what makes this refactor safe:

- **`npm test`** — 109 contract tests including per-feast Matins contracts. Must stay 100% green.
- **`npm run audit:quick`** — 365 dates × vespers strict. Pre-push hook already enforces.
- **`npm run audit`** — ~208 dates × 8 services. Run before each extraction PR.
- **`npm run audit:endpoints`** — 11 pre-existing low-sev items; must not grow.
- **`npm run audit:judge -- <date>`** — LLM judge for semantic regression. Run on 5 canonical dates after Phase F.

**Additional safety move recommended for this refactor:** add a `npm run snapshot` script that captures `/api/{service,matins,liturgy,presanctified,...}?date=<canonical-date>` JSON output to `audit/snapshots/<phase>/`. After each phase, re-snapshot and diff. Any non-empty diff means the extraction changed behavior — investigate before merging.

A minimal version: a Bash script with 12 `curl` commands writing to files in a phase-numbered directory, then `diff -r` between phases. ~30 lines, no new dependencies.

---

## What changes for callers

For `server.js`, `render.js`, and any test:

**Before:**
```js
const { assembleVespers, assembleMatins, resolveSource } = require('./assembler');
```

**After (facade preserved):**
```js
const { assembleVespers, assembleMatins, resolveSource } = require('./assembler');
// Identical. Works because assembler.js re-exports from assemblers/.
```

**After (direct, if preferred later):**
```js
const { assembleVespers, assembleMatins } = require('./assemblers');
const { resolveSource } = require('./assemblers/_shared/resolve');
```

The facade buys us zero-disruption to the rest of the codebase. We can remove it in a follow-up PR after the dust settles.

---

## What this unblocks

After Phase F lands:

1. **Jurisdiction variants.** Adding `variants/vespers-goa.js` is a clean, scoped change rather than a `+500/-50` diff inside a 6,000-line file.
2. **Contribution from anyone other than the founder.** A contributor can fix a Lamentations bug without holding the whole project in their head.
3. **AI-augmented edits.** Asking an LLM to "modify the Lord I Call assembly" is feasible when the file is 200 lines, infeasible when it's 5,665.
4. **Code review by an LLM judge.** The audit:judge harness could plausibly be pointed at a per-file diff once files are small enough.
5. **Per-service test fixtures.** Each `assemblers/<service>.js` gets its own focused test file, replacing the all-in-one smoke suite over time.

---

## Risks

1. **Subtle behavior change during extraction.** The snapshot script + LLM judge are the defense. If a snapshot diff appears, investigate root cause; do not "accept the diff" without understanding.
2. **`_warnings` extraction breaks something subtle.** The warnings module's `reset()` must be called by every top-level assemble before any helper runs. Easy to miss in Phase E during the big extractions. The defense: the snapshot tests would catch a change in warning emission patterns (warnings affect what audit:date surfaces).
3. **Circular requires.** `vespers-parts/lord-i-call.js` might end up needing `common-parts/troparia.js`, which might need `_shared/...`. Node handles cycles ungracefully. Defense: keep the dependency direction strictly downward (`vespers.js` → `vespers-parts/` → `common-parts/` → `_shared/`), never sideways or upward.
4. **Lazy-loaded fixed texts have a getter-cache pattern.** `getVespersFixed()` caches the parsed JSON in module scope. Moving this to `_shared/fixed-text-loader.js` preserves the singleton (Node module cache), but be alert to any test that monkey-patches the loader.
5. **The `audit/llm-judge.js` system prompt may need updating.** It references "the assembled output of a service-text generator." If the *interface* doesn't change (which it shouldn't, since we kept the facade), the judge keeps working. Verify with a smoke run after Phase F.

---

## Estimated effort

| Phase | What | Time |
|---|---|---|
| A | `_shared/` extraction | 2–3 hours |
| B | `vespers-parts/` | 3–4 hours |
| C | `common-parts/` | 1 hour |
| D | 7 leaf services | 1–2 hours each → 10–14 hours total (can batch into 2–3 PRs) |
| E | Vespers + Liturgy + Matins (the core trio) | 4–6 hours total |
| F | Composed services + facade | 2–3 hours |
| **Total** | | **22–32 focused hours, spread across 6–10 commits** |

This is a 3–4 day refactor for one person working focused, or a 1.5–2 week elapsed-time refactor at evening-and-weekend pace.

---

## Decision points for review

Before any code moves, the following choices should be confirmed:

1. **Module layout: 26 files (proposed) vs grouping by liturgical family (alternative).** Proposed = flat, predictable. Family-grouped = fewer files, but Holy Week services (Bridegroom + Passion Gospels + Lamentations + Royal Hours + Paschal Matins) get clustered which doesn't match their actual code-dependency shape.
2. **`assembler.js` as facade vs. delete-and-update-all-imports.** Facade chosen for zero-disruption. Alternative: rip the bandaid in one PR — touches `server.js`, `render.js`, all test files. More work, cleaner final state. Recommend facade now, delete later.
3. **`_warnings` module API: `{ reset, push, get }` (proposed) vs. pass through as a parameter.** Proposed preserves current behavior. Parameter-passing would be cleaner functional style but invasive. Recommend proposed.
4. **Snapshot script: add as part of Phase A, or out-of-band tool.** Recommend bundling with Phase A — same PR introduces the snapshot harness, generates the pre-refactor baseline, then every subsequent phase verifies against it.
5. **Jurisdiction-variant dispatch: confirm we are *not* adding it in this refactor.** Sketch only; will be added when GOA or Antiochian code actually exists to dispatch to.
6. **Phase D batching: one PR per service (7 PRs) vs three batched PRs.** Recommend batched (3 PRs of 2–3 services each) — reviewer fatigue is real, and the per-service diffs are tiny and repetitive.

Once these are settled, Phase A becomes a concrete piece of work.

---

## Out of scope for this refactor

- Splitting `server.js` (separate Phase 2 item; depends on no part of this)
- Adding Playwright smoke tests (separate Phase 2 item)
- Touching `calendar-rules.js` (separate Phase 3 item)
- Changing any service output (this is a pure refactor; output must be byte-identical)
- Adding TypeScript or any type-system overlay
- Switching to ESM modules

---

## Next action

Review this sketch. Confirm or revise the six decision points above. After alignment, Phase A is a discrete, low-risk piece of work and should be done in a single sitting.
