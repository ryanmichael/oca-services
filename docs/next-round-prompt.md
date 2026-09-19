# Next-round planning prompt

Paste the block below into a fresh Claude session to have it review open items
and propose the next round of updates.

**Keep it current.** The state snapshot and the open-items list below were true
at `03ca393` (2026-09-19). When items are closed or the SHA moves, update this
file in the same commit — a stale planning prompt is worse than none, because it
reads authoritative.

---

```
Review the open items on this project and propose a plan for the next round of
updates. Do NOT make code changes yet — produce a triaged plan and ask me which
parts to take.

## Orient first (do not trust memory alone)

1. Read MEMORY.md, then project_session_handoff_2026_09_13.md and
   project_session_handoff_2026_09_07.md. Those carry the landmines.
2. Establish real state before planning — memory reflects when it was written:
     git log --oneline -15 ; git status --short
     git rev-parse origin/main origin/staging HEAD
     npm run drift:check
     node server.js &            # then:
     npm run audit:full          # 365 dates; the pre-push sample is only 214
3. Reconcile what you find against the list below. If they disagree, the repo
   wins — say so explicitly rather than planning against a stale list.

As of 2026-09-19, main = staging = 03ca393, tree clean apart from untracked
choir PDFs.

## Known open items

ONLY `high` (full-year sweep; NOT in the 214-date representative sample, so it
does not block pushes — easy to miss):
- M19-matins-lauds-shape, 2026-09-05: Lauds renders 1 hymn where 4+ are
  appointed. Already diagnosed as source-incomplete: exactly 4 menaion files
  carry `matins.lauds` with only a `doxastikon` and no numbered stichera —
  january-18, june-28, may-24, september-05. 94 files have proper stichera.
  Needs a Menaion source. reference/orders/ will NOT help (Sundays only).

Tracked `low` (evidence lives in each rule's KNOWN_SOURCE_GAPS / NEEDS_DECISION):
- L40 x6 — Great Feast Beatitudes render a placeholder. DO NOT simply delete the
  `if (!isSunday) return []` guard in beatitudes.js. The renderer RIGHT-ALIGNS
  troparia into 12 slots, so a short list slides every troparion late — that is
  the 2026-08-16 failure that was caught from the kliros mid-Liturgy. 9-08 needs
  Canon II (Andrew of Crete, Tone 8), absent from the corpus.
- D19 x3 — Theophany 01-06, Annunciation 03-25, Nativity 12-25. Six other feasts
  were done on 2026-09-19; these three were deliberately excluded. Theophany and
  Nativity go through the Vesperal Liturgy path and appoint far more than three
  paremias; the Annunciation's vary with the Lenten day it falls on. Check each
  service path before wiring.
- M30 x1 — 02-02 Meeting of the Lord post-Gospel intercession. GENUINELY
  UNDECIDED, do not "fix" it: our data types the feast "theotokos", but it is a
  feast of the Lord by title and the OCA daily text omits the post-Gospel block
  entirely. Needs an OCA Matins order to settle.
- D20 x1 — 01-01 Circumcision + St. Basil co-celebration repeat. Correct order is
  verified in reference/scrape/2024-01-01.docx. Blocked on design:
  lic-repeat-patterns.json indexes into ONE commemoration; this needs per-GROUP
  repeat patterns.
- D21 x2, L43 x1 — added by another session; read the rules for context.

Not audit-visible:
- First Hour at the Vigil. The parish wants it as an optional, overlay-toggled
  tail. Blocked on sources: "Thou Who at all times...", "O Christ, the true
  Light...", the concluding kontakion and the small dismissal are in NO local
  file. Psalms 5/89/100 ARE in psalter.json and the theotokion "What shall we
  call thee" is reusable from royal-hours-fixed.json. Needs a Horologion.
  Do not author liturgical text from memory.
- Three untracked choir-director folders never compared against our output:
  "docs/9-12 and 9-13 and 9-14/" (includes the Exaltation Liturgy),
  "docs/9-19 and 9-20/", and "docs/11-8 Hierarchical liturgy/" (a hierarchical
  liturgy may be an entirely unmodeled axis — check before assuming).

## Non-negotiables

- FALSIFY every rule you add or change: reintroduce the bug, watch it fire, then
  restore. A rule that has never failed proves nothing. One rule shipped dead
  because it read a field the audit context never carries.
- `npm test` does NOT run test/contracts/ — it runs 4 named files. Use
  `npm run test:contracts` too. The pre-push hook runs both.
- Check ALL rule families before assigning a number; D18 already existed in
  B-availability while D-structure looked free.
- Never author liturgical text from memory. Cite reference/scrape/ or
  reference/orders/, or record it as a source gap.
- Orthocal text enrichment fills BY INDEX, not by citation — verify the returned
  readings match the printed references before authoring any.
- Changes to calendar/entry.js require a snapshot rebaseline
  (node scripts/snapshot-calendar-rules.js, run twice plus --check).
- Audit the parish overlay too: ?translation=st-john-damascus-tyler.
- Production deploys take 45-60s. Poll for the new CONTENT; a check that merely
  parses a response will read the stale build.

## What I want back

A triaged plan: each item bucketed (data-drift / structural / source-incomplete /
needs-my-decision), with blast radius, what it is blocked on, and the fix path.
Order by service-correctness risk, not by ease. Call out anything that needs a
source or a ruling from me — those I have to unblock. Then ask before starting.
```

---

## Why this prompt is shaped the way it is

**M19 is called out as invisible to the push gate.** It is the only `high`, but
2026-09-05 falls outside the 214-date representative sample the pre-push hook
runs, so pushes stay green while it sits. A session that equates "push passed"
with "year is clean" will never look at it.

**The "do not fix" items are framed as warnings, not tasks.** The Beatitudes
guard (L40) and the Meeting classification (M30) both look like quick wins and
both produce a confidently wrong service if taken at face value — the first by
sliding every troparion late through the renderer's right-alignment, the second
by asserting a rubric no available source settles. A cold session working from a
task list reaches for the easy-looking ones first.

**It asks for a plan, not edits.** Several open items are blocked on a source or
a ruling from the parish rather than on engineering, and those need to surface as
questions before anyone starts work that cannot finish.
