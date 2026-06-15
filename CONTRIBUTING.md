# Contributing

The doc that codifies how to work on this project. Read [`HANDOFF.md`](./HANDOFF.md) first for what's load-bearing; this doc is the *workflow*.

---

## Setup (one-time)

```bash
git clone <repo>
cd oca-services
npm install
npm run setup-hooks   # wires git to .githooks/ so pre-push runs locally
```

Requirements:
- Node ≥ 24 (uses `node:sqlite` unflagged). `nvm use 24` if needed.
- `sqlite3` CLI on PATH for any DB writes (MCP write is denied — see `HANDOFF.md § Known landmines`).

Verify setup is healthy:

```bash
npm test                        # smoke (144 tests)
npm run test:contracts          # per-feature contracts (13+ tests)
npm run audit:date -- 2026-06-21  # walks all services for one date
```

Three green outputs = you're set up.

---

## The daily loop

```bash
node server.js                # HTTP server on :3000
curl -s http://localhost:3000/api/liturgy?date=2026-06-21 | jq .
```

For changes:

```bash
# 1. Edit code on a topic branch or directly on staging
git checkout staging
# ... edit ...

# 2. Run the relevant tests locally
npm test
npm run test:contracts

# 3. For UI/route changes, hit the API in a browser too
open http://localhost:3000/

# 4. Push to staging; pre-push hook runs smoke + contracts + audits
git push origin staging
```

`main` is production. Promotion is explicit, not automatic:

```bash
git checkout main
git merge staging --ff-only
git push origin main
```

Railway deploys both branches; staging is the dev environment, main is prod.

---

## Conventions (load-bearing)

The full list lives in [`HANDOFF.md § Load-bearing: conventions that must survive`](./HANDOFF.md). The four that matter for daily work:

### 1. Feature contract on touch

When you implement a new feature or modify an existing one that has user-visible behavior, the same commit must include:

1. `features/<name>.md` with Purpose, Interface, Behavior table, Code surface, INV-* invariants, Edge cases, Verified dates, Keep in sync.
2. `test/contracts/<name>.test.js` with one `it('INV-N: …')` per invariant.
3. A row in [`FEATURES.md`](./FEATURES.md).

For existing features without contracts yet: back-fill on touch, not in a bulk pass. The contract-check pre-push hook will remind you.

Pilot examples to copy: `features/patron-of-temple.md`, `features/confess-first.md`, `features/sunday-kontakia-restructure.md`.

### 2. Default push target is `staging`

`git push origin staging` first; promote to `main` with an explicit fast-forward merge. Never push directly to `main`.

### 3. DB writes through `sqlite3` CLI

The `mcp__sqlite-oca__write_query` MCP tool doesn't persist and is hard-denied. For any DB write:

```bash
sqlite3 storage/oca.db "UPDATE ..."
```

Reads through MCP (`read_query`, `list_tables`, `describe_table`) are fine.

### 4. Memory files (if you have Claude memory) are pointers, not specs

If a `features/<name>.md` exists, the corresponding `project_<name>.md` memory file must be a pointer — never duplicate the spec content. The in-repo spec is the source of truth.

---

## Common scenarios

### Adding a new feature

1. Implement the feature.
2. Write `features/<name>.md`: copy `features/confess-first.md` as the template (it's the simplest of the three).
3. Write `test/contracts/<name>.test.js`: copy a sibling and adjust port + dates + assertions.
4. Add a row to `FEATURES.md`.
5. `npm run test:contracts` — all green.
6. `git commit -am "feature: <name> + contract + tests"` and push to staging.

### Fixing a bug in code that has a feature contract

1. Reproduce; check if the bug violates a named invariant in `features/<name>.md`.
2. If yes: fix it; the contract test should already catch the regression once you have the fix.
3. If no: add a new INV-* to the spec, add the matching test, then fix.
4. If the fix changes the behavior table: update it in the same commit.

### Auditing a Liturgy for a specific date

Walk [`audit/LITURGY-AUDIT-CHECKLIST.md`](./audit/LITURGY-AUDIT-CHECKLIST.md) section by section. Don't improvise; the checklist exists because coverage drifts when you skip sections.

### Reporting an audit finding

If the finding contradicts a feature contract: that's a regression; fix it.
If the finding is outside any contract: consider whether a contract should exist (back-fill candidate).
If the finding is a content gap (e.g., translation drift, missing menaion entry): file it in `audit/known-issues.json` with a clear `addedAt` and reason, or fix the data in the same commit.

### Touching `server-lib/routes/api-liturgy.js` or `assemblers/liturgy.js`

These are shared code surfaces for multiple feature contracts (`patron-of-temple`, `sunday-kontakia-restructure`, `confess-first`). The pre-push `contract-check` script will warn you which contracts are affected. Always re-read the affected `features/*.md` and re-run `npm run test:contracts` before pushing.

---

## What NOT to do

- **Don't bypass the pre-push hook** (`git push --no-verify`) except for genuine doc-only commits where you've thought it through. The hook catches structural breaks the contracts can't.
- **Don't add backwards-compat shims** for behavior you're changing. We rev the codebase, not preserve every intermediate shape.
- **Don't write a memory file when an in-repo doc would serve.** Memory files are for Claude session collab notes; specs go in the repo.
- **Don't bulk-backfill feature contracts.** Let normal traffic prioritize. The hot features will all have contracts within ~3 months of normal work; the cold ones can wait.
- **Don't run a SQL write through the MCP server.** Use the `sqlite3` CLI; MCP write is denied for good reason.

---

## Where to ask

- Liturgical/rubric questions: pair with the maintainer; OCA reference DOCXs at `https://files.oca.org/service-texts/`.
- Architecture questions: read [`docs/`](./docs/) and the `Phase 2/3` arc in `ROADMAP.md`.
- "What does this feature do?" → [`FEATURES.md`](./FEATURES.md) and the linked spec.
- "What's still load-bearing?" → [`HANDOFF.md`](./HANDOFF.md).
- "What's the strategy?" → [`ASSESSMENT.md`](./ASSESSMENT.md).
