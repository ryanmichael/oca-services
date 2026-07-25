---
name: session-handoff
description: Write an end-of-session handoff memory file plus its one-line MEMORY.md index entry, so the next session can resume cold. Use when the user says to wrap up, write a handoff, save session state, or "remember where we left off."
---

# Session handoff workflow

A handoff is the load-bearing artifact that lets the next session start without re-deriving today's work. The failure mode is a handoff that reads well but omits the one fact that unblocks tomorrow — the final commit SHA, the coordination landmine, or the queued-but-unstarted item. This skill enforces the shape that has worked (`project_session_handoff_*` — ~25 prior files).

## Default mode: DRAFT, THEN CONFIRM

Produce the full file body + the proposed `MEMORY.md` index line and show them. **Do not write files** until the user says "save" / "go ahead." Handoffs are cheap to get wrong and expensive to have wrong, so a glance-review first is worth it.

Draft output ends with:

> Ready to save. Reply "save" to write the memory file + MEMORY.md line, or tell me what to add/cut.

## Before drafting — gather the real state (don't reconstruct from memory)

1. `git log --oneline` since the session's first commit → the **commit arc** (chronological, with the one-line intent of each).
2. `git status` → uncommitted work, and note the **final `main`/`staging` SHA**.
3. Skim the conversation for: decisions made, items deliberately deferred, blockers, and anything surprising (a bug the work exposed, a coordination constraint).
4. **Dedup check:** if a handoff for today's date already exists, *update it* — do not create a second file. Multiple same-day sessions get an `-evening` / `-pm` suffix (see prior naming).

## File to write

Path: `<memory-dir>/project_session_handoff_YYYY_MM_DD[_suffix].md`
(memory dir = `/Users/ryanmurphy/.claude/projects/-Users-ryanmurphy-claude-code-oca-services/memory/`)

Frontmatter (match existing files exactly):

```markdown
---
name: session-handoff-YYYY-MM-DD
description: "<one sentence: the arc of the session + headline outcome>"
metadata:
  node_type: memory
  type: project
  originSessionId: <this session's id if known, else omit the line>
---
```

Body structure:

```markdown
# Session handoff — YYYY-MM-DD

<1–2 sentences: what the session set out to do and what it became.>

## Commit arc (chronological)
- `<sha>` <type(scope): subject> — <what it actually did, the non-obvious part>
…

## <Totals / metrics, if a sweep or bulk run happened>

## Remaining / deferred
- <item> — <why deferred, what it's blocked on, where the fix path is>

## State at end of session
main = staging = `<sha>` (or note divergence + what's unpromoted)
```

## Rules that make a handoff durable

- **Absolute dates only.** Convert "yesterday", "last week", "tomorrow" to `YYYY-MM-DD` — the file is read months later. (Today is knowable from the session's date context.)
- **SHAs are mandatory.** "main = `<sha>`" is the single most-used line by the next session. Include promotion state (staging vs prod, what's unpushed).
- **Link liberally.** `[[other-memory-name]]` for every project this touched, even if the target doesn't exist yet — it marks a thread worth writing.
- **Deferred items carry their fix path**, not just "TODO" — where the code is, what it's blocked on, why it wasn't done now.
- **Surface the surprises.** A landmine discovered today (a merge hazard, a picker gap, a scraper bug class) is the highest-value line in the file. Prior handoffs lead with **READ FIRST** when there's a coordination or ordering hazard.

## The MEMORY.md index line

Add exactly one line to `MEMORY.md` under the appropriate section (usually "Architecture / Long-horizon investments" or the Strategy handoff cluster), newest-first:

```
- [Session handoff YYYY-MM-DD](project_session_handoff_YYYY_MM_DD.md) — <hook: N commits, headline, main = `sha`, next pickup>
```

Keep it to one line, under ~200 chars. Prepend **READ FIRST.** when the next session must open it before working. Never put handoff *content* in MEMORY.md — only the pointer. MEMORY.md is already 200+ lines; be terse.

## Model routing (cheaper bias)

| Sub-task | Model | Why |
|---|---|---|
| `git log`/`status` gathering, file writing, MEMORY.md line insertion | **Haiku 4.5** | Mechanical once the content is decided. |
| Selecting what's non-obvious enough to keep, writing deferred-item fix paths, spotting the session's landmine | **Sonnet 5** | The whole value is judgment about signal vs. noise; a handoff that keeps everything is as useless as one that keeps nothing. |

Opus is not needed here — the judgment is editorial selection, not liturgical correctness.

## Pointers

- Prior examples (style reference): `project_session_handoff_2026_07_03.md` (multi-day arc + sweep totals), `project_session_handoff_2026_06_21.md` (short observation-pass session).
- Memory conventions: the memory rules in the session system prompt (frontmatter, `type`, `[[links]]`, MEMORY.md pointer discipline).
