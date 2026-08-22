# OCA Services — project context

A briefing for someone (or some model) with **no access to the repository**.
Everything needed to reason about the project is here; file paths are given as
orientation, not as things you can open.

---

## 1. What it is

A Node.js web application that generates the full text of Orthodox Christian
services — Vespers, Matins, Divine Liturgy and about a dozen special services —
for **any calendar date**, and renders them as HTML service sheets a parish choir
can actually sing from.

Production: `https://oca-services-production.up.railway.app/`
Primary consumer: St. John of Damascus, Tyler, TX (an OCA parish). Their choir
director reports errors, which drives much of the work.

Scale: ~49,000 lines of hand-written JavaScript, a 7.6 MB SQLite corpus, 215
menaion data files, 234 archived OCA order-of-service documents. Node ≥ 24, two
runtime dependencies (`@anthropic-ai/sdk`, `@sentry/node`). No web framework —
plain `http` with a hand-rolled router.

**The hard part is not the software.** It is that Orthodox liturgical texts are
assembled from a dozen interlocking cycles, and correctness is judged against
published rubrics and centuries of practice. Most bugs are *liturgical*, not
computational: the code runs fine and sings the wrong hymn.

---

## 2. The domain in ten minutes

You need this to reason about anything else.

An Orthodox service is **assembled** from several independent cycles that
collide on a given day:

| Cycle | Period | Book |
|---|---|---|
| Weekly resurrection cycle, 8 "tones" | 8 weeks | **Octoechos** |
| Fixed calendar — saints by month/day | 1 year | **Menaion** |
| Movable Lenten cycle | keyed to Pascha | **Triodion** |
| Movable Paschal cycle | keyed to Pascha | **Pentecostarion** |

**Tone** is a melodic mode, 1-8, rotating weekly. It governs which Octoechos
hymns are used. (Gotcha: Saturday Great Vespers uses the tone of the week that is
*ending*, not the one beginning.)

Key vocabulary, because it appears constantly:

- **Sticheron / stichera** — hymns sung between psalm verses. The verse a
  sticheron is sung against is its **stichos**; *which stichos a hymn falls on is
  liturgically load-bearing*, not cosmetic.
- **Troparion** — a short summary hymn for a feast or saint. **Kontakion** —
  similar, sung later.
- **Theotokion** — a hymn to the Virgin Mary (the *Theotokos*), traditionally
  last in a group. **Dogmatikon** — a special Theotokion at Saturday Vespers.
- **Canon** — a long poem in nine **odes**; each ode has an **irmos** (model
  verse) plus **troparia**. Feasts often have two canons by different authors.
- **"Lord, I Call"** (Lord I Have Cried) — the main sticheron slot at Vespers.
- **Aposticha** — stichera near the end of Vespers. **Beatitudes** — troparia
  interleaved with the Beatitude verses at the Liturgy's Third Antiphon.
- **"Glory…" / "Now and ever…"** — two doxology lines near the end of a hymn
  group, each normally carrying its own hymn. **Which hymn claims each of these
  two slots is one of the most common sources of bugs in this project.**
- **Great Feast** — one of 12 major feasts. Each has a **forefeast**, an
  **afterfeast** (days that keep celebrating it), and a **leavetaking** (its
  final day, celebrated nearly in full).
- **Polyeleos / vigil / doxology** — *ranks*. A saint's rank determines how much
  of the service is theirs.

**"On N"** means N hymns are appointed for a slot. The slot has a fixed number of
verses; N hymns are placed **right-aligned** into them, so a list of the wrong
length silently moves every hymn onto the wrong verse. This has caused real bugs.

---

## 3. Architecture

Three data layers, plus an assembler:

1. **Service structure** (`service-structure/*.json`) — the ordered skeleton of
   a service. Each block is either `fixed` (points to a key in fixed texts) or
   `variable` (describes how to resolve content at runtime).
2. **Fixed texts** (`fixed-texts/*.json`) — invariable content (litanies,
   prayers, psalms), addressed by dot-notation keys.
3. **Variable sources** (`variable-sources/`, plus the SQLite DB) — the
   "liturgical books": Octoechos, Menaion, Triodion, Pentecostarion.

**The calendar entry is the conductor.** For a date it declares the season, the
tone, every commemoration ranked by priority, and — per service section — which
source to draw from, how many hymns, in what order, in which tone.

**The assembler** takes `(calendarDay, fixedTexts, sources)` and returns an
ordered array of `ServiceBlock` objects:

```js
{ id, section, type, speaker, text, tone?, source?, label? }
// type:    rubric | prayer | hymn | verse | response | doxology
// speaker: priest | deacon | reader | choir | all | null
```

A renderer turns those into HTML. **The block list is the contract** — audits,
tests and the LLM judge all read it.

Layout: `server-lib/` (~12.8k lines, HTTP routes, sources, overlays, parish
logic), `assemblers/` (~6.8k lines, one module per service), `audit/` (~6.8k),
`scripts/`, `test/`.

### Two axes layered on top

- **Translation overlays** (`fixed-texts/translations/<id>/`, 16 of them: `oca`,
  `rocor`, `antiochian`, `jordanville`, `hapgood`, `dmitri-royster`, …). Sparse
  overlays cascade onto a base via a declared `extends` chain, selected with
  `?translation=`. A drift detector warns when an overlay key matches nothing in
  the base. **Overlays only cover `fixed-texts/`, not `variable-sources/`** — a
  known structural limit.
- **Parish settings** (SQLite). A parish declares a jurisdiction, an overlay
  chain, a patron saint, a default pronoun register (archaic `thee/thy` vs
  modern), and typed rubric flags — e.g. `beatitudesTropariaReaderLed`,
  `includeSecondGospel`, `confessFirst`. Rubric flags reach the assembler as
  `rubrics.<section>.<flag>`.

**A trap worth knowing:** a parish is selected by `?translation=<parish-id>`, not
by a `?parish=` parameter. Several endpoints **silently ignore unknown query
parameters** rather than erroring — `?service=liturgy` on the wrong route returns
a different service with HTTP 200. More than one investigation has been derailed
by that.

### Date-shift

Vespers is served on the *eve*, so the API date is the civil evening and the
content comes from the **next** day's calendar entry. Matins and Liturgy are
unshifted. Easy to trip over when comparing services.

---

## 4. Correctness machinery

Because bugs are liturgical, verification is unusually heavy:

- **Rule-based audit** — 115 rule modules in six families: A-calendar, B-availability,
  C-substitution, **D-structure (90 rules)**, E-provenance, F-theme. Run per date
  or swept across the year.
- **Contract tests** — 27 files. Each encodes a feature as numbered invariants
  (INV-1, INV-2…) with the rubric citation in the header comment. The project
  rule is that a spec and its test land in the same commit as the fix.
- **Snapshot baselines** — 42 endpoint/date pairs hashed; any diff must be
  explained before the baseline is refreshed.
- **Determinism + drift checks** — the same date must assemble identically twice;
  drift checks catch scraper regressions and source-mixing.
- **An LLM judge** — weekly cron compares rendered services against the published
  OCA order and files findings; a second agent opens fix PRs (never auto-merged).
- **`audit/judge-known-divergences.json`** — deliberate departures from the OCA
  text, each with a recorded reason, so the judge stops reporting them and the
  fix agent never "corrects" them back. The stated bar: *a divergence is a
  decision someone made on purpose. A gap you haven't got to is not a divergence,
  it belongs in the findings.*

### The authoritative reference

`reference/orders/` holds **234 official OCA order-of-service documents** fetched
weekly by a cron. For any covered date these state exactly what is appointed. Two
caveats, both learned painfully: they cover **Sundays only**, and they frequently
name a hymn by its opening words alone, which is not enough to print it.

---

## 5. Hard-won lessons (the most valuable part of this document)

These are recurring, expensive, and non-obvious.

**1. A clean audit means very little.** Every bug found in the last month passed
the full rule suite, the contract tests, and the snapshot check. The rules verify
that structure is *present*, not that the *right hymn* is in a slot.

**2. Assert the position, not the label.** Four separate times a test asserted a
label, a count, or a sequence where it meant a structural position, passed, and
shipped a real defect. The worst: a Beatitudes contract asserted the count (10)
and the order (Resurrection → feast → saint). Both were correct. Neither said
*which verse each hymn falls on*, and all four resurrection hymns were two verses
late. It reached production and **a chorister caught it during the Liturgy**.
Ask: *if this passed and the service were still wrong, what would be wrong?*

**3. Always falsify a new invariant.** Break the thing deliberately and watch the
test fail. Two tests that looked green and correct were exposed this way.

**4. "The text doesn't exist" is usually wrong.** Every such conclusion in the
last month has been mistaken. One prokeimenon was written off after searching all
234 order documents; it was sitting in an `AT LITURGY` section of a source the
scraper had skipped — a book already cited in the same file's own comments.
**Check what the scraper skipped before concluding a book lacks something.**

**5. Prefer a visible hole to an invented text.** Never author a liturgical text
from general knowledge. If the source isn't in hand, leave the gap, say so, and
tell the choir — they have books.

**6. Don't ship the morning of.** A blend change was promoted hours before a
service; it was correct in intent and wrong in detail, and the choir met it cold.
Liturgical changes want a week and a note to the director.

**7. Data-integrity bugs are invisible to schemas.** Nine hymns had unclosed
quotation marks and 174 more carry footnote digits glued into sung text
("the God over all,1"). A truncated string is still a valid string, so every
schema passed. Text hygiene needs its own gate.

---

## 6. Current state and open work

Shipped and stable: all major services, the 12 Great Feasts plus Pascha (14
entries in all, Circumcision is also wired though it is not itself a Great
Feast), Holy Week, the Paschal cycle, multi-jurisdiction overlays, parish self-service admin, a practice layer
(a parish declares which hymns it actually sings), and choir/education modes.

The live work list is `docs/backlog-august-2026-service-review.md`, 10 items
grouped by root cause. The largest open items:

1. **A leavetaking inherits nothing from its feast.** On the leavetaking of the
   Dormition the service sang *generic* hymns to the Theotokos because that date
   had no hymns of its own, while the feast's real hymns sat in the database
   under the feast day. Substituted text, not missing text — much harder to
   catch. ~20 dates a year.
2. **Beatitudes are disabled on weekdays** by a single early return, and print an
   apology into the service sheet, while the source text exists.
3. **174 rows with footnote digits** in sung text.
4. **No Old Testament lessons at any vigil** — supported in code, absent from the
   data even for the greatest feasts.
5. **Some second propers are missing where appointed, and added where not.**

`TASKS.md` exists but is months stale and points at the backlog.

### Workflow conventions

Work lands on `staging`, then `main` is fast-forwarded to promote to production
(Railway auto-deploys `main`). A pre-push hook runs the full endpoint and rule
sweep. A weekly cron commits reference documents straight to `main`, so `main`
often can't fast-forward — merge `main` into `staging` rather than force-pushing.
Deploys are confirmed by probing behavior that changed, since `/healthz` carries
no version. Commit messages here are unusually discursive on purpose: they record
*why*, and are a primary medium of institutional memory.
