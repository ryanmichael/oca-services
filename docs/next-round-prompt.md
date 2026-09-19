# Next-round planning prompt

Paste the block below into a fresh Claude session to have it review open items
and propose the next round of updates.

**Regenerate with the `next-round-prompt` skill** rather than hand-editing — it
re-derives state from a full 365-date sweep, not from this file or a handoff, and
carries forward the framing that keeps the "do not fix" items from being read as
tasks.

**Keep it current.** The state snapshot and the open-items list below were true
at `7b07e9e` (2026-09-19). When items are closed or the SHA moves, update this
file in the same commit — a stale planning prompt is worse than none, because it
reads authoritative.

---

```
Review the open items on this project and propose a plan for the next round of
updates. Do NOT make code changes yet — produce a triaged plan and ask me which
parts to take.

## Orient first (do not trust memory alone)

1. Read MEMORY.md, then project_session_handoff_2026_09_19.md and BOTH 09-13
   handoffs — a second session ran in parallel that evening.
2. Establish real state before planning — memory reflects when it was written:
     git log --oneline -15 ; git status --short
     git rev-parse origin/main origin/staging HEAD
     npm run drift:check
     node server.js &            # then:
     npm run audit:full          # 365 dates; the pre-push sample is only 214
3. Reconcile what you find against the list below. If they disagree, the repo
   wins — say so explicitly rather than planning against a stale list.

As of 2026-09-19, main = staging = 7b07e9e, tree clean apart from untracked
choir PDFs. Year sweep: 0 high, 0 medium, 14 low. drift:check has one
pre-existing warning (comm 1823, 9-6 Archangel Michael, mixed sources).

There is NO open `high`. M19 (2026-09-05 Matins Lauds) was closed on 09-19 — it
proved to be a routing bug, not the sourcing gap it had been triaged as. Keep
running the FULL sweep anyway: M19 sat outside the 214-date pre-push sample for
two weeks, so pushes stayed green while it drifted, and the next such finding
will be just as invisible.

## Known open items — all tracked `low`

Each carries its evidence in the rule's KNOWN_SOURCE_GAPS / NEEDS_DECISION map.

- L40 x6 — Great Feast Beatitudes render a placeholder:
  01-01, 02-02, 03-25, 08-15, 09-08, 11-21.
  DO NOT simply delete the `if (!isSunday) return []` guard in beatitudes.js.
  The renderer RIGHT-ALIGNS troparia into 12 slots
  (`startSlot = totalSlots - tropList.length`), so a short list slides every
  troparion later — the 2026-08-16 failure caught from the kliros mid-Liturgy.
  9-08 needs Canon II (Andrew of Crete, Tone 8), absent from the corpus.
  The 9-20 blend (7b07e9e) is the worked example of doing this correctly:
  reserve unsourced slots with `missing:`, placed FIRST in their group so the
  Glory and Now-and-ever keep real text.
- D19 x3 — Theophany (eve 01-05), Annunciation (03-24), Nativity (12-24).
  Six other feasts were authored on 09-19; these three were DELIBERATELY
  excluded. Theophany and the Nativity go through the Vesperal Liturgy path and
  appoint far more than three paremias; the Annunciation's vary with the Lenten
  day it falls on. Check each service path before wiring — do not copy the
  pattern.
- D21 x2 — 01-03, 08-15. Which saint takes the Glory is not derivable from the
  orders, so those dates are named in KNOWN_GLORY_GAPS rather than guessed.
  (09-19's entry was resolved that day: the order and the choir packet both
  named St. Eustathius.)
- M30 x1 — 02-02 Meeting of the Lord post-Gospel intercession. GENUINELY
  UNDECIDED, do not "fix" it: our data types the feast "theotokos", but it is a
  feast of the Lord by title and the OCA daily text omits the post-Gospel block
  entirely. Needs an OCA Matins order to settle.
- L43 x1 — 09-13 Founding of the Church Beatitudes. The Dedication canon (John
  the Monk, Tone 4) is not in the corpus; september-13.json says so explicitly.
  Same right-alignment hazard as L40 — do not wire a partial set.
- D20 x1 — 12-31 Circumcision + St. Basil co-celebration repeat. Correct order
  verified in reference/scrape/2024-01-01.docx. Blocked on design:
  lic-repeat-patterns.json indexes ONE commemoration; needs per-GROUP patterns.

## Not audit-visible

- 2 Beatitude troparia unsourced on 9-20: Ode 8 of the Cross canon (acrostic
  Canon I of Cosmas — 3 is likely its true length, so the order's 4th is not
  identifiable) and one from Ode 6 of september-20. Held open as `missing`
  reservations, so the alignment is ALREADY correct; they drop straight in if a
  fuller Menaion appears. No OCA text for 9-20, 2024-09-15 or 2025-09-21 prints
  the Beatitudes.
- 9-21 Leavetaking lessons render their citations but NO scripture text. The
  menaion file has otReadings; orthocal cannot match the composite Proverbs
  ranges, so all three fall back to the placeholder. The third also reads
  "Wisdom of Solomon Wisdom 4:7-15 (adapted)" — a doubled book name. Queued by
  the 09-13-evening session as "verify 9-21 lessons"; half-done.
- First Hour at the Vigil — the parish wants it as an optional, overlay-toggled
  tail. Blocked on sources: "Thou Who at all times...", "O Christ, the true
  Light...", the concluding kontakion and the small dismissal are in NO local
  file. Psalms 5/89/100 ARE in psalter.json and the theotokion "What shall we
  call thee" is reusable from royal-hours-fixed.json. Needs a Horologion.
- Two untracked choir folders never compared against our output:
  "docs/9-12 and 9-13 and 9-14/" (includes the Exaltation Liturgy) and
  "docs/11-8 Hierarchical liturgy/" — a hierarchical liturgy may be an entirely
  unmodeled axis, so check before assuming it is a small diff. Use the
  `/choir-packet-review` skill. ("docs/9-19 and 9-20/" was reviewed on 09-19.)
- Cross Sunday (2026-03-15) renders reading announcements with no pericope
  rubric. Pre-existing, noticed in passing, unexamined.
- Lambertsen ingestion is CLOSED (2026-09-19, deprioritized — no concern with
  the source itself). The 1,057 shipped rows STAY: all 223 commemorations carry
  ONLY Lambertsen rows, so removing them regresses every one of those saints to
  the generic fallback. Do not pick the 12 held chapters back up.

## Non-negotiables

- FALSIFY every rule you add or change: reintroduce the bug, watch it fire, then
  restore. TWO rules in one session shipped unable to fire at all, each reading
  a field its audit context never carries (M30 read ctx.assembled.spec; L44 read
  ctx.calendarEntry.commemorations, which is EMPTY for liturgy). A green rule
  proves nothing.
- `storage/oca.db` IS TRACKED, and a DB-only change leaves the working tree
  clean of source files. Run `git status` after any DB write and before
  promoting — no test catches a missing DB commit, and production will run new
  code against old rows.
- `npm test` does NOT run test/contracts/ — it runs 4 named files. Use
  `npm run test:contracts` too. The pre-push hook runs both.
- Check ALL rule families before assigning a number; D18 already existed in
  B-availability while D-structure looked free.
- Never author liturgical text from memory. Cite reference/scrape/ or
  reference/orders/, or record a source gap.
- Orthocal text enrichment fills BY INDEX, not by citation — verify the returned
  readings match the printed references before authoring any.
- MEASURE before overturning a documented design. The Liturgy sang the feast
  troparion last because the code generalised from the ONE order that does so;
  across all 240 orders, 35 of 36 sing it second.
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

**There is no open `high`, and that is worth stating plainly.** The previous
version led with M19 as the standing example of a finding invisible to the
pre-push gate. M19 closed on 09-19 — but the lesson outlived it, so the
full-sweep-not-the-214-sample warning stays in the orient step. The next such
finding will be just as invisible.

**The "do not fix" items are framed as warnings, not tasks.** L40, L43 and M30
all look like quick wins and all produce a confidently wrong *service* if taken
at face value — the first two by sliding every troparion late through the
renderer's 12-slot right-alignment, the third by asserting a rubric no available
source settles. A cold session working from a task list reaches for the
easy-looking ones first.

**Deliberate exclusions say why.** "Three feasts not done" reads as an oversight;
"not done because Theophany and the Nativity go through the Vesperal Liturgy path
and appoint far more than three paremias" stops someone copy-pasting the pattern
into a wrong answer. The same applies to Lambertsen: recorded as a priority call
with no concern about the source, so it cannot later be misread as a provenance
ruling.

**It asks for a plan, not edits.** Several items are blocked on a source or a
ruling from the parish rather than on engineering, and those need to surface as
questions before anyone starts work that cannot finish.
