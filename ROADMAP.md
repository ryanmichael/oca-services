# Roadmap

Live status tracker for the 90-day plan. The strategy lives in [`ASSESSMENT.md §6`](./ASSESSMENT.md); this doc is the "where are we right now" glance — kept short on purpose.

**Last updated:** 2026-06-05

---

## Current focus

**Phase 2 — Modularize** (Weeks 3–5). `assembler.js` modularization sketch landed at [`docs/refactor-assembler.md`](./docs/refactor-assembler.md) — pending review. After sign-off on the six decision points there, Phase A (extract `_shared/`) is a discrete first move.

---

## Weeks 1–2 — Positioning anchor

- [x] Four-lens strategic assessment landed (`ASSESSMENT.md`)
- [x] Design philosophy promoted to root `STYLE.md` (5 durable principles + 10 named anti-patterns)
- [x] README rewritten around multi-jurisdictional pitch; stale 2025-era TODOs removed
- [x] `schema/` directory with first formal JSON schemas (ServiceBlock, CalendarEntry, OverlayManifest) + cross-references from `server.js#validateManifest` and `data-validators.js`
- [x] README Contributing section points at `schema/` as the public data contract

## Weeks 3–5 — Modularize before the next jurisdiction lands

- [x] Sketch `assembler.js` modularization plan → [`docs/refactor-assembler.md`](./docs/refactor-assembler.md) (26 target files, 6-phase migration, snapshot-test safety net)
- [ ] Phase A — extract `assemblers/_shared/` (`makeBlock`, warnings, `resolveSource`, fixed-text loader)
- [ ] Phase B — extract `assemblers/vespers-parts/`
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
- **2026-06-04** — Long-running research agents hit socket timeouts during the assessment work; broke the research into smaller parallel queries instead. Pattern to remember for future deep-research sessions.

---

## How to use this doc

- Check items off as commits land. Reference the phase in commit messages — e.g., `Phase 3 modularize: extract assemblers/vespers.js`.
- Update the **Current focus** callout when shifting between phases.
- If a checkbox has not moved in **14 days**, the item is implicitly deprioritized. Reframe it, defer it, or remove it — do not let dead items accumulate.
- If this doc grows past ~100 lines, that is the signal to graduate to GitHub Issues / Projects.
- Strategy decisions belong in `ASSESSMENT.md`. This doc is status only.
