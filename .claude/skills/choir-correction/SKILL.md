---
name: choir-correction
description: Route a correction from a parish choir director (text wording, ordering, rubric, etc.) to the correct cascade layer. Required when the user pastes choir-director feedback and wants it applied to the system.
---

# Choir Correction Workflow

A correction from a parish choir director is a structured input that must be routed to one of seven cascade layers. The wrong layer = silent leakage (a Tyler preference applied to every parish) or silent loss (a universal correction stranded in one overlay).

This skill enforces the routing discipline. Follow it step-by-step; do not shortcut.

## Default mode: DRY-RUN

**Every invocation starts in dry-run mode.** Produce the full classification, diff preview, blast-radius report, and proposed log entry — but **do not write any files, run any DB writes, or commit anything** until the user explicitly says "apply" or "go ahead and apply."

Dry-run output ends with:

> Ready to apply. Reply "apply" to write changes, or describe what you want changed and I'll re-run the dry-run.

## The 7-branch decision tree

Every correction routes to exactly one branch. Show the user which branch you picked and which you considered + rejected (the rejected list lands in `corrections_log.rejected_branches`).

| Branch | When | Writes to |
|---|---|---|
| **variant-pick** | The choir wording already exists in the variant library; we just need to swap which one the parish uses | `parish_variant_picks` row only |
| **rubric-flag** | The correction is a known typed rubric setting (confess-first, omit-pre-Trisagion-litany, etc.) | `parish_settings` typed column |
| **text-overlay** | New parish-specific text the library doesn't (and shouldn't) carry | parish overlay file under `fixed-texts/translations/<parish>/` |
| **library-add** | New translation/setting of a *universally meaningful* text — likely useful to other parishes | new variant in `fixed-texts/variant-library/<key>.json` + parish pick |
| **text-base** | Universal correction to the OCA-default fixed text | `fixed-texts/*-fixed.json` — **requires displaced-variants check (see below)** |
| **structure** | Order/structure of a service is wrong (litany in wrong place, missing block) | assembler code + new audit rule + new contract test |
| **calendar-data** | Wrong commemoration, tone, sticheron-source, menaion attribution | `variable-sources/calendar/YYYY-MM-DD.json` or troparia/stichera DB rows |

**Routing heuristics:**

- "Use HTM wording for X" where HTM is already in the library → **variant-pick**.
- "Sing the Communion Prayer before Communion" → **rubric-flag** (`confessFirst`).
- "We say it like *this*: <text we've never seen>" and it's clearly parish-flavored → **text-overlay**.
- "Here's the published translation from <real source book>" → **library-add**.
- "The OCA Service Book actually reads <X>; you have <Y>" → **text-base**, blast-radius mandatory.
- "Litany of Fervent Supplication comes after the Gospel, not before" → **structure**.
- "Today's commemoration should be St. Sergius, not St. Sabbas" → **calendar-data**.

When more than one branch is plausible, **prefer the lower-blast-radius option** and surface the alternative explicitly. Order from lowest to highest blast radius:
1. variant-pick
2. rubric-flag
3. text-overlay (parish-scoped)
4. calendar-data (date-scoped)
5. library-add (new shared text, additive)
6. structure (assembler change, all parishes)
7. text-base (changes the default for every parish + every overlay)

## The 6-step workflow

### Step 1 — Capture intent

State back to the user:
- **Which parish** (if unclear, assume Tyler / `st-john-damascus-tyler` and confirm)
- **Which service** (Liturgy / Vespers / Matins / etc.)
- **Source artifact** (email, PDF, conversation — free-text label for `corrections_log.source_artifact`)
- **Source citation** (OCA Service Book page, HTM Liturgikon, parish folder, etc., if cited)

If any of these is missing and not clearly inferable, ask one clarifying question before proceeding.

### Step 2 — Locate the current state

Run `node scripts/find-slot.js "<distinctive fragment of current or proposed text>"`. The fragment can be a few words of the *current* wording (to find what's rendering today) or of the *proposed* wording (to dedup against existing library variants).

Report to the user:
- Every match returned, grouped by source layer.
- Which match is the canonical render path (usually `base` or the most specific overlay in Tyler's chain).
- Any existing library variants whose `_target` matches the slot — these are the dedup candidates.
- The `before_sha` (from the canonical-render match) — this becomes `corrections_log.before_sha`.

If `find-slot.js` returns zero matches, the correction is for a slot we don't yet emit. That's either a **structure** branch (new block needs to be added) or **calendar-data** (the slot exists but is empty for this date). Re-classify before proceeding.

### Step 3 — Classify

State explicitly:
- **Chosen branch** with one-sentence rationale.
- **Rejected branches** with one-line reason each. (e.g. "Rejected text-base: this wording is HTM-flavored, not OCA-universal.")
- **Scope**: parish-id (or `null` if structural/universal).
- **Target service + path** (or assembler function name for structure branch).

### Step 4 — Git checkpoint, then apply (in dry-run: just describe)

Before any write, ensure `git status` is clean. If not, ask the user whether to commit / stash the dirty state first. Then take a WIP commit per-branch boundary so misroutes are recoverable with one `git revert`.

Apply, per branch:

- **variant-pick**: `UPDATE parish_variant_picks SET variant_id=... WHERE parish_id=... AND variant_key=...`. Append history row to `parish_settings_history`.
- **rubric-flag**: `UPDATE parish_settings SET rubric_<flag>=... WHERE parish_id=...`. History row.
- **text-overlay**: Edit `fixed-texts/translations/<parish>/<service>-fixed.json` adding/changing the dotted key.
- **library-add**:
  1. Add new variant to `fixed-texts/variant-library/<key>.json`. ID source-semantic, never parish-prefixed. Include `_provenance` block.
  2. Update parish pick to the new variant ID.
  3. CONTRACT.md rules apply: append, never rename, never remove.
- **text-base**:
  1. **Displaced-variants check** (mandatory): enumerate library variants whose `_target.path` resolves to the edited slot. For each, snapshot the *old* base value as a new variant `<key>/legacy-pre-YYYYMMDD` (with `_provenance.origin: "displaced-by-base-edit"`, `supersedes: <prior>`) so previously-implicit users can pin to it.
  2. Edit `fixed-texts/<service>-fixed.json`.
- **structure**:
  1. Locate the assembler function emitting the wrong order (Step 2's `assemblerEmitter` field, or re-grep).
  2. Make the code fix.
  3. Add a new audit rule under `audit/rules/<family>-<id>.js` enforcing the corrected ordering invariant.
  4. Add a contract test under `test/contracts/` that fails on the wrong ordering.
  5. Record an audit-rule citation: append `{ ruleId, sourceDoc, page, verifiedOn, verifier }` to `audit/rules/citations.json` (create file if absent).
- **calendar-data**:
  1. Edit `variable-sources/calendar/YYYY-MM-DD.json` or the troparia/stichera DB row.
  2. For DB writes use the `sqlite3` CLI directly — `mcp__sqlite-oca__write_query` does not persist (project memory `project_synaxis_na_data_fix.md`).

### Step 5 — Verify

Always:
- `npm run drift:check` — variant library + parish picks still resolve.
- `npm run test:contracts` — INV-A through INV-F still green.
- `node scripts/parish-roundtrip-diff.js` — Tyler's renderings still contain all expected substrings (if Tyler was the affected parish).

For text branches, also:
- Render the affected service for the parish + a representative date. Show before/after diff. Capture the `after_sha`.

For **text-base** and **structure** branches, additionally:
- Run `node scripts/blast-radius.js <branch> <target>` to enumerate every (parish, date) tuple that will render differently. The user must acknowledge the count before apply.
- `npm run audit:quick` across the affected date matrix.

For **structure** branch only:
- Snapshot diff via `node audit/snapshot.js` across the Track D 4-date oracle. Surface unintended changes.
- At least one Playwright e2e spec run (`npm run test:e2e -- <relevant>`) when the change affects rendered DOM ordering.

If any verification fails, do not commit. Report to the user and ask how to proceed.

### Step 6 — Record

Insert one row into `corrections_log`:

```sql
INSERT INTO corrections_log (
  applied_at, applied_by, parish_id, source_artifact, source_citation,
  branch, rejected_branches,
  target_service, target_path,
  before_sha, after_sha, before_preview, after_preview,
  variant_id, audit_rule_id, applied_commit, notes
) VALUES (...);
```

`applied_commit` is filled with the SHA *after* `git commit`, in a second statement.

Append a one-line entry to `/Users/ryanmurphy/.claude/projects/-Users-ryanmurphy-claude-code-oca-services/memory/project_choir_corrections_log.md` linking to the corrections_log row id, for human-readable narrative.

## Hard rules

1. **Never edit `fixed-texts/<service>-fixed.json` without the displaced-variants check.** Skipping this orphans variants whose `_target.path` no longer matches what they were diffing from.
2. **Never use parish-prefixed variant IDs in the shared library.** Use source-semantic IDs (`htm-2008`, `jordanville`, `russian-doubled-1`); record parish origin in `_provenance`.
3. **Never rename or remove a variant ID.** Add a new ID + alias to the old one. CONTRACT.md is load-bearing.
4. **Never use the MCP `sqlite-oca` write tool for persistent DB changes.** It doesn't persist. Use `sqlite3 storage/oca.db` CLI.
5. **Never apply in dry-run mode.** Apply only after the user explicitly says "apply" (or "go ahead and apply").
6. **Never skip the rejected-branches list.** It's the dataset the meta-audit rule uses to detect classifier drift.

## Dry-run output template

When the user invokes the skill, produce a single report shaped like this:

```
## Choir correction — DRY-RUN

**Source**: <artifact + citation>
**Parish**: <parish-id>
**Service**: <service>

### Step 2 — Located
find-slot.js found N matches. Canonical render:
- Layer: <layer>
- File: <path>
- Cascade key: <dotted-path>
- before_sha: <sha-prefix>
- Current value (preview): "<…>"

Dedup candidates in library:
- <variant-id> — <label>  (similarity: <high|partial|none>)

### Step 3 — Classification
**Branch**: <branch>
**Why**: <one sentence>
**Rejected**:
- <branch>: <one line>
- <branch>: <one line>

### Step 4 — Planned writes
- <file>:<key> — diff:
  ```diff
  - <before>
  + <after>
  ```
- <DB row to update>: <values>

### Step 5 — Verification plan
- npm run drift:check
- npm run test:contracts
- <additional, per branch>

Blast radius: <N parishes × M dates affected> (or "parish-scoped, 1 parish")

### Step 6 — Log entry preview
<json of the corrections_log row that will be inserted>

---
Ready to apply. Reply "apply" to write changes, or describe what you want changed and I'll re-run the dry-run.
```

## Pointers

- Variant library contract: `fixed-texts/variant-library/CONTRACT.md`
- Cascade architecture: `docs/parish-self-service-design.md`
- DB churn caution: memory `project_track_e_db_churn.md`
- Audit rule families: `audit/rules/` (D-family / V-family / M-family / L-family / P-family)
- Contract test families: `test/contracts/`
- Helper scripts: `scripts/find-slot.js`, `scripts/blast-radius.js`, `scripts/parish-roundtrip-diff.js`, `scripts/drift-check.js`
