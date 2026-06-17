# Handoff — Start Here

> **Status: v0.1, working draft.** Maintained under back-fill-on-touch — every architectural decision should update the relevant section here in the same change. Sections marked **⚠ load-bearing** must not bit-rot; sections marked *informational* can drift more freely.

This is the doc to read first if you're picking up this project cold. It frames what's here, what's load-bearing, and what the non-obvious risks are. After this, the other docs (`FEATURES.md`, `CLAUDE.md`, `ROADMAP.md`, `ASSESSMENT.md`, `STYLE.md`) read in any order.

---

## What this is

A web application that generates daily Orthodox Christian service texts (Vespers, Matins, Divine Liturgy, and special services) for any date, served via an HTTP API with HTML rendering. Production runs at `https://oca-services-production.up.railway.app/`. Multi-jurisdictional by design: a parish overlay declares its tradition (OCA, ROCOR, Antiochian, etc.) plus per-parish customizations, and the assembler composes the right text for the date + overlay combination.

The hard problem here is not engineering — it's *liturgical correctness*. The service text on any given date is determined by half a dozen interacting axes: the day of the week, the tone of the week (an 8-week cycle), the moveable Paschal/Pentecostarion calendar, the fixed Menaion (saints) calendar, the rank of the day's principal commemoration, parish-specific overlays, jurisdiction defaults, and a long list of season-specific substitutions. The codebase exists to encode those interactions.

---

## ⚠ Load-bearing: the data model

Three layers, conducted by a calendar entry.

1. **Service Structure** — `service-structure/*.json`. The ordered skeleton of each service. Each block is either `fixed` (points into the fixed-texts layer) or `variable` (declares how to resolve content at runtime).
2. **Fixed Texts** — `fixed-texts/*.json`. All invariable content (e.g., Trisagion, Creed, Lord's Prayer). Accessed via dot-notation keys.
3. **Variable Sources** — `variable-sources/`. The "liturgical books": Octoechos, Menaion, Triodion, Pentecostarion, day-of-the-week defaults, feast-specific overrides.

**The Calendar Entry** for a given date is the conductor — `variable-sources/calendar/YYYY-MM-DD.json` when one exists, otherwise generated dynamically by `calendar-rules.js`. It specifies the liturgical season, weekly tone, all commemorations for the day ranked by priority, and for each service section: which source(s) to draw from, how many stichera, in what order, with which tone.

**The Assembler** — `assembler.js` is a 12-line facade that delegates to per-service modules in `assemblers/` (`liturgy.js`, `vespers.js`, `matins.js`, etc.) and per-section sub-modules in `assemblers/liturgy-parts/`. It takes `(calendarDay, fixedTexts, sources)` and returns an ordered array of `ServiceBlock` objects with the shape declared in `schema/`.

If you're going to make one diagram in your head, make it this one: calendar entry → assembler → ServiceBlock[].

---

## ⚠ Load-bearing: where to look for what

| You want to | Look in |
|---|---|
| Find a feature's spec and behavior | `FEATURES.md` (index) → `features/<name>.md` (spec + invariants) |
| Understand the calendar/rubrical rules | `CLAUDE.md`, `STYLE.md`, the `Liturgical Glossary` in `CLAUDE.md` |
| See the strategic posture | `ASSESSMENT.md` (four-lens audit + 90-day plan) |
| See current phase/status | `ROADMAP.md` |
| Audit a specific date | `audit/LITURGY-AUDIT-CHECKLIST.md` |
| Find regression tests for a feature | `test/contracts/<name>.test.js` (named after the feature) |
| Find broad smoke tests | `test/smoke.test.js`, `test/old-style.test.js` |
| Find data-validation rules | `data-validators.js`, `audit/rules/A`–`F` |
| Find the formal JSON schemas | `schema/` (`ServiceBlock`, `CalendarEntry`, `OverlayManifest`) |
| See what's tracked as backlog | `ROADMAP.md` (active), GitHub issues if any |

---

## ⚠ Load-bearing: conventions that must survive

These aren't preferences; they're invariants the rest of the system relies on. Departing from any of them silently weakens the safety net.

- **Default push target is `staging`, not `main`.** `main` is prod; promotions are explicit (`git merge staging --ff-only && git push origin main`). Railway watches both branches and deploys on push.
- **Feature contracts ship in the same commit as the implementation.** Any feature whose behavior a user might verify against a parish service gets `features/<name>.md` + `test/contracts/<name>.test.js`. Back-fill existing features on touch, not in a bulk pass. See `FEATURES.md § Coverage policy`.
- **Memory in sync with commits.** Where a `features/*.md` exists, the corresponding memory file is a pointer only — never duplicate the spec content.
- **Audit rules + smoke tests + contract tests are three layers, not redundant.** Audit rules sweep many dates for structural drift in *data*; smoke tests assert *broad assembler+API* shape; contract tests assert *per-feature behavior*. Don't collapse them.
- **DB writes go through `sqlite3` CLI, never MCP.** The `mcp__sqlite-oca__write_query` tool doesn't persist. It's hard-denied in project settings. Use `sqlite3 storage/oca.db` for writes; reads through MCP are fine.
- **Pre-push hooks are versioned in `.githooks/`.** New clones run `npm run setup-hooks` once to wire them up.
- **OCA reference DOCXs are the source of truth for rubric questions.** `https://files.oca.org/service-texts/YYYY-MMDD-texts-tt.docx`; see memory `feedback_oca_audit_workflow`. Use TT (Thee/Thou) form unless an overlay explicitly cascades to YY.

---

## The non-engineering gap

The hardest thing about handing this project off is not the code. The code is reasonably structured (12 phases of modularization, `npm run test:contracts` regression gate, CI, codified audit checklist). The hard thing is **liturgical knowledge** — the rubrics that the code encodes.

A successor needs to either:
- Have or acquire working knowledge of Orthodox Christian liturgical practice (tones, ranks, seasons, calendar rules, jurisdictional variants), OR
- Pair regularly with someone who does (the current maintainer, a friendly clergy reviewer, or a parish musician familiar with the Typikon).

The audit checklist (`audit/LITURGY-AUDIT-CHECKLIST.md`) and the OCA reference DOCXs (`https://files.oca.org/service-texts/`) are the closest thing to a teaching surface. The `Liturgical Glossary` in `CLAUDE.md` is the floor. Memory file `reference_oca_order_of_services.md` points at the OCA's own weekly rubrical blueprints.

This gap is not something the docs can fully close. Flag it explicitly to any contributor; budget for pairing.

---

## Known landmines

Things future contributors will hit that aren't obvious from the code alone.

- **Vespers date-shift.** API date for Vespers = civil evening; content comes from the *next* day's calendar entry. Matins and Liturgy are unshifted. This trips up almost everyone who looks at the API for the first time.
- **Octoechos weekday Vespers keys are sung-evening, not liturgical.** `octoechos.json` files keyed at `tone${N}.${day}.vespers.*` use the *civil-eve day* the Vespers is sung — Wed-eve content lives under `wednesday.vespers`, not `thursday`. Same for the evening prokeimenon table. `calendar-rules.js` exports `VESPERS_SUNG_EVE` (liturgical-dow → sung-eve-dow) precisely for this; any new calendar-entry generator that builds weekday Vespers must thread it (the audit rule `D1-vespers-prokeimenon-weekday` catches misses).
- **Holy Week DAY_CONFIG prokeimena are hardcoded** to the liturgical-day key in `calendar-rules.js:1014–1041`. Same off-by-one shape as the other five sites that got fixed under commit `aef1f6f`, but Holy Week may anticipate differently than ordinary practice; verify against an OCA Holy Week order source before flipping. Surfaces as 4 suppressed D1 findings (`known-failure` in `audit/known-issues.json`) until then.
- **Tone of the week, Saturday Vespers.** Saturday Great Vespers uses the tone of the week that is *ending* (the preceding Sunday's tone), NOT the upcoming Sunday's tone. Real liturgical rule, not a bug.
- **KJV vs OCA pronouns.** Epistle/Gospel reading body text comes from orthocal-api, which serves KJV ("ye/thee" but King James phrasing). OCA service books are NKJV with Thee/Thou. Translation drift is a known deferred gap, not a bug.
- **`node:sqlite` requires Node 24+.** The flag was lifted in 24; earlier versions need `--experimental-sqlite`. `package.json#engines` is `>=24.0.0`.
- **The `rank` column in `commemorations` is empty.** All 2639 rows have null rank. Rank is inferred at runtime by other signals (presence of cocelebrated-overlay entry, feast-canon file, etc.). Don't trust the column.
- **The orthocal-api dependency.** Calendar resolution + lectionary readings lean on an external service. There's a local cache (`storage/oca.db`'s `orthocal_cache` table); a long outage could starve it. See `npm run db:clear-cache`.
- **The translation cascade is real cascading.** Overlays `extends` parents (e.g. `st-john-damascus-tyler → sts-sluzhebnik → oca → base`). A change to the OCA layer ripples through every parish overlay that extends it. Always test parish-specific dates after changing a parent.
- **NA Saints Beatitudes feast-canon is in modern English.** Triggers L3-translation-consistency audit findings on 6/14 every year. Not a regression; a content gap.

---

## How to get started

In order:

1. `git clone` the repo, `npm install`, `npm run setup-hooks`.
2. `node server.js` (port 3000), then `curl http://localhost:3000/api/liturgy?date=2026-06-21 | jq .` to see what the assembler outputs.
3. Read `CLAUDE.md` end-to-end. It's short (~5K chars) and frames the data model.
4. Open `FEATURES.md`. Pick the simplest feature there (`confess-first` is a one-flag toggle) and read its spec + its contract test. That's the per-feature shape.
5. Run `npm test && npm run test:contracts && npm run audit:date -- 2026-06-21`. Three green outputs = your setup works.
6. Try the audit checklist on a Sunday of your choice — walk `audit/LITURGY-AUDIT-CHECKLIST.md` section by section.
7. **Pair with the current maintainer** on a real audit before making your first non-trivial change. The liturgical knowledge gap is the bottleneck.

---

## What's NOT in this doc

- Detailed architecture (it's in `docs/` and the `Phase 2/3` memory files; this doc points at them).
- A full backlog (`ROADMAP.md` has the active phase; the OCA Order audit plan + Pentecostarion + Doxology-rank backlogs are in memory).
- A complete feature catalog (it's in `FEATURES.md` — currently 3 features, will grow under back-fill-on-touch).
- The full strategic posture (`ASSESSMENT.md`).
- Code style (`STYLE.md` — 5 principles, 10 anti-patterns).

This doc is the framing; those are the depth.

---

## Maintenance

When this doc gets stale, the cost compounds. Update it in the same commit when:
- A load-bearing convention changes (the staging-first workflow, the contract pattern, the DB-write path).
- A new architectural axis is added (a new jurisdiction layer, a new translation cascade rule, a new service type).
- A landmine is fixed (move it from "known landmines" to "resolved").
- A new known landmine surfaces.
