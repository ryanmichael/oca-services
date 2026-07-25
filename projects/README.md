# Projects — focused per-feature workspaces

Each `projects/<slug>/` is a self-contained workspace for one feature, created by the `new-project` skill (`/new-project <name>`). A folder holds:

- **`CLAUDE.md`** — the scoped context boundary. Claude Code loads it *on top of* the repo-root `CLAUDE.md` when working with files in that folder, so a session stays focused on the feature.
- **`PLAN.md`** — goal, approach, step checklist, open questions.
- **`NOTES.md`** — running decision/finding log.

To resume a project, say *"we're working on `projects/<slug>`"* — the session reads that folder's `CLAUDE.md` + `PLAN.md` first.

When a feature ships, the `session-handoff` skill distills the folder into a durable memory file + a `MEMORY.md` line; the folder is then marked `done` below (or removed — its knowledge lives in memory).

## Active

<!-- new-project appends here: - [Title](slug/) — goal · started YYYY-MM-DD · status: active -->

## Done

<!-- move an entry here (status: done) when the feature ships and is distilled to memory -->
