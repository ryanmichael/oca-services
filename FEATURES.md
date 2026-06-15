# Features

Capabilities of the service-text generator, each with a contract spec and a regression-test file. New features and feature-touching commits update this index in the same change.

Run the regression gate: `npm run test:contracts`

`scripts/contract-check.js` is wired into the pre-push hook. It parses each `features/*.md` for the file paths in its `## Code surface` section, compares them to the diff being pushed, and reminds you when a touched code path's spec or contract tests weren't updated in the same change. Reminder-only by default — pass `--strict` to make it a gate.

## Liturgy

| Feature | Spec | Tests | Status |
|---|---|---|---|
| Patron of Temple — parish-overlay patron injection on Liturgy | [features/patron-of-temple.md](features/patron-of-temple.md) | [test/contracts/patron-of-temple.test.js](test/contracts/patron-of-temple.test.js) — INV-1..5 | shipped 2026-06-13 |
| confessFirst — Communion Prayer order parish rubric | [features/confess-first.md](features/confess-first.md) | [test/contracts/confess-first.test.js](test/contracts/confess-first.test.js) — INV-1..3 | shipped 2026-06-14 |
| Sunday Kontakia Restructure — Glory/Now bracket + Theotokion-Kontakion | [features/sunday-kontakia-restructure.md](features/sunday-kontakia-restructure.md) | [test/contracts/sunday-kontakia-restructure.test.js](test/contracts/sunday-kontakia-restructure.test.js) — INV-1..5 | shipped 2026-06-14 |

## How to add a feature here

1. Write `features/<name>.md` using the shape established by `features/patron-of-temple.md`:
   Status / Purpose / Interface / Behavior table / Code surface / INV-* invariants / Edge cases / Verified dates / Keep in sync.
2. Write `test/contracts/<name>.test.js` with one `it('INV-N: …')` per invariant. Run via `npm run test:contracts`.
3. Add a row to this index in the same commit.

## Coverage policy

- **New features:** spec + tests + index entry land in the same commit as the implementation.
- **Existing features (back-fill on touch):** when a commit modifies the code surface of a feature with no current contract, extract a spec, write contract tests for its named invariants, and add an index row in that same commit. Do not bulk-backfill; let traffic prioritize.
- A feature qualifies for a contract if it has user-visible behavior that would be verified against a parish service text.

## Related infrastructure

- **Smoke tests** (`test/smoke.test.js`, `test/old-style.test.js`) — broad structural assertions across the assembler and API surface; complement contract tests but are not feature-scoped.
- **Audit rules** (`audit/rules/`) — sweep data files across many dates for structural regressions; complement contract tests but operate on data, not on rendered API behavior.
- **Snapshot tests** (`audit/snapshot.js`, `audit/snapshots/`) — HTML diff baselines that catch unintended downstream changes.
- **LLM-judge** (`audit/llm-judge.js`) — qualitative review against OCA reference DOCXs; catches translation nuance contract tests don't.
- **Schemas** (`schema/`) — formal JSON schemas for `ServiceBlock`, `CalendarEntry`, `OverlayManifest`.
- **Design philosophy** (`STYLE.md`) — durable design principles and anti-patterns.
- **Strategy** (`ASSESSMENT.md`, `ROADMAP.md`) — four-lens posture and live phase tracker.
