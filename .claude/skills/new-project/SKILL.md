---
name: new-project
description: Scaffold a focused per-feature workspace under projects/<slug>/ — a scoped CLAUDE.md (context boundary), PLAN.md, and NOTES.md — link related memory, index it, and optionally cut a branch. Use when the user wants to start a new project/feature/workstream and keep its context tight.
---

# New project workspace scaffolder

A project folder exists to **narrow context to one feature**. The lever is `projects/<slug>/CLAUDE.md`: Claude Code loads a nested `CLAUDE.md` *in addition to* the repo-root one whenever it works with files in that directory. So the scoped file doesn't repeat the root rules — it adds the feature's boundary: which files are in play, which memory is relevant, what "done" means.

## What gets created

```
projects/<slug>/
  CLAUDE.md    # scoped context boundary — in-scope files, memory links, done-criteria
  PLAN.md      # goal, approach, step checklist, open questions
  NOTES.md     # running decision/finding log (newest first)
```

Plus one line appended to `projects/README.md` (the index), and — if the user opts in — a `feature/<slug>` branch off `staging`.

Durable working docs live in the folder (committed). **Scratch artifacts** (large dumps, throwaway SQL, generated files) go in the session scratchpad, not the project folder — keep it reviewable.

## Steps

1. **Slug.** Kebab-case the feature name → `<slug>` (e.g. "Holy Fathers octave" → `holy-fathers-octave`). If `projects/<slug>/` already exists, stop and ask — don't clobber.

2. **Find related memory.** `grep -rl` the feature's key terms across the memory dir (`/Users/ryanmurphy/.claude/projects/-Users-ryanmurphy-claude-code-oca-services/memory/`) and the repo `docs/`. Collect the hits — these become `[[links]]` in the scoped `CLAUDE.md` so the next session inherits prior context instead of re-deriving it.

3. **Confirm before writing** (low ceremony — scaffolding is reversible). Show: the slug, the related-memory list you found, and the branch question. One short block:
   > New project: `projects/<slug>/`. Related memory: [[a]], [[b]]. Cut a `feature/<slug>` branch off staging, or work on staging? Reply to adjust, or "go".

4. **Write the three files** from the templates below, filling: title, the one-line goal (from the user's ask), the in-scope files you can already identify, and the memory links.

5. **Index.** Append to `projects/README.md`:
   `- [<Title>](<slug>/) — <one-line goal> · started YYYY-MM-DD · status: active`

6. **Branch (if opted in).** `git checkout -b feature/<slug>` off `staging`. Otherwise stay on `staging` and note it in PLAN.md.

7. **Activate.** Tell the user the workspace is ready and that to resume later they just say "we're working on `projects/<slug>`" — you'll read its `CLAUDE.md` + `PLAN.md` first.

## Templates

### CLAUDE.md (scoped — adds to the root CLAUDE.md, never repeats it)

```markdown
# Project: <Title>

**Goal:** <one sentence>
**Status:** active · started <YYYY-MM-DD> · branch: <feature/<slug> | staging>

## Context boundary
In scope: <what this feature touches>.
Out of scope: <what to leave alone>. Don't wander outside this without saying so.

## Key files
- <path> — <why it matters>
- <path> — <why it matters>

## Related memory / docs
- [[<project_memory_name>]] — <hook>
- docs/<file> — <hook>

## Done when
- <acceptance criterion>
- Closed with an audit rule + contract test where a regression class was introduced (repo discipline).

## Notes
Running log lives in NOTES.md. Plan + open questions in PLAN.md — read both first.
```

### PLAN.md

```markdown
# Plan — <Title>

## Goal
<what success looks like, in the user's terms>

## Approach
<design sketch — the layers/files, the sequence>

## Steps
- [ ] <step>
- [ ] <step>

## Open questions
- <decision needed + who decides>

## Verification
- npm run audit:date -- <date(s)>
- npm run audit:judge -- <date>   (if judge-relevant)
- npm run test:contracts
```

### NOTES.md

```markdown
# Notes — <Title>

Running log, newest first. Record decisions **with rationale** and dead-ends (so they aren't re-tried).

## <YYYY-MM-DD>
- <finding / decision>
```

## Relationship to memory

The project folder is the **live** workspace; memory (`project_*.md`) is the **durable** record. When the feature ships, the `session-handoff` skill distills the folder's outcome into a memory file + `MEMORY.md` line. The folder can then be archived (status: done in the index) or removed — its knowledge is preserved in memory.

## Model routing (cheaper bias)

| Sub-task | Model | Why |
|---|---|---|
| Slug, file scaffolding, index append, branch cut | **Haiku 4.5** | Pure mechanical scaffold. |
| Grepping + selecting genuinely-related memory, drafting the in-scope/out-of-scope boundary | **Sonnet 5** | Light judgment — a good boundary is the whole value; a wrong memory link wastes the next session's attention. |

Opus is not needed — this is setup, not liturgical correctness.

## Pointers

- Index: `projects/README.md`
- Durable-knowledge counterpart: the `session-handoff` skill + `MEMORY.md`
- Repo-wide rules the scoped CLAUDE.md inherits (don't duplicate): root `CLAUDE.md`
