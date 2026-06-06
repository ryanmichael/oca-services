# Roadmap

Live status tracker for the 90-day plan. The strategy lives in [`ASSESSMENT.md §6`](./ASSESSMENT.md); this doc is the "where are we right now" glance — kept short on purpose.

**Last updated:** 2026-06-06 (Phase 3 COMPLETE)

---

## Current focus

**Phase 2 + Phase 3 — Modularize COMPLETE.** All 12 phases (Phase 2 A–F + Phase 3 A–F) shipped. `assembler.js` is a 12-line facade (5,665 → 12 lines, −99.8%); `server.js` is a 22-line facade (5,375 → 22 lines, −99.6%). Repo is structurally ready for per-jurisdiction variants AND for routing/cache/translation changes that previously had to land inside a 5K-line `handleRequest`.

**Audit triage shipped 2026-06-05** (`821d3ec`). 25 high-sev findings → 9 real Sunday-Matins coverage gaps. Fixed at source: getEothinon Triodion/Pentecostarion suspension, 2 YY→TT data fixes, M2 audit rule false-positive. Suppressed 8 as documented knownFailures (Pascha, feast-overrides, plural-object false positive). See [[reference-audit-triage-2026-06-05]] for the remaining gap list + recommended fix path.

**Next:** the 9 Sunday-Matins gaps are the most tractable next pass — each one needs `matins.gospel` + Great Doxology wired into a specific Sunday calendar entry. After that: Old-Style calendar variant (Weeks 4–7), `server.js` split, or jurisdiction work.

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
- [x] Phase E — extracted the core trio (vespers, liturgy, matins) in 3 batched PRs
  - [x] PR1: `assemblers/vespers.js` — 100 lines, no helper deps; snapshot 42/42 first try
  - [x] PR2: `assemblers/liturgy.js` + 11-file `assemblers/liturgy-parts/` (opening, antiphons, entrance, trisagion, readings, litanies, great-entrance, anaphora, communion, thanksgiving, dismissal); 37 `_lit*` helpers extracted; 15 still imported by Presanctified/Vesperal-Liturgy; snapshot 42/42 first try
  - [x] PR3: `assemblers/matins.js` — assembleMatins + `_assembleCanon` + `_assembleMorningLitany`; snapshot 42/42 first try
- [x] Phase F — extracted composed services (presanctified, vesperal-liturgy) + collapsed `assembler.js` to a facade
  - [x] PR1: `assemblers/presanctified.js` — assemblePresanctified + 7 `_ps*` helpers; snapshot 42/42 first try
  - [x] PR2: `assemblers/vesperal-liturgy.js` — no own helpers, just composition; snapshot 42/42 first try
  - [x] PR3: `assemblers/index.js` (28 lines) re-exports the 12 + `resolveSource`; `assembler.js` → 12-line facade; all 4 external callers (server.js, render.js, test-matins.js, test-assembly.js) keep working unchanged
- [x] Split `server.js` into `routes/`, `overlays/`, `sources/`, `cache/`, `assemble/`, `render/`, `boot/` — **Phase 3 COMPLETE** ([sketch](./docs/refactor-server.md), 6 phases A–F)
  - [x] Phase A — `server-lib/_shared/` (loadJSON, html, parse-query, serve-static); 9954ad9; snapshot 42/42 first try; server.js 5,375 → 5,342
  - [x] Phase B — `server-lib/overlays/` (8 files: registry/manifest/extends-chain/drift/cascade/rubrics/diff/provenance); 598a812; snapshot 42/42; server.js 5,342 → 4,962 (−380)
  - [x] Phase C — `server-lib/sources/` (9 files) + `server-lib/cache/` (2 files); matins-spec kept whole; sources param threaded through buildMatinsSpec; 22a5c61; snapshot 42/42; server.js 4,962 → 3,125 (−1,837)
  - [x] Phase D — `server-lib/assemble/` (pronouns + day-label + for-date) + `server-lib/render/` (home + error + service + dashboard); 2bcbb01; snapshot 42/42; server.js 3,125 → 2,114 (−1,011)
  - [x] Phase E — `server-lib/routes/` (27 endpoint files + dispatcher); ctx-pass model; 2453754; snapshot 42/42 + 12/12 non-snapshot endpoints byte-match; server.js 2,114 → 268 (−1,846)
  - [x] Phase F — `server-lib/boot/load-fixed.js` bundles the 134-line boot block into `boot()`; `server-lib/index.js` public surface; 75c5bc3; snapshot 42/42 + 12/12 endpoints; server.js 268 → 22 (−246, **5,375 → 22 total, −99.6%**)
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
- **2026-06-05** — Phase E complete (PRs 1–3 in one session, commits `97f1789`, `fe8af1f`, `16051a2`). 3 batched PRs landed back-to-back; each passed 42/42 snapshot, 109/109 tests, 0/0/0 audit first try. No regressions. `assembler.js` down to 579 lines. Pattern observation: with helpers already extracted (vespers-parts, common-parts), each leaf assembler extraction is mechanical — the dep-grep regex and snapshot harness make these PRs low-risk in series.
- **2026-06-05** — Phase F complete (PRs 1–3 in same session, commits `0e69de8`, `0b929fc`, `2379045`). All 3 PRs clean first try. `assembler.js` → 12 lines (facade); `assemblers/index.js` → 28 lines (public API). External callers untouched. **Phase 2 modularize DONE.** From 5,665 → 12 lines over A through F. Pattern observation for future big-bang refactors: snapshot harness + per-PR helper-extraction + namespace re-export at the end is the durable pattern. Caller surface stays stable; internal physics moves freely.
- **2026-06-05** — Audit triage shipped (`821d3ec`). 25 high-sev findings → 9 real coverage gaps. 4 root-cause fixes (getEothinon Triodion/Pentecostarion suspension, YY→TT in two data files, M2 audit rule false-positive against Kathisma 7 Psalm 50 verses) + 8 documented knownFailures. Pattern observation: the audit suite is sensitive enough to expose both real bugs and rule misfires — when a finding is suppressed, the reason must be precise enough that a future reader can re-evaluate it.
- **2026-06-04** — Long-running research agents hit socket timeouts during the assessment work; broke the research into smaller parallel queries instead. Pattern to remember for future deep-research sessions.

---

## Phase 2 — final layout

`assembler.js` (12 lines) → `assemblers/index.js` (28 lines, the public API) → 12 top-level assembler modules + 4 helper directories:

```
assemblers/
  index.js                                       # public API
  _shared/                                       # 4 primitives
    {make-block, warnings, resolve, fixed-text-loader}.js
  vespers-parts/                                 # 10 vespers section helpers
  common-parts/                                  # 3 cross-family helpers
  liturgy-parts/                                 # 11 liturgy section helpers
  vespers.js, liturgy.js, matins.js              # core trio
  presanctified.js, vesperal-liturgy.js          # composed
  paschal-hours.js, midnight-office.js,          # leaf services
  royal-hours.js, paschal-matins.js,
  bridegroom-matins.js, passion-gospels.js,
  lamentations.js
```

The snapshot harness (`audit/snapshots/baseline.json`, 42 entries, byte-identical reference) underwrote the entire refactor. It caught regressions in every Phase D PR. For any future structural change to assembler internals, keep that gate green.

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
