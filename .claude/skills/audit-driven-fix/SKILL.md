---
name: audit-driven-fix
description: Run the full audit-and-fix loop for a date or sweep — surface findings, triage into data-drift/structural/source-incomplete/false-positive buckets, fix each, and close every fix with a new structural rule so the regression class is caught next time. Use when the user asks to audit, triage, fix, or "do a holistic pass" on a service or date.
---

# Audit-driven fix workflow

A judge finding without a follow-up structural rule is a fix that doesn't compound. This skill enforces the discipline that *every* data-drift fix is paired with the rule that would have caught it — so the audit posture strengthens with each session.

## Default mode: TRIAGE FIRST, FIX SECOND

**Never propose a fix before all findings are categorized.** The trap to avoid: chasing the first finding's root cause when it's actually a side-effect of finding 3. Today's prototype run (2026-06-20) had 8 judge findings that reduced to 4 root causes once triaged — fixing them in surface order would have wasted hours.

## The 4-bucket triage

Every finding from `audit:date`, `audit:judge`, `drift:check`, or human eyeballing routes into exactly one bucket. Show the bucket assignment + the rejected ones (analogous to `choir-correction`'s rejected-branches list).

| Bucket | Signature | Fix shape |
|---|---|---|
| **data-drift** | Wrong row in `commemorations` / `troparia` / `stichera` / `variable-sources/calendar/`. Smoking-gun: same content under wrong key, byte-identical dupes, scraper bleed into adjacent rows. | SQL transaction in `/tmp/*.sql`, applied via `sqlite3` CLI (NOT MCP write_query — doesn't persist). Backup `storage/oca.db.bak.YYYY-MM-DD` first. |
| **structural** | Assembler emits wrong shape (off-by-one, missing block, wrong order convention). The data is correct; the code reads it wrong, or doesn't enforce a convention. | Code change in `server-lib/assemble/` + new audit rule in `audit/rules/<family>-<id>.js` + new contract test in `test/contracts/`. |
| **source-incomplete** | A `variable-sources/*.json` file is missing canonical OCA content. Common signature: an Octoechos tone with fewer hymns than convention requires. | Author the canonical text into the source file (cite OCA-published reference). If you don't have the source on hand, document the gap in the relevant audit rule's `KNOWN_SOURCE_GAPS` (see D13 for the template) and queue follow-up. |
| **judge-false-positive** | LLM judge cited a text/convention that conflicts with the assembler's documented OCA-aligned behavior. Often surfaces when the judge can't see the comment in the assembler explaining "this is intentional." | Document in the run's report. Optionally update the judge's system prompt to inoculate against the class of FP. Do NOT silence by adding to known-failures. |

**Triage heuristics:**

- "Same title, identical troparia, dates within 30 days" → **data-drift** dupe.
- "Wrong principal saint" → **data-drift** (DB row drift) OR **source-incomplete** (orthocal mis-sourced).
- "Sticheron count off by 1" → likely **source-incomplete** (Octoechos source short) OR **data-drift** (one row mis-keyed, eating a slot). Inspect with `menaion:inspect` to disambiguate.
- "Glory text + Sticheron 1 swapped" → **structural** (assembler convention mismatch with DB convention) OR **data-drift** (row authored under wrong convention).
- Anything the judge says that conflicts with a code comment marked `// project_*.md` → **judge-false-positive** until proven otherwise.

When more than one bucket is plausible, **prefer the lower-blast-radius option first**. Order: source-incomplete (one source file) < data-drift one-row (one row) < data-drift bulk (N rows) < structural (assembler change affects all dates).

## The 6-step workflow

### Step 1 — Capture scope

State back to the user:
- **Date or sweep**: single date / weekend / year / specific service.
- **Parish overlay scope**: OCA-base only, or include a specific parish's overlay?
- **Sources to consult**: `audit:date` rules, `audit:judge` (needs `ANTHROPIC_API_KEY`), `drift:check`, manual eyeballing, all of the above.

If parish overlay scope is unclear, default to OCA-base. The judge compares against OCA-published DOCX; auditing a parish overlay against the OCA DOCX produces flood-of-FPs because every intentional overlay-divergence flags.

### Step 2 — Surface findings (read-only)

Run, in this order:
1. `npm run drift:check` — fast, no server, catches DB-layer drift (dupe commemorations, broken variant-library references).
2. `npm run audit:date -- <date>` — fast, server-required, runs all structural rules.
3. `npm run audit:judge -- <date> --service <svc>` — slow, API-cost, surfaces semantic/translation issues.
4. `node scripts/menaion-inspect.js <date>` — when a judge finding mentions a specific commemoration, dump the DB state for that date and cross-reference with orthocal.

Capture every finding into a numbered list with origin (judge/rule/drift) and severity. Don't act yet.

### Step 3 — Triage

For each finding, state:
- **Bucket**: one of the 4 above.
- **Rejected buckets**: with one-line reason.
- **Root-cause hypothesis**: what to look for (DB row? source file? assembler line?).
- **Dependency on other findings**: e.g., "this is a side-effect of #2; fix #2 first."

If two or more findings share a root cause, merge them into one. If a finding's bucket is genuinely ambiguous after Step 2's evidence, drop down to deeper inspection (read assembler code, check DB rows by hand, check OCA DOCX).

### Step 4 — Fix, per bucket

Always: `git status` clean before any write. Backup `storage/oca.db` before any DB write. Use `/tmp/*.sql` for transactional DB ops so the change is auditable.

- **data-drift**:
  1. `cp storage/oca.db storage/oca.db.bak.YYYY-MM-DD[-step]`
  2. Write transaction to `/tmp/<descriptive-name>.sql` with `BEGIN; … COMMIT;` and post-commit verification `SELECT`s.
  3. Apply via `sqlite3 storage/oca.db < /tmp/<name>.sql`.
  4. Restart server if the change affects rendering (`/api/*` endpoints cache JSON sources at boot; DB queries are live).
- **structural**:
  1. Identify assembler emitter via grep (`server-lib/assemble/` + `server-lib/sources/`).
  2. Code fix.
  3. New audit rule under `audit/rules/<family>-<id>.js` (D-family for structure). Smoke-test on the failing date first, then sweep year.
  4. New contract test under `test/contracts/` if the change touches a feature with an existing spec.
- **source-incomplete**:
  1. Author canonical text into `variable-sources/*.json` (verify against OCA-published source). If no source on hand, add to the relevant rule's `KNOWN_SOURCE_GAPS` map (see `D13-octoechos-aposticha-count.js` for the template) and skip step 5's new-rule requirement.
  2. Restart server.
- **judge-false-positive**:
  1. Document in the run report: cite the assembler comment / OCA convention proving the assembled output is correct.
  2. Optionally append to the judge's system prompt under "DO NOT flag" with a brief instance.

### Step 5 — Close the loop (mandatory for data-drift + structural)

**This is the discipline that compounds.** For every data-drift or structural fix applied in Step 4:

- Add a new audit rule that would have caught the bug at `audit:quick` time, structurally — no LLM needed. The rule's `description` field cites the date the regression was discovered.
- Run the new rule across the year (`npm run audit:full --rules <id>`). If it surfaces N additional findings of the same class, decide on the spot: bulk fix now, or document + queue.

A data-drift fix that doesn't yield a structural rule is suspicious — either the bug class is genuinely one-off (rare; document why in `corrections_log.notes`), or you haven't found the real class yet. Push back.

### Step 6 — Verify + commit

Always:
- `npm run drift:check`
- `npm run audit:date -- <date>`
- Re-run `audit:judge` if you used it in Step 2 and the change touches a class the judge flagged. Expect the original findings to clear.

Commit grouping:
- Infrastructure changes (new rules, scripts, workflows) → one commit, `feat(audit): …`
- Data fixes (DB + source files) → one or more commits per logical change, `fix(menaion|octoechos|calendar): …`
- Structural code changes → one commit, `fix(assemble): …` + paired audit rule in same commit

## Hard rules

1. **No fix without a triage bucket assigned and rejected-bucket list documented.** Going straight to "let me try X" on the first finding skips the cross-finding root-cause merge that today's session needed.
2. **Every data-drift or structural fix ships with its closing audit rule.** Exceptions documented in writing.
3. **`storage/oca.db` writes go through `sqlite3` CLI on a `/tmp/*.sql` transaction.** Never MCP write_query (doesn't persist). Always backup first.
4. **Source-data gaps without authoritative source go to `KNOWN_SOURCE_GAPS` in their rule, not `known-issues.json` `knownFailures`.** The latter is policy-empty per project convention.
5. **Judge findings about translation choice (thee/thy nuance, OCA vs HTM wording) are NOT bugs; route to choir-correction skill if the user wants the parish to adopt the alternate.**
6. **Restart the server after edits to `variable-sources/*.json` or DB.** Source JSON is cached at boot.

## Output template

When invoked, produce a report shaped like:

```
## Audit-driven triage — <date or scope>

### Step 1 — Scope
- Date(s): …
- Parish: … (default: OCA-base)
- Sources consulted: …

### Step 2 — Surfaced findings (N)
1. [judge/high] <Section> — <one-line>
2. [rule/medium] <id> — <one-line>
…

### Step 3 — Triage
| # | Bucket | Root cause | Depends on |
|---|---|---|---|
| 1 | data-drift | <hypothesis> | — |
| 2 | structural | <hypothesis> | resolved-by:#1 |
…

### Step 4 — Proposed fixes (per bucket, in low→high blast-radius order)
**data-drift (1 finding)**:
- /tmp/<name>.sql proposed (preview)
…

### Step 5 — Closing audit rules to add
- audit/rules/<family>-<id>.js — asserts <invariant>; catches finding #N's class
…

### Step 6 — Verification plan
- npm run drift:check
- npm run audit:date -- <date>
- (judge re-run only if Step 2 used it)

Ready to apply. Reply "apply" to proceed with the data-drift writes + open a follow-up todo for the structural changes.
```

## Pointers

- DB schema + write conventions: `storage/README.md`, memory `project_synaxis_na_data_fix.md`
- Audit rule families: `audit/rules/` (A calendar, B availability, C substitution, D structure, E provenance, F theme, L liturgy, M matins, P presanctified, V vespers)
- Contract test families: `test/contracts/`
- LLM judge: `audit/llm-judge.js` — exit codes 0/1/2/3 encode severity
- Helper scripts: `scripts/menaion-inspect.js`, `scripts/find-slot.js`, `scripts/blast-radius.js`, `scripts/drift-check.js`
- The prototype run this skill codifies: commits `7df5ec0` → `c70d8bf` (2026-06-20)
