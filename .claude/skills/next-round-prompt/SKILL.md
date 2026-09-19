---
name: next-round-prompt
description: Regenerate docs/next-round-prompt.md — the paste-ready prompt that orients a fresh session on the open backlog and asks it to plan the next round. Use when the user wants to refresh the planning prompt, hand the backlog off, or asks "what's next" in a way that should produce a durable artifact rather than a one-off answer.
---

# Next-round planning prompt

`docs/next-round-prompt.md` is the artifact a cold session (or another person)
reads to learn what is open and what not to touch. Its whole value is being
**true right now**. A stale one is worse than none, because it reads
authoritative: it will send someone to fix something already fixed, or worse,
re-open a trap that was deliberately left alone.

So this skill is mostly about **re-deriving state from the repo**, not about
prose. Never regenerate the prompt from memory, from the previous version of the
file, or from a session handoff. Those are all snapshots of a moment that has
passed.

## Default mode: REGENERATE, SHOW, THEN SAVE

Gather state → draft the full file → show it → save only on "save"/"go ahead".
Show the *diff against the current file* when one exists, not just the new body;
what changed since last time is the interesting part and the fastest thing for
the user to sanity-check.

## Step 1 — Re-derive state (never skip, never shortcut)

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse origin/main origin/staging HEAD     # note divergence
git log --oneline -15
git status --short                                 # untracked choir docs matter
npm run drift:check
node server.js &                                   # audit:full needs :3000
npm run audit:full                                 # 365 dates — NOT the 214-date sample
```

Then break the report down per rule *with dates*, because "L40 x6" is useless to
a planner without knowing which six:

```bash
python3 -c "
import re
s=open('audit/reports/latest.md').read()
print(s.split(chr(10))[4])
for sev in ['High','Medium','Low']:
    i=s.find('## %s severity'%sev)
    if i<0: continue
    j=s.find(chr(10)+'## ',i+5); sec=s[i:j if j>0 else len(s)]
    for b in re.split(r'^### ',sec,flags=re.M)[1:]:
        lines=[l for l in b.split(chr(10)) if l.startswith('- 20')]
        print('%-6s %-40s %d  %s'%(sev,b.split(chr(10))[0],len(lines),
              ', '.join(l[2:12] for l in lines[:12])))
"
```

**Run the FULL sweep, not the pre-push sample.** The pre-push hook audits 214
representative dates. Findings outside that sample — 2026-09-05's M19 is the
standing example — never block a push, so they drift indefinitely and are
exactly what a planning prompt exists to surface. If the full sweep and the last
push disagree, say so in the prompt.

Also collect, because the audit cannot see them:

- Items blocked on a **source** or a **ruling from the parish** (First Hour needs
  a Horologion; 02-02 Meeting needs an OCA Matins order). These are the user's to
  unblock and must be called out as such, not buried as tasks.
- **Untracked choir-director PDFs** in `docs/` — each folder is a service nobody
  has compared against our output yet. `git status --short` finds them.
- Anything a *different* session shipped since the last handoff. Check for rules
  and files you do not recognise; read them before describing them.

## Step 2 — Write the file

Three parts, in this order:

1. **Header** — one line on what the file is, plus an explicit instruction to
   update the snapshot when items close, and the SHA + date it was true at.
2. **The fenced prompt block** — everything the fresh session needs, structured:
   *Orient first* (with the state-gathering commands, and "if they disagree, the
   repo wins") · *Known open items* · *Non-negotiables* · *What I want back*.
3. **"Why this prompt is shaped the way it is"** — the framing choices worth
   defending, so a future editor does not flatten them back out.

Ask for a **triaged plan, not edits**: each item bucketed (data-drift /
structural / source-incomplete / needs-my-decision), with blast radius, what it
is blocked on, and the fix path. Order by service-correctness risk, not ease.

## Step 3 — What must survive every regeneration

These are hard-won; carry them forward unless the repo proves them obsolete.

**Framing (the part that actually prevents damage):**

- Write **"do not fix" items as warnings, not tasks.** L40's Beatitudes guard and
  M30's Meeting classification both look like quick wins and both yield a
  confidently wrong *service* if taken at face value — the first by sliding every
  troparion late through the renderer's 12-slot right-alignment, the second by
  asserting a rubric no available source settles. A cold session working a task
  list reaches for the easy-looking ones first.
- Flag anything **invisible to the pre-push gate**, so "push passed" is not read
  as "year is clean".
- Say what was **deliberately excluded** and why. "Three feasts not done" reads
  as an oversight; "not done because Theophany and Nativity go through the
  Vesperal Liturgy path with far more than three paremias" stops someone
  copy-pasting the pattern into a wrong answer.

**Non-negotiables to restate in the block:**

- Falsify every rule you add or change — reintroduce the bug, watch it fire,
  restore. A rule that has never failed proves nothing (one shipped dead,
  reading a field the audit context never carries).
- `npm test` does **not** run `test/contracts/`; use `npm run test:contracts`.
- Check **all** rule families before assigning a number (D18 already existed in
  `B-availability` while `D-structure` looked free).
- Never author liturgical text from memory — cite `reference/scrape/` or
  `reference/orders/`, or record a source gap.
- Orthocal enrichment fills text **by index, not by citation** — verify returned
  readings match the printed references before authoring any.
- `calendar/entry.js` changes need a snapshot rebaseline
  (`node scripts/snapshot-calendar-rules.js`, twice, plus `--check`).
- Audit the parish overlay too: `?translation=st-john-damascus-tyler`.
- Production deploys take 45–60s; poll for new **content**, since a check that
  merely parses a response reads the stale build.

## Step 4 — Save and ship

Write `docs/next-round-prompt.md`, then commit with a message saying **what
changed in the backlog** since the previous version — not just "update prompt".
The commit log then doubles as a record of the backlog burning down.

Push per `project_dev_workflow`: staging → staging, promote to main when the user
asks. Kill any `node server.js` first (SQLite lock → 15-min pre-push timeout).

## Anti-patterns

- Regenerating from the old file or a handoff instead of the live repo.
- Reporting counts without dates (`L40 x6` alone is unactionable).
- Quietly dropping an item because it is still open and was already listed —
  *still open* is the signal; note how long it has been open.
- Turning a warning back into a task because it looked like an easy win.
- Listing blocked-on-a-source items among the work rather than as questions.
