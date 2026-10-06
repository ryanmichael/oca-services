# Proposal: how we measure accuracy — Vespers and Divine Liturgy

**Status:** proposal, 2026-10-06. Nothing here is implemented.
**Scope:** Vespers (`/api/service?service=vespers`) and Divine Liturgy (`/api/liturgy`).
**Brief:** `docs/handoff-measuring-accuracy.md`.
**Method:** every number below was measured against this repo on 2026-10-06, with a
live server on `:3000` and the parish overlay `?translation=st-john-damascus-tyler`.
Commands are in Appendix C. Where this disagrees with the brief, the measurement
is given and the disagreement is named.

---

## 0. The one-paragraph answer

The readers are the parish's **laity, who sing by following the choir**, so the
only thing the page has to get right is the words, in order. Measured against the
director's own sheets, Great Vespers prints 85% of the hymns sung and 36% of them
in the choir's exact words; **Divine Liturgy prints 16%, and 0% in the choir's
words.** That is the finding, and it was invisible because nothing compared our
text to the packets — the full hymn text has been sitting unread in 104 OCR'd
pages.

Underneath it are two measurement faults. **Fail-open:** the headline surface
returns `high=0 medium=0 low=0` and exit 0 when it checks nothing, reproduced
three ways, so "clean" and "unchecked" are the same reading. **Conflation:** one
`findings` count sums seven independent axes, one of which (`D23`) is 92% of the
total, is blind to a quarter of the year, and is bounded below by books that do
not exist. Fix those two and the existing surfaces are mostly adequate — the gap
is not instrumentation, it is the Liturgy corpus.

---

## 1. Scorecard for the people who sing from this

**Who reads it (settled 2026-10-06):** the parish's **laity, who sing by
following the choir.** That decides everything below. Someone following along
needs the words on the page to be the words being sung, in the order they are
sung. They never read the tone — that is a choir-direction datum. They do not
ask which book a hymn came from.

An earlier draft of this section was built for a choir director and led with
"which book is this from?". That question is real but it is not this audience's,
and designing for it inverted the priorities — see §2.0.

Four numbers.

### 1.1 "Are these the words we will actually sing?"

> **"Of the hymns on the service sheets you have sent us, we print 85% at Great
> Vespers — and 36% in the exact words your choir sings. At Divine Liturgy we
> print 16%, and none in your words."**

- **Computed as:** the choir packets' OCR'd `[text]` pages hold complete hymn
  text. Match each against our render for that date by character-trigram
  similarity, register-folded so thee/thou vs you is not counted as a difference.
  Then ask separately whether the wording is verbatim. `npm run audit:packet-diff`.
- **Measured today**, 22 sheets, 9 packets, 173 hymns:

  | | sheets | hymns on them | we print the hymn | in their words |
  |---|---|---|---|---|
  | Great Vespers | 8 | 84 | 71 (85%) | 30 (36%) |
  | Daily Vespers | 3 | 22 | 19 (86%) | 7 (32%) |
  | **Divine Liturgy** | 11 | 67 | **11 (16%)** | **0 (0%)** |

- **Why two columns and not one:** printing the *right hymn in other words* is a
  different problem, with a different owner, from printing the *wrong hymn*. The
  first loses a reader their place; the second is a sourcing gap.
- **Good looks like:** the first column at 100% — we should always print the
  right hymn. The second rising deliberately and never falling silently. 36% is
  not a failing grade: OCA publishes propers for roughly a third of days, so the
  parish and we often hold different translations of the same hymn.
- **Spot-check:** take any packet, pick a sticheron, search for its first line in
  our page for that date. Three outcomes, three different meanings: exact match,
  same hymn in different English, absent.
- **Honest caveat:** the Liturgy 16% is a **floor**. Some of what the extractor
  counted as a missed Liturgy hymn is a prokeimenon verse or an antiphon our
  Liturgy route carries as a non-hymn block, and three of the eleven "Liturgy"
  sheets carry Saturday-evening Vespers material. **The 0% verbatim is the robust
  half**, and it is the finding that matters: nothing on our Liturgy page is in
  the words the choir sings. Tightening the 16% is the highest-value measurement
  work outstanding.

### 1.2 "Will I lose my place?"

> **"Every hymn we print that your choir sings is in the order your choir sings
> it — 101 of 101 across all 22 sheets."**

- **Computed as:** of the hymns located in 1.1, the longest run that appears in
  our render in the packet's sequence (longest increasing subsequence of matched
  positions). `npm run audit:packet-diff`.
- **Measured today:** **101 / 101.** Order is clean on every sheet we hold.
- **Why it is on the card when it is green:** on 2026-07-12 four Resurrection
  troparia sat two stichoi late and shipped green past the audit, 376 contract
  tests and a rule that asserted count and sequence — caught by a human
  mid-Liturgy (`feedback_assert_structure_not_labels`). Right hymns, right words,
  wrong place still loses a reader. This is the tripwire for that class, and it
  is a **wall at 100%**, not a watermark.
- **Where it is weak:** Liturgy locates only 11 hymns, so coverage is thinnest
  exactly where the known incident happened. The measure improves as 1.1's
  Liturgy floor is fixed.
- **Spot-check:** read our page against a packet side by side and see whether you
  ever have to turn backwards.

### 1.3 "Where do you already know you are short?"

Two columns, never one — and the brief is right that clergy and laity are the
audience most entitled to the distinction.

> **"We know of 23 evenings that are not yet right. On 10 we print a general hymn
> for a saint instead of that saint's own — those texts exist, we just don't hold
> them yet. On 13 we cannot tell you which book a hymn came from."**

| | dates | column |
|---|---|---|
| a saint sung from the General Menaion (general text, name substituted) | 10 | **we don't hold it yet** |
| a sung hymn whose book we cannot identify | 13 | **we don't know** |
| Great Feast with no Old Testament lessons | 3 | **no book we can reach has this** |
| Great Feast whose Beatitudes render a placeholder | 6 (Liturgy) | **no book we can reach has this** |

- **Corrected 2026-10-06 — the 10 General-Menaion dates were mis-filed.** An
  earlier draft put them under "no book we can reach has this". They are not.
  `audit/ocanwa-baseline/` holds a real OCA parish's sheet-music filenames, and
  for several of these dates it names that saint's **own** hymns, with slot and
  tone:

  ```
  0509-Lord I Call-1-Prophet Isaiah-Rejoice O Isaiah!-OBIKHOD-Tone4
  0511-Lord I Call-2-St Cyril and St Methodius-With what hymns of praise-OBIKHOD-Tone2
  1212-Aposticha-Verse2-St Spyridon-Wise bishop Spyridon-OBIKHOD-Tone1
  ```

  So the proper texts exist and we have their incipit, slot and tone. This is a
  **corpus gap we can close**, not an absence in the tradition. Conflating the
  two is exactly what makes a number unusable.
- **The saint we pick is right.** All nine of these dates where the baseline
  names a saint report `ok` in `audit:parish-baseline` — our principal matches.
  The general text is a *coverage* failure, not a *selection* failure. (I briefly
  concluded the opposite by comparing the baseline's liturgical day against our
  civil-evening API date; see §5.2.)
- **The oracle already knew and could not say so.** Those dates pass
  `audit:parish-baseline` clean, because it checks *who is commemorated*, never
  *whether the text is proper*. Its `slots p/o` column shows the gap — `0509 3/5`,
  `0511 4/3`, `1212 6/3` — and is marked info-only.
- **Good looks like:** the left column shrinking as the corpus grows, the right
  column at zero, and no date in both.
- **Spot-check:** on 2026-07-09 the saint's stichera read as general praise with
  the name inserted rather than anything specific to Anthony. That is visible on
  the page.

### 1.4 "What changed since last week?"

> **"Since last Sunday, 3 hymns changed across 2 evenings. All 3 were corrections
> your director asked for. Nothing else moved."**

- **Computed as:** a weekly diff of *sung hymn text only* — not bytes, not block
  counts — over the next 14 days, each change attributed to a `corrections_log`
  row where one exists.
- **Not available today.** `snapshot:verify` stores a SHA-256 of whole endpoint
  responses for 12 endpoints over a handful of dates; it detects that *something*
  changed, cannot say what, and breaks on every intentional fix. This is the one
  number on this card that needs building rather than re-scoping (§3, S8).
- **Good looks like:** every line attributable. An unattributed change is the
  signal — something moved that nobody asked for.

### 1.5 What this card does and does not need

**It needs no provenance.** 1.1 and 1.2 compare text to text and work on both
services today. That is the consequence of the audience decision: "which book is
this from?" was the question that made Liturgy provenance the top
recommendation, and it is not this audience's question. Provenance is still how
1.3's right-hand column is computed, and it is still absent from all 330 Liturgy
dates — but it is now a reporting convenience, not a prerequisite.

**Tone is deliberately absent.** Laity following the choir do not read it. The
17 tone rows already shipped stay; the open question about which book wins on a
tone conflict is backlogged (§7).

---

## 2. Scorecard for us

### 2.0 What the audience decision changed

Recording this because it reversed the priority order, and the reasoning is the
transferable part:

| | before | after | why |
|---|---|---|---|
| M3 packet fidelity | one of seven | **primary** | the direct measure of "can I follow this page" |
| M8 order | absent | **on both cards** | right hymns in the wrong place still loses a reader |
| M1 book-named rate | headline candidate | internal | "which book" is not the audience's question |
| M2 parish-book conformance | card number 1 | a *proxy* for M3, and a weak one | book ≈ wording, but only roughly |
| M6 Liturgy provenance | top recommendation | now R6 | fixes reporting, not the page |
| tone-bearing rules | counted | backlog | not read by this audience |

Deferring tone **costs nothing today**: of the 169 full-year findings — 156 D23,
6 L40, 3 D19, 2 D21, 1 L43, 1 D20 — none is tone-only.

One nuance worth keeping: `D23`'s *concern* is right for this audience. "Do the
words shift mid-service" is exactly what a layperson notices, and it was found
because a parishioner heard the seam. But D23 measures internal consistency
*between books*, not agreement with *what is sung*. So pulling it from the
headline still stands; what replaces it is M3's wording column, not M2's book
list.

### 2.1 The measures

Eight, reported separately. No total.

| | measure | question | service | reaches zero? | today |
|---|---|---|---|---|---|
| **M3** | Packet fidelity (two numbers) | Of the hymns on the director's sheets, how many do we print, and how many in their words? | both | located yes; verbatim no | GV 85%/36% · DV 86%/32% · **Lit 16%/0%** |
| **M8** | Order agreement | Are the hymns we print in the order they are sung? | both | yes — wall at 100% | **101/101** |
| **M5** | Text well-formedness | Is every stored hymn grammatical English in both registers? | both | yes — wall at 0 | 9 invariants green; see the two live defects below |
| **M4** | Selection fidelity | Do we make the same saint principal, with the same sticheron count, as a real OCA parish? | Vespers | no — ratchet | 301 dates, **65 gated** |
| **M1** | Book-named rate | Of sung hymns, how many have a *determined* translation rather than a defaulted one? | Vespers | yes → 100% | 3,956/4,641 = **85.2%**; **630 defaulted** |
| **M2** | Parish-book conformance | On how many dates is every sung hymn from a book this parish uses? | Vespers | yes → 365 | **223 pass / 141 fail / 1 no-content** |
| **M6** | Liturgy provenance coverage | What share of Liturgy sung blocks carries a book and a translation? | Liturgy | yes → 100% | **0%** |
| **M7** | Corpus drift | Has any row changed against the published source since baseline? | both | n/a — NEW-only | 218→191, **2 NEW**, 29 resolved |

**M3 — the primary.** `npm run audit:packet-diff`. Alignment is measured per
sheet from `{-1, 0, +1}` and printed, because the director uses two filename
conventions and assuming one reported Daily Vespers as 0/13 when it is 10/12.
*When it moves the wrong way:* a falling verbatim rate after a corpus change
means a conversion overwrote the parish's wording — check `corrections_log`
before the data.

**M8 — the order tripwire.** Longest increasing subsequence of matched block
positions, per sheet. Green today and on the card anyway, because the failure it
guards shipped past every other surface and was caught by a human mid-Liturgy.
Falsified on six synthetic orderings: perfect→6/6, reversed→1/6, the 07-12
two-late shape→2/4. *When it moves the wrong way:* a real regression; no benign
reading.

**M5 — keep it a wall.** The best-designed surface in the repo and the model for
the others: asserts zero where clean, itemises baselines where there is real
debt, and has stale-entry checks so a list cannot outlive its debt. Two live
defects it does not yet catch:
- **Row 8437** renders into the 2026-02-12 Lord-I-Have-Cried Theotokion as
  `", or this Upon beholding the ripe Cluster…"`. Three detectors miss it for
  three different literals. A widened leading-character class finds 12 rows, not
  2 — including three bare scripture citations stored as sung text.
- **60 rows carry a footnote digit glued to a word** (`"upon yourself1 from thy
  youth"`, `troparia` 2836/39524). No check exists for the class; `drift:check`
  tests glued *punctuation* but not glued digits.
- A third class is now closed: render-time `(name)` substitution in the General
  Menaion, which no sweep of stored text can see. Three of the ten dates were
  substituting a rank or an event word live in prod (`"O Apostle Equals"`). Fixed
  and walled by `test/contracts/general-menaion-name.test.js`, whose INV-8 proves
  the invariants fail against the pre-fix code.

**M4 — report it honestly.** `ocanwa.org` is a *different* OCA parish, so M4
measures fidelity to **OCA practice**, not to St John of Damascus. It answers
"is the right saint principal with the right sticheron count" — selection and
ordering, never text. Do not let it be read as a parish-fidelity number; that is
M3's job. Its `slots p/o` column should be promoted from info-only: it is the
signal that caught the 10 General-Menaion dates being under-served.

**M1 / M2 — internal, and M1 exposes the brief's one wrong number.** The brief's
table reads "dates with any hymn whose book is unidentified: Vespers **0**". The
honest figure is **88 of 365**, and 630 sung hymns display a book attribution
that is a default, not a determination. Cause: the translation index covers
`octoechos.json` and the `stichera` table but **not** `triodion.json` or
`pentecostarion.json` — 458 Triodion, 163 Pentecostarion, 64 Menaion. The same
consequence hits `D23`, which skips `unknown` by design (`INV-6`) and therefore
**cannot fire on 88 dates, including 39 in Great Lent and 7 in Holy Week.**
*When M1 moves the wrong way:* indexing the two missing files will raise M1 and
raise D23 with it, because hymns that were invisible become visible. Predict it
in the commit message.

**M2's three columns.** 223 pass · 141 fail · 1 no-content. The "no-content" date
— 2026-04-02, Friday of the 6th week of Great Lent — renders **one hymn block in
the whole service** and no Lord-I-Have-Cried stichera at all. It would pass a
two-column conformance test trivially by having nothing to be non-conformant
with. That is why this measure reports three numbers.

**M6 — demoted, not dropped.** 0% today. It is how 1.3's right-hand column gets
computed, and `api-liturgy.js` is the only one of four sibling routes that does
not tag provenance. But it does not change a word on the page, so it is no longer
the first thing to do.

**M7 — keep exactly as is.** The reference ratchet: baseline 218, current 191,
reports only the **2 NEW**. Every other ratchet in the repo should be rebuilt in
this shape.

## 3. Verdict on every existing surface

| | surface | verdict | why |
|---|---|---|---|
| S1 | `npm run audit` / `audit:full` | **keep, fix fail-open** | Returns `0/0/0` exit 0 against a dead server (§5.1). Must fail closed. |
| S2 | `audit:quick` | **retire** | 365 dates, `--strict`, **0/0/0, exit 0**, while the same sweep with `--http` finds 159. 122 of 131 rules are `needsAssembled`. It cannot pass meaningfully, so it only manufactures confidence. |
| S3 | `audit:date` | **keep** | Single-date `--print` path is the one that got the ECONNREFUSED hardening. Genuinely useful. |
| S4 | `D23-translation-mix` | **re-scope, remove from headline** | See §3.1. |
| S5 | contract tests (55 files, 26 in scope) | **keep** | Plus the M5 widening. |
| S6 | unit tests | **keep as is** | Transform-level, feeds both services. |
| S7 | `drift:check` | **re-scope exit code** | Exits FAIL on one long-standing warning (comm 1823) — the brief is right that this trains people to ignore it. It also *prints* 3 overlay silent-drift lines it does not *count*. Make it NEW-only like M7, and either count those 3 or drop them. |
| S8 | `snapshot:capture/verify` | **re-scope** | A SHA-256 of whole endpoint responses over ~12 dates. Detects change, cannot name it, breaks on every intentional fix. Rebuild as a sung-hymn-text diff to serve card number 1.4. |
| S9 | `snapshot:determinism` | **keep** | Narrow, cheap, answers a real question (same input → same output). |
| S10 | `rescrape:check` | **keep — the model** | §M7. |
| S11 | `audit:parish-baseline` | **keep and promote** | §M4. Best coverage of any oracle at 301/365. |
| S12 | LLM judge | **keep, narrow** | ~$0.015/date. Restrict to the two services and to upcoming dates. §6. |
| S13 | `audit:endpoints` | **keep** | Clean today (0 issues, 0 errors). Closes the empty-text/placeholder/duplicate-id class. **Missing from the brief's inventory.** |
| S14 | `coverage-report` | **keep, re-scope** | The coverage axis (§3.2) already has a home here. **Missing from the brief's inventory.** |
| S15 | `translation-matrix` | **keep** | Asserts overlay × date × endpoint all 200. Liveness, not accuracy. **Missing from the brief's inventory.** |
| S16 | `audit:rank-coverage` | **merge into M4** | Same axis as the parish baseline. **Missing from the brief's inventory.** |
| S17 | `test:e2e` | **keep, out of scope** | Rendering, not accuracy. |
| S18 | `corrections_log` (14 rows) | **keep and promote** | Should become the regression ledger (§4). |
| S19 | choir packets | **invest — the primary oracle** | §M3/§M8. The `[text]` pages now feed `audit:packet-diff`; R2 tightens its Liturgy half. |
| S20 | `known-issues.json` `parishOverrides` | **re-scope** | 5 entries, all Liturgy, every one naming an `anticipatedRule` that **does not exist**. They suppress nothing and record real parish divergence that no measure reports. Convert them into the expectation table M2/M6 will need. |
| S21 | boot-time migration failure | **fix** | `node server.js` prints `Schema migrations failed at boot: UNIQUE constraint failed: commemorations.month, commemorations.day, commemorations.title` and continues. A swallowed boot error is the same fail-open pattern as S1. |

### 3.1 What to do about `D23` specifically

`D23` is **156 of 169 findings (92%)** on a full-year Vespers+Liturgy sweep. The
brief says 88 of 101; that was the sampled run (`--sample representative`). Either
way it dominates, and it is the metric that rose when the texts improved.

Three facts decide its fate:

1. **It cannot reach zero.** 26 of its festal findings have no OCA text in any
   year. Documented, verified, not disputed.
2. **It is blind to a quarter of the year.** `if (fam === 'unknown') continue;`,
   combined with the unindexed Triodion and Pentecostarion, means **D23 cannot
   fire on 88 of 365 Vespers — including 53 dates in Great Lent and Holy Week**,
   the most-attended services of the year. This blindness is pinned as intended by
   `INV-6`, and I have found no record that its *extent* was known.
3. **Its two clauses answer different questions.** Clause 1 (one translation
   within a role) is a *watch*: it fires on correct practice whenever sourcing
   changes. Clause 2 (a Sunday or Great Feast should be OCA throughout) is
   *actionable*: it is the Hierotheus defect, the one a parishioner heard.

**Recommendation R8** (Appendix A): split it.

- **`D23a` role-mix** → keep the rule, **remove it from any headline count**,
  report it as a standing inventory in `features/translation-mix.md`. It is a map
  of the conversion backlog, not a defect count.
- **`D23b` festal-not-OCA** → promote to its own named measure with
  `severity: medium`, and gate it. It is bounded, actionable, and currently buried
  under 10× its own volume.
- Index the missing source files (R7). **Expect D23a to rise.** Say so first.
- Replace `D23` in the headline with **M3's wording column** — not M2. D23's
  concern is right for this audience ("do the words shift mid-service" is what a
  parishioner heard), but it measures consistency *between books*, while M3
  measures agreement with *what is actually sung*. M2's book list is a proxy for
  the same thing and a weaker one.

### 3.2 The axes, separated and weighted

The brief asks whether these carry the same weight in both services. They do not,
and this is why one scorecard cannot serve both.

Reweighted 2026-10-06 for the audience: the rightmost column is what a layperson
following the choir actually experiences.

| axis | Vespers | Liturgy | measure | weight for this audience |
|---|---|---|---|---|
| fidelity to the parish | **dominant** — whose English | **0 of 67 verbatim** | M3 | **highest** — it is the page's whole job |
| order | clean | thinly covered | M8 | **high** — wrong place loses a reader |
| well-formedness | properties of stored text, both equally | M5 | **high** — it is read aloud |
| coverage | 10 general-text dates, 3 missing lesson sets | 6 placeholder Beatitudes | S14, M4 | medium |
| liturgical correctness | which hymn, which slot | **dominant** — antiphons, entrance verse, troparia/kontakia order, prokeimenon/alleluia | M4 (Vespers); **nothing for Liturgy** | medium |
| fidelity to a source | which translation | minor | M1, M7 | **low** — "which book" is not their question |
| tone | — | — | deferred | **none** — they follow the choir |

**Liturgy is under-measured, not correct — established, not inferred.** It
produced 7 of the brief's 101 findings. Against the parish's own sheets, **0 of 67
Liturgy hymns are in their wording and only 11 of 67 appear at all**, while Great
Vespers — which has had all the attention — reaches 85%/36%. Of 131 rules, the
Liturgy ones (`L1`–`L44`) are overwhelmingly *fixed-text* assertions: Trisagion
wording, Creed opening, Lord's Prayer text, litany openings. Those are the parts
that never vary. Almost nothing asserts the **variable propers**, which is where
Liturgy actually fails.

---

## 4. The regression story: when is a class *closed*?

The 10-05 session's lesson, generalised. A defect class is closed when **all
four** hold. Three is not enough, and the repo has several examples of three.

1. **The transform is fixed, not the rows.** Every 10-05 defect lived in
   `yy-to-tt.js`, `pronouns.js` or `raphaela-parse.js`, and every one had
   previously been "fixed" by correcting output rows. One row recorded as
   corrected on 2026-09-20 was still wrong in production six weeks later.
2. **A detector exists that would have failed before the fix**, and this was
   demonstrated by running it against the pre-fix state — not argued.
3. **The detector is keyed on the defect's *structure*, not on its observed
   literals.** This is the one `0cd1b02` missed. Nine hand-grown patterns is a
   list of instances wearing the costume of a class; row 8437 walked straight
   through all nine. A structural key would be *"a sung text may not begin
   with a non-capital, non-quote character"* — one rule, 12 rows, no list.
4. **The remaining debt is itemised with ids, and a stale-entry check fails if an
   entry is repaired.** `MID_SENTENCE_BASELINE` + `INV-6` is the pattern. A bare
   `new Set([])` claiming victory is not.

**Ratchets vs walls — which is standard?**

The repo has both and the choice is currently ad hoc. Proposed rule:

- **Wall (assert zero)** when the class is *materially* closeable: no missing
  books, no open liturgical questions. M1, M5, M6 and the whole well-formedness
  family are walls. `KNOWN_RUBRIC_BLEED = new Set([])` is a wall, correctly.
- **Ratchet (baseline + NEW-only)** when the floor is bounded by material we do
  not have, or by a question only the director can answer. M4 and M7 are
  ratchets. `rescrape:check` is the reference implementation.
- **Never a silent suppression set.** `knownFailures: []` is empty by policy and
  should stay empty. The failure mode it prevents is real: a suppression with no
  stale-check becomes permanent and invisible. Every ratchet must itemise and must
  fail when an entry is repaired.
- **`parishOverrides` is a third thing** and should be renamed. It is not
  suppression; it is an **expectation table** — the parish deliberately diverges
  from OCA. Five entries today, all pointing at rules that were never written.
  M2 and M6 both need exactly this table, so build it properly.

---

## 5. Falsification: how a measure earns trust

Already project practice; making it explicit, because **I violated it twice today
and it caught me both times.** Those two incidents are the best argument for the
rule, so they are recorded rather than tidied away.

**The requirement.** No measure is reported until it has been shown to *fail* on
a case where failure is the correct outcome. For a new audit rule: run it against
the pre-fix state and watch it fire. For a comparison: run it against deliberately
mismatched inputs and watch the score collapse. Put the falsification in the
commit message with its numbers. A measure that has never failed is a measure
whose reach is unknown.

### 5.1 Fail-open is the dominant failure mode here

Three independent reproductions today:

- `node audit/index.js --year 2026 --services vespers,liturgy --http http://localhost:3999`
  → **`high=0 medium=0 low=0`, exit 0.** Nothing listening on 3999.
- `audit:quick` (365 dates, `--strict`) → **0/0/0, exit 0**; with `--http`, 159
  findings.
- `node server.js` → prints `Schema migrations failed at boot` and serves anyway.

The first one matters most, and its history is instructive. On 2026-09-23 this
exact false green was found and fixed — in `fetchAssembled` (`audit/index.js:92`),
which carries a careful comment about it. But the sweep used by `npm run audit`
has a **second, duplicated fetch** (`audit/runner.js:65`) with a bare
`catch (_) { /* leave ctx.assembled undefined */ }`, and `runner.js:74` then does
`if (rule.needsAssembled && !ctx.assembled) continue;`. **The fix was applied to
the path that was not the problem.** One fetch helper, shared, failing loudly,
removes the whole class.

### 5.2 My own three misreadings

**Misreading 1 — conflating two axes.** My first packet probe matched the
packets' 4–6 word incipits as text prefixes and reported **68% "ABSENT"**. Its own
control had already failed (a known-present incipit scored `false`) and I nearly
reported the number anyway. Inspection showed why: on 2026-06-30 the packet's
*"You ever have Christ working"* is our *"Ever having Christ working within you"* —
the same hymn in a different translation. The probe was measuring *wording* and
reporting it as *absence*. Rebuilt as two separate axes (§M3).

A measured consequence worth keeping: a 25-character incipit is **too little
signal** to identify a hymn across translations. Same-hymn-different-register
pairs score 0.56 at 25 characters and 0.86 at full length, while different hymns
score ≤0.26 throughout — so length is what makes the comparison possible, and the
index stores the one length that does not work.

**Misreading 2 — assuming the date convention.** With full text the probe reported
Daily Vespers at **0 of 13** on the two most recent sheets. I tested ±1 day before
reporting, and it was **10 of 12 at −1**. The shipped script measures the offset
per sheet and prints it: Great Vespers is `{0: 8}`, Daily Vespers `{0: 1, -1: 2}`. The director names *Great Vespers*
sheets by the civil evening (our API date) and the two most recent *Daily Vespers*
sheets by the **content date**. Assuming one convention would have had me report a
fabricated regression in the Daily Octoechos work that shipped on 2026-10-05.

**Misreading 3 — the same date convention again, in the other direction.** Asked
whether the 10 General-Menaion dates were answerable from evidence, I compared
`audit/ocanwa-baseline/`'s `0510` sheet against our API date `2026-05-10` and
concluded we pick **a different saint on 8 of 10 dates** — which would have been
the largest finding in this document. Vespers API date 05-10 renders content for
May 11; the baseline keys by liturgical day. Corrected, our saint matches on all
nine dates where the baseline names one, and all nine report `ok` in
`audit:parish-baseline`. The `vespersDate` field was in the response the whole
time.

**Three strikes on one convention, so it gets a rule, not a reminder.** Every
cross-source comparison must *resolve* its date convention explicitly and show
the resolution in its output — never assume and never infer. `choir-packet-diff.js`
does this by scoring `{-1, 0, +1}` and printing the offset it chose; the
provenance sweep prints `liturgical <date>` beside each API date. A comparison
that does not state its convention is not reportable.

This is also why the three dropped director questions (Appendix A) were worth
asking of the data first: two of the three dissolved, and the third dissolved
only after I corrected my own date error. Had I asked Connie, I would have spent
her attention on a question built on my mistake.

---

## 6. Cost

| | per run | cadence | per month |
|---|---|---|---|
| M1, M2 | ~4 min of local HTTP | per PR + weekly | $0 |
| M3 packet diff | seconds (22 OCR files) | on new packet | $0 |
| M4 parish baseline | ~3 min | weekly | $0 |
| M5 well-formedness | 0.8 s | per PR | $0 |
| M7 rescrape | ~2 min | nightly (exists) | $0 |
| LLM judge, narrowed | $0.015/date × ~14 upcoming dates = **$0.21** | weekly | **~$0.90** |
| LLM judge, full year both services | $0.015 × 695 = **$10.43** | never routinely | — |

**Everything in this proposal except the judge is free**, because it is all local
computation over data we already hold. That is deliberate: the auto-fix leg was
removed on 2026-10-03 at ~96% of cost for one PR ever, and nothing here
reintroduces a per-finding LLM cost. Keep the judge where it is — weekly, upcoming
dates, judge-only — at roughly **$0.90/month**.

---

## 7. What I would **not** measure

Over-measuring is a live failure mode here; `drift:check` already exits non-zero
on one standing warning, which is how a gate becomes furniture.

1. **A total findings count.** The single most actionable change in this document
   is deleting it. It sums five axes with different owners, different floors and
   different meanings, and it is 92% one rule.
2. **`D23`'s raw count, as a score.** Keep the rule, retire the number (§3.1).
3. **Anything that cannot reach its stated floor without a book we do not own**,
   unless it is explicitly a two-column measure. One column must always be "no
   book we can reach has this".
4. **Byte-level or block-count snapshot diffs.** They fire on every intentional
   improvement, which teaches people to re-baseline without reading.
5. **Per-row metrics in anything clergy-facing.** "254 stichera rows in 114
   commemorations" is true and useless to a choir director.
6. **A Matins/Vigil number on this card.** Out of scope, and adding it would hide
   that Liturgy is unmeasured by padding the denominator.
7. **Rule counts and test totals as quality indicators.** 131 rules, 376 contract
   tests and 232 unit tests were all green on 61 truncated verb stems that had been
   regenerating for months. Volume of checks is not evidence.
8. **A second rubric-bleed pattern list.** Widen one structural detector (§4, clause 3)
   instead of growing a ninth, tenth and eleventh literal.

---

## Appendix A — Recommendations, ordered

Reordered 2026-10-06 for the audience decision in §1: the readers are laity who
sing by following the choir, so what matters is the words on the page and their
order. **R1 was previously first and is now sixth** — Liturgy provenance fixes
reporting, not the page.

| | recommendation | why here | cost |
|---|---|---|---|
| **R1** | One shared `fetchAssembled`; fail closed; retire `audit:quick` | Without it no number is trustworthy, including the ones below. `npm run audit` returns 0/0/0 exit 0 against a dead port | small |
| **R2** | Tighten the Liturgy half of M3 — exclude non-hymn blocks, split the Vespers material out of the "Liturgy" sheets | Turns **16%/0%** from a floor into a fair number. It is the worst number on the card and the one that speaks to the readers | small |
| **R3** | Close the Liturgy wording gap the tightened M3 reveals | Nothing on our Liturgy page is in the words the choir sings. This is the actual work | large |
| **R4** | Fix row 8437; widen the leading-character detector; add a glued-digit check | A rubric fragment and 60 footnote digits are live in sung text, read aloud by someone following along | small |
| **R5** | Ingest the General Menaion dates' proper texts, using `audit/ocanwa-baseline/` incipits as the source | Moves 10 dates out of 1.3's left column. The texts exist; we just don't hold them | medium |
| **R6** | Give `/api/liturgy` block provenance | Needed for 1.3's right-hand column; four sibling routes already do it. No longer first — it changes no word on the page | small |
| **R7** | Index `triodion.json` + `pentecostarion.json`; stop relabelling `unknown` → `OCA` | 685 hymns on 88 dates, including Lent and Holy Week, are unmeasurable; also unblocks D23 there | medium |
| **R8** | Split `D23`; replace it in the headline with M3's wording column | Stops the metric that moves the wrong way | medium |
| **R9** | Rebuild snapshots as a sung-hymn-text diff | Serves card number 1.4, the only one with no current source | medium |
| **R10** | `drift:check` → NEW-only exit code | Stop training people to ignore a red gate | small |
| **R11** | Promote `audit:parish-baseline`'s `slots p/o` column out of info-only | It is the signal that caught the 10 under-served dates, and it is currently not gated | small |
| **R12** | Convert `parishOverrides` into a real expectation table | M2 and M6 both need it; today it names rules that do not exist | small |

**Deferred by decision, 2026-10-06:** everything tone-bearing. Laity following
the choir do not read the tone. The 17 tone rows already shipped stay; the open
question of which book wins a tone conflict is backlogged with its evidence
(§7).

**Questions for the choir director.** Three of the four I drafted did not survive
contact with the evidence, which is the point of asking the question of the data
first:

1. ~~Which books does the parish sing from?~~ **Dropped.** The packets are the
   evidence, and the existing draft's own notes already ruled this out as "our
   decision, not hers". `PARISH_BOOKS` in `scripts/provenance-sweep.js` should be
   *derived* from packet matches instead.
2. ~~Daily Vespers filename convention?~~ **Dropped.** `choir-packet-diff.js`
   measures the offset per sheet and prints it. Her answer would change no code.
3. ~~Is a general hymn acceptable on the 10 dates?~~ **Dropped — the premise was
   wrong.** `audit/ocanwa-baseline/` shows the saint's own hymns exist, with slot
   and tone. The question offers a false choice; the answer is to hold the proper
   text. See §1.3.
4. **Tone conflicts — which book wins?** *Backlogged by decision, not dropped.*
   Worth keeping because the evidence is genuinely split: the baseline
   independently confirms 02-06 (Tone 4) and 08-22 (Tone 1) but contradicts
   06-17, where all three numbered hymns are Tone 4 and the Glory is Tone 8
   against our T8→T6 change. So the blanket "her site wins" rule, already shipped
   on 17 rows, has at least one counterexample.
5. **The Saturday dismissal theotokion — the one genuine ask.** Her book's
   appendix is Monday–Friday; nothing we hold covers a non-vigil Saturday
   service, in any packet or baseline. 52 dates a year. Non-blocking.

## Appendix B — Where this document and the brief disagree

Per the ground rule, the repo wins. Each was measured twice by different means.

| brief | measured | note |
|---|---|---|
| latest audit = 101 findings (93 V, 7 L) | **169** (156 V-D23 + 13) | The brief's run was `--sample representative`; mine is the full year as instructed |
| Vespers dates with an unidentified book: **0** | **88** | The brief's 0 is the route's `unknown → 'OCA'` fallback, not a measurement. §M1 |
| Vespers dates on a General Menaion text: **19** | **10** | Two methods agree on 10; dates listed in §1.3 |
| every Vespers hymn from a parish book: **224/365** | **223 pass / 141 fail / 1 neither** | 2026-04-02 renders no sung stichera at all. §1.1 |
| 21 rules name `vespers`, 30 name `liturgy` | grep-derived; `appliesTo` is a **function** of ctx | Not countable statically. 131 rules total confirmed; 122 are `needsAssembled` |
| 55 contract files, 26 in scope | 55 confirmed; **45** mention vespers or liturgy | The brief's 26 is likely a stricter reading |
| packets: "9 packets, 30 OCR'd files" | 9 packets, 30 PDFs, 30 OCR `.txt`, **22 dated in-scope**, 104 `[text]` pages, 173 hymns | Far more leveraged than the count suggests. §M3 |
| snapshots = "rendered-output diffing" | SHA-256 of whole responses, 12 endpoints, ~12 dates | Change detection, not output diffing. S8 |
| `D23` counted 114 before and after 10-05 | not reproducible retrospectively | But the *mechanism* is confirmed: §3.1 clause 2 |
| inventory of measurement surfaces | **four missing**: `audit:endpoints`, `coverage-report`, `translation-matrix`, `audit:rank-coverage` | S13–S16 |
| 55 contract files, 376 tests | 376 confirmed, now **384** | +8 from `general-menaion-name.test.js`, added by this work |
| the 10 General-Menaion dates are bounded by material we may never have | **the texts exist** | `audit/ocanwa-baseline/` names the saint's own hymns with slot and tone. §1.3 |

Also confirmed as stated: the `audit:quick` vacuity; `drift:check` exiting on one
warning; `KNOWN_RUBRIC_BLEED` empty by policy; the well-formedness baseline's
stale-entry check; `D23`'s unreachable floor; the judge's cost and the auto-fix
removal; Liturgy having no provenance.

**One scope change, not a disagreement.** The brief asked for a second scorecard
for *clergy and choir leaders* and framed it around four questions, the fourth
being "is this the translation we actually sing?". The audience was settled on
2026-10-06 as the parish's **laity, who sing by following the choir**. That
promoted the brief's fourth question to first, dropped its implicit "which book
is this from?" framing, made tone irrelevant, and moved Liturgy provenance from
the top recommendation to sixth. §1 and Appendix A are written for the settled
audience; the brief's own framing is preserved here so the change is visible
rather than silent.

## Appendix C — Reproducing every number

```bash
node server.js &                      # required; the sweep silently checks nothing without it

# §3.1, S1 — the full-year in-scope audit (169 findings)
node audit/index.js --year 2026 --services vespers,liturgy --http http://localhost:3000
awk '/^### /{r=substr($0,5)} /^- 20/{split($0,a," "); print r"\t"a[3]}' \
  audit/reports/latest.md | sort | uniq -c | sort -rn

# §5.1 — fail-open, three reproductions
node audit/index.js --year 2026 --services vespers,liturgy --http http://localhost:3999   # 0/0/0, exit 0
node audit/index.js --year 2026 --services vespers --strict                               # 0/0/0, exit 0

# §M1, §M2, §1.1, §1.3 — the provenance sweep (M1 85.2%, M2 223/141/1)
npm run audit:provenance
npm run audit:provenance -- --date 2026-02-12        # one date, verbose

# §1.1, §1.2, §M3, §M8, §5.2 — the packet diff: wording AND order,
# alignment measured per sheet (GV 85%/36%, DV 86%/32%, Lit 16%/0%, order 101/101)
npm run audit:packet-diff
npm run audit:packet-diff -- --service liturgy
npm run audit:packet-diff -- --sheet daily-vespers-2026-10-08   # resolves to offset -1

# both fail closed (exit 1) without a server, and both refuse to report if
# their own falsification check does not separate a real case from a fake one

# §1.3 — the 10 General-Menaion dates, and the proper texts that exist for them
grep -hE "^(0509|0511|1212)" audit/ocanwa-baseline/{05,12}-vespers.txt \
  | grep -E "Lord I Call|Aposticha"

# §M5, §4 — row 8437 is live while all 9 well-formedness invariants pass
node --test test/contracts/text-well-formedness.test.js

# §M5 — the render-time (name) substitution class, closed; INV-8 proves the
# invariants fail against the pre-fix implementation
node --test test/contracts/general-menaion-name.test.js
sqlite3 storage/oca.db "SELECT id,source,\"order\",section FROM stichera WHERE id=8437;"
curl -s "http://localhost:3000/api/service?service=vespers&date=2026-02-12&translation=st-john-damascus-tyler" \
  | grep -o ", or this Upon beholding[^\"]\{0,50\}"

# §M4, §M7, S7, S13
npm run audit:parish-baseline      # 301 dates, 65 gated
npm run rescrape:check             # 2 NEW, 29 resolved
npm run drift:check                # FAIL on 1 standing warning
node audit/endpoint-audit.js --all --year 2026   # 0 issues
```

Both scripts are committed, read-only, and report to `audit/reports/`. Each
prints its falsification result *before* any finding — `provenance-sweep.js`
aborts if the translation index holds no DB rows, and `choir-packet-diff.js`
aborts if its matcher scores an unrelated date as well as the right one, or if no
sheet in the selection matches anything at all.

Both also print the date convention they resolved, per the rule in §5.2: the
packet diff prints the offset chosen for each sheet, and the provenance sweep
prints the liturgical day beside each API date. **A comparison that does not
state its convention is not reportable** — that error cost me three findings in
this session.

Both carry `--capture-baseline` / `--check` in the shape of
`scripts/rescrape-diff.js`: `--check` exits 2 on a regression, reports an
improvement without failing, and compares **rates** rather than counts so that
adding a packet does not look like a regression.

The two discarded probes from this session (an incipit-prefix matcher and a
length-calibration experiment, §5.2) were not kept: the first measures the wrong
thing by construction, and the second was a one-off calibration whose result is
recorded in §M3 — a 25-character incipit cannot identify a hymn across
translations, which is why the packet index's incipits are unusable for this and
the `[text]` pages are not.

The order measure's falsification cases are synthetic and live in the commit
message rather than a file: `[0,1,2,3,4,5]`→6, `[5,4,3,2,1,0]`→1,
`[2,3,0,1]`→2 (the 2026-07-12 two-stichoi-late shape), `[0,1,3,2,4]`→4.
