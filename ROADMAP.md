# Roadmap

Live status tracker for the 90-day plan. The strategy lives in [`ASSESSMENT.md §6`](./ASSESSMENT.md); this doc is the "where are we right now" glance — kept short on purpose.

**Last updated:** 2026-06-05

---

## Current focus

**Phase 2 — Modularize** (Weeks 3–5). Phases A + B landed. `assembler.js` is now 4,783 lines (down from 5,665 originally — 16% smaller). All 17 Vespers building-block functions moved cleanly to `assemblers/vespers-parts/`. Snapshot 42/42 byte-identical first try. Next: Phase C — extract `common-parts/` (`assembleTroparia`, `assembleDismissal`).

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
- [x] Phase B — extracted `assemblers/vespers-parts/` (10 files, 17 functions: opening, litanies, kathisma, lord-i-call, ot-readings, prokeimenon, aposticha, nunc-dimittis, litya, epitaphion). `assembler.js` down to 4,783 lines (16% smaller). Snapshot 42/42 byte-identical first try.
- [ ] Phase C — extract `assemblers/common-parts/` (`troparia`, `dismissal`)
- [ ] Phase D — extract 7 leaf services (paschal-hours, midnight-office, royal-hours, paschal-matins, bridegroom-matins, passion-gospels, lamentations) in 2–3 batched PRs
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

## How to use this doc

- Check items off as commits land. Reference the phase in commit messages — e.g., `Phase 3 modularize: extract assemblers/vespers.js`.
- Update the **Current focus** callout when shifting between phases.
- If a checkbox has not moved in **14 days**, the item is implicitly deprioritized. Reframe it, defer it, or remove it — do not let dead items accumulate.
- If this doc grows past ~100 lines, that is the signal to graduate to GitHub Issues / Projects.
- Strategy decisions belong in `ASSESSMENT.md`. This doc is status only.
