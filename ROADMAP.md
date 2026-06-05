# Roadmap

Live status tracker for the 90-day plan. The strategy lives in [`ASSESSMENT.md §6`](./ASSESSMENT.md); this doc is the "where are we right now" glance — kept short on purpose.

**Last updated:** 2026-06-05

---

## Current focus

**Phase 2 — Modularize** (Weeks 3–5). Phases A + B + C + D (all 3 PRs) landed. `assembler.js` is now 2,698 lines (down from 5,665 originally — **52% smaller**). 26 functions extracted across 20 files. All 7 leaf services done.

**Next: Phase E — the core trio (vespers, liturgy, matins).** See "Phase E starting brief" below for line numbers, dependency catalog, and recommended sub-PR split. Start a fresh session — the foundation pattern is well-established and the snapshot harness is the safety net.

---

## Weeks 1–2 — Positioning anchor

- [x] Four-lens strategic assessment landed (`ASSESSMENT.md`)
- [x] Design philosophy promoted to root `STYLE.md` (5 durable principles + 10 named anti-patterns)
- [x] README rewritten around multi-jurisdictional pitch; stale 2025-era TODOs removed
- [x] `schema/` directory with first formal JSON schemas (ServiceBlock, CalendarEntry, OverlayManifest) + cross-references from `server.js#validateManifest` and `data-validators.js`
- [x] README Contributing section points at `schema/` as the public data contract

## Weeks 3–5 — Modularize before the next jurisdiction lands

- [x] Sketch `assembler.js` modularization plan → [`docs/refactor-assembler.md`](./docs/refactor-assembler.md) (26 target files, 6-phase migration, snapshot-test safety net)
- [x] Phase A — extracted `assemblers/_shared/` (`make-block`, `warnings`, `resolve`, `fixed-text-loader`); added `audit/snapshot.js` harness + `audit/snapshots/baseline.json` (42 entries byte-identical); harness already caught the `deepGet` near-miss
- [x] Phase B — extracted `assemblers/vespers-parts/` (10 files, 17 functions: opening, litanies, kathisma, lord-i-call, ot-readings, prokeimenon, aposticha, nunc-dimittis, litya, epitaphion). `assembler.js` down to 4,797 lines (15% smaller). Snapshot 42/42 byte-identical first try.
- [x] Phase C — extracted `assemblers/common-parts/` (`troparia.js`, `dismissal.js`). `assembler.js` now 4,710 lines. Cross-family helpers now consumable by Vespers, Matins, Liturgy, Presanctified, Vesperal Liturgy. Snapshot 42/42 byte-identical first try.
- [ ] Phase D — extract 7 leaf services (paschal-hours, midnight-office, royal-hours, paschal-matins, bridegroom-matins, passion-gospels, lamentations) in 2–3 batched PRs
  - [x] PR1: paschal-hours, midnight-office, royal-hours — 328 lines extracted, snapshot 42/42 first try
  - [x] PR2: paschal-matins, bridegroom-matins — 839 lines extracted; snapshot caught two regressions (inline require path + `_emitLittleLitany` shared with passion-gospels); fix shipped `common-parts/emit-little-litany.js`; updated `feedback_grep_all_callers` memory
  - [x] PR3: passion-gospels, lamentations — 852 lines extracted; snapshot caught one regression (`assembleGreatLitany` missing import in lamentations.js — dep-grep regex didn't include vespers-parts names); fix shipped, `_emitLittleLitany` import dropped from assembler.js after passion-gospels move
- [ ] Phase E — extract the core trio (vespers, liturgy, matins)
- [ ] Phase F — extract composed services (presanctified, vesperal-liturgy) + collapse `assembler.js` to a facade
- [ ] Split `server.js` into `routes/`, `overlays/`, `sources/`, `cache/`
- [ ] Playwright smoke tests for 5 canonical user flows (home loads, date pick, service detail panel, search, translation switch)

## Weeks 4–7 (parallel) — Old-Style calendar variant

- [ ] Design doc: `style: 'new' | 'old'` axis through `calendar-rules.js`
- [ ] Paschalion algorithm decision (Julian vs. Gregorian for Pascha-dependent cycles)
- [ ] Implementation + audit-rule extension (A-family)
- [ ] Cross-jurisdictional contract tests (ROCOR + Serbian sample dates)

## Weeks 6–8 — First AI pipeline (LLM-assisted menaion authoring)

- [ ] Pick test date with both an OCA DOCX and an existing menaion JSON
- [ ] Prompt + strict JSON schema for structured output
- [ ] Single-date prototype: Claude Sonnet 4.6 → diff vs. hand-authored
- [ ] Wrap as `audit/llm-judge.js`-style pipeline with a provenance hook (per `STYLE.md` §5)
- [ ] Close the 2026 menaion gap

## Weeks 8–12 — Killer choir feature

- [ ] "For our choir this week" dashboard wireframe
- [ ] Printable export with parish overlay applied
- [ ] Recruit 5 founding choir directors across 5 jurisdictions

## Throughout — Distribution

- [ ] Draft bishop letter + private-demo deck (hold until `schema/` lands)
- [ ] Seminary outreach (St. Tikhon's / SVS / Holy Cross — liturgics course integration)
- [ ] Ancient Faith Radio podcast inquiry
- [ ] r/OrthodoxChristianity post about the open schema

---

## Notes / Blockers

- **2026-06-05** — Phase 1 complete; `schema/` landed, so the bishop letter and seminary inquiry are now unblocked. Drafts can link to `schema/README.md` as the substantive contributor surface.
- **2026-06-05** — `assembler.js` refactor sketch landed. Phase A (extract `_shared/`) is the next concrete move once decision points in `docs/refactor-assembler.md` § "Decision points for review" are confirmed.
- **2026-06-05** — Phase A complete. Six decision points in the sketch confirmed as recommended (flat layout, facade preserved, `{ reset, push, get }` warnings API, snapshot bundled, no variant dispatch yet, 3-batched-PR plan for Phase D). `audit/snapshots/baseline.json` is the authoritative byte-level reference for subsequent phases — refresh it as part of any commit that legitimately changes service output.
- **2026-06-05** — Pre-existing audit gap surfaced (not refactor-caused): `npm run audit` reports 25 high-severity findings (10 missing Sunday Matins sections, 8 eothinon mismatches, 4 Matins section-ordering, 3 Liturgy translation-consistency). All in code paths Phase A did not touch (snapshot byte-identical on the 42 reference entries that include several of the same flagged dates). These should be triaged separately — either fixed at the source or added to `audit/known-issues.json` `knownFailures` with rationale.
- **2026-06-05** — Phase B complete. Followed the `grep_all_callers` rule from Phase A: anchor-check script verified the 12 deletion-range boundaries before any code moved, and the kathisma file collision with root `kathisma.js` was caught at design time via the explicit `require('../../kathisma')` path. Single commit, no regressions.
- **2026-06-04** — Long-running research agents hit socket timeouts during the assessment work; broke the research into smaller parallel queries instead. Pattern to remember for future deep-research sessions.

---

## Phase E starting brief (as of commit `5c2292a`, 2026-06-05)

What remains in `assembler.js` (2,698 lines, 5 top-level assemblers + 46 private helpers):

| Function | Lines (approx) | Size | Helpers to move with it |
|---|---|---|---|
| `assembleVespers` | 69–~167 | ~100 | none — just orchestration over vespers-parts |
| `assembleLiturgy` | 180–1358 | ~1180 | 37 `_lit*` helpers (lines 422–1298) |
| `assemblePresanctified` | 1376–~1492 | ~120 | composes vespers + 7 `_ps*` helpers (1496–1597) |
| `assembleVesperalLiturgy` | 1633–1843 | ~210 | composes vespers + liturgy parts |
| `assembleMatins` | 1872–2682 | ~810 | 2 helpers: `_assembleCanon` (L2474), `_assembleMorningLitany` (L2653) |

Recommended sub-PR split — apply the same Phase D batching rhythm:

- **Phase E PR1 — vespers** (smallest, fastest): extract `assemblers/vespers.js`. Probably ~3 hours.
- **Phase E PR2 — liturgy + `liturgy-parts/`** (biggest): extract `assemblers/liturgy.js` plus the 37 `_lit*` helpers into a `liturgy-parts/` subdirectory grouped by service section (antiphons, beatitudes, trisagion, prokeimenon, epistle, alleluia, gospel, anaphora, communion, dismissal, etc.). Consider grouping per related sections (e.g., `liturgy-parts/communion.js` for all communion-related helpers). Probably 1 full day.
- **Phase E PR3 — matins + `_assembleCanon`**: extract `assemblers/matins.js` and the two private helpers. Probably ~4 hours.

Phase F afterward:

- **Phase F PR1 — presanctified + `_ps*` helpers**: extract `assemblers/presanctified.js` + 7 `_ps*` helpers. ~2 hours.
- **Phase F PR2 — vesperal-liturgy**: extract `assemblers/vesperal-liturgy.js`. ~2 hours.
- **Phase F PR3 — facade collapse**: `assembler.js` becomes `module.exports = require('./assemblers');`. Add `assemblers/index.js` that re-exports the 12 + `resolveSource`. ~1 hour.

**Lessons baked in from Phases A–D** (read these before starting Phase E):

- `memory/feedback_grep_all_callers.md` — grep ALL identifiers in the function body before extracting; check underscore-prefixed private helpers physically adjacent to the target; check inline `require('./fixed-texts/...')` paths.
- For the dep-grep regex, include vespers-parts function names too: `(assembleOpening|assemblePsalm103|assembleGreatLitany|assembleLittleLitany|assembleAugmentedLitany|assembleEveningLitany|assembleKathisma|assembleBlessedIsTheMan|assembleKathismaReading|assembleLordICall|assembleOTReadings|assembleProkeimenon|assembleAposticha|assembleNuncDimittis|assembleLitya|assembleBlessingOfBread|assembleEpitaphion|assembleTroparia|assembleDismissal|_emitLittleLitany)`. The PR3 lamentations regression happened because `assembleGreatLitany` wasn't in the original regex.
- Always: `npm run snapshot:verify` after restart, before declaring victory. 42/42 byte-identical is the gate.
- `audit/snapshots/baseline.json` is the authoritative reference. If a legitimate behavior change ships, refresh the baseline in the same commit with a note.
- The snapshot harness has caught a regression in **every Phase D PR**. Don't skip it.

**Verification gate to keep running** (already enforced by pre-push hook):
- `npm test` — 109/109 pass
- `npm run snapshot:verify` — 42/42 byte-identical
- `npm run audit:quick` — 0/0/0 strict
- `npm run audit:endpoints` — should hold at 11 pre-existing low-sev items

## How to use this doc

- Check items off as commits land. Reference the phase in commit messages — e.g., `Phase 3 modularize: extract assemblers/vespers.js`.
- Update the **Current focus** callout when shifting between phases.
- If a checkbox has not moved in **14 days**, the item is implicitly deprioritized. Reframe it, defer it, or remove it — do not let dead items accumulate.
- If this doc grows past ~100 lines, that is the signal to graduate to GitHub Issues / Projects.
- Strategy decisions belong in `ASSESSMENT.md`. This doc is status only.
