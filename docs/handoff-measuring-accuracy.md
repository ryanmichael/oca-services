# Handoff: how should we measure accuracy progress?

Paste everything below the line into a fresh session with repo access.

---

## Your task

Research how this project currently measures the correctness of its liturgical
output, explain why those measures are failing to track real progress, and
**propose a measurement scheme we can adopt.** Deliver a written proposal, not
code. Do not change data or code except to run read-only probes.

## Scope: Vespers and Divine Liturgy only

Confine the proposal to **Vespers** (`/api/service?service=vespers`, including
Great Vespers and Daily Vespers) and **Divine Liturgy** (`/api/liturgy`). Matins,
Vigil, Presanctified, Lamentations, Royal Hours, Bridegroom Matins and the
one-off services are **out of scope** — do not inventory their rules, do not
propose measures for them, and do not count their findings.

This costs almost nothing in coverage and buys a great deal in focus. In the most
recent audit run, findings already fall out as **93 Vespers, 7 Liturgy, 1
Matins** of 101 — so these two services are where essentially all current signal
lives. Of 131 audit rules, 21 name `vespers` and 30 name `liturgy` in their
`appliesTo`; 26 of 55 contract-test files exercise one or the other.

Two consequences to respect:

- **Vespers is date-shifted and Liturgy is not.** The API date for Vespers is the
  civil evening and its content comes from the *next* day's calendar entry;
  Liturgy is unshifted. Any measure that aggregates the two per date must say
  which convention it uses, or it will silently compare different days. This has
  already caused real misreadings — see `project_vespers_date_shift` and the
  `eve-misread` finding in `.claude/skills/choir-week`.
- **The two services fail differently.** Vespers defects are predominantly
  *content* — which hymn, whose translation, what tone, in which slot. Liturgy
  defects are predominantly *structure and propers* — antiphons, entrance verses,
  troparia/kontakia order, prokeimenon and alleluia selection. A single scorecard
  that works for one may be useless for the other; say so if that is what you
  find, and propose per-service measures where that is the honest answer.

Where a measure would naturally generalise to the other services later, note it,
but do not design for them now.

## What the project is

A generator of Orthodox Christian daily service texts (Vespers, Matins, Divine
Liturgy and others) for any date, served as an HTTP API with HTML rendering. It
is used by a real parish — St John of Damascus, Tyler TX — whose choir sings from
its output. Start with `CLAUDE.md`, then `docs/` and the memory index at
`~/.claude/projects/-Users-ryanmurphy-claude-code-oca-services/memory/MEMORY.md`.

Scale: 2,640 commemorations, 4,252 stichera rows, ~12,400 sung texts across
`stichera` + `troparia`, 365 days × 8 service types. In scope here: 365 Vespers
and the Liturgies appointed across the year.

## The problem, stated precisely

**Our metrics do not move when the work is good, and cannot reach zero.**

On 2026-10-05 a session spent a full day on correctness. It shipped, in seven
commits, all verified and all in production:

- 61 truncated verb stems (`thou didst conceiv`, `didst denounc` ×9) — a
  transform bug that had been regenerating for months
- 18 rows whose modern-register rendering read `You evered instruct yourself`
- 6 objective-case errors (`the Russian Church reveres thou as a priest`)
- 3 hymns opening with a podoben melody name instead of a verse
- 17 rows moved to the tone the parish's own book appoints
- 23 rows where a rubric was printed as part of a sung verse, including one that
  handed a choir *"But if Alleluia is to be chanted at Matins instead of 'God is
  the Lord ...,' we sing first the following Stichera of the Theotokos"* as a
  Lord-I-Call sticheron
- 62 rows tagged so a conditional alternative set stops being sung as appointed
- one commemoration whose three saint stichera had been a single 1,770-character
  blob

**The headline metric moved from 87 to 88 — upward.** The translation-mix count
(audit rule `D23`) counted 114 mixed commemorations before and 114 after.

That is not a reporting quirk. It is the measurement being wrong about what
progress is.

## Known failure modes of the current measures

Each of these is documented in the repo or in memory; verify rather than take on
trust.

1. **The audit passes clean on real defects, repeatedly.** Memory records at
   least six separate occasions: *"5 defects, audit passed 0/0/0 on every one"*
   (09-07), *"14 defects, audit green on all"* (09-13), *"Sweep now 0 high/0
   med"* while a choir-packet review then found 6 more (09-19), *"All 5 dates
   passed audit 0/0/0"* (08-22 backlog), *"9 hymns with unclosed quotes — audit +
   153 tests + 10 contracts ALL green"* (08-15). One defect was caught by a human
   **mid-Liturgy** (`feedback_assert_structure_not_labels`).

2. **Rules assert labels and counts, not structure.** The same memory file
   records four recurrences in one week, the last of which *"asserted count and
   sequence (both correct) while all 4 Resurrection troparia sat two stichoi late
   and shipped green."*

3. **Two measures of the same thing disagreed silently.** `drift:check` reported
   `Rubric bleed in sung text: clean` on 23 rows that a corpus sweep reported in
   full. Cause: `RUBRIC_BLEED_PATTERNS` in `server-lib/overlays/drift.js` had
   eight patterns, none covering the conditional rubric. Nobody could see the
   disagreement because nothing compared the two.

4. **A metric with an unreachable floor.** `D23` cannot reach zero: 26 of its 41
   festal findings have **no OCA text in any year**, and most of the 254
   remaining rows have no match in the parish's corpus above 0.15 similarity. See
   `features/translation-mix.md` and `features/daily-octoechos-parse.md`, which
   records D23 *rising* 223 → 250 when the texts became more correct.

5. **Defects live in transforms, but measurement looks at rows.** Every bug fixed
   on 10-05 was in a transform (`scripts/yy-to-tt.js`,
   `server-lib/assemble/pronouns.js`, `scripts/menaion-ingest/raphaela-parse.js`),
   and each had previously been "fixed" by correcting its output rows. One row on
   a list of ten recorded as corrected on 2026-09-20 had never actually been
   fixed and was still wrong in production six weeks later.

6. **Verification silently goes vacuous.** `npm run audit:quick` passes no
   `--http`, so every rule with `needsAssembled` returns `[]` and reports zero
   findings on broken code. A contract-test loop guarded by `continue` tested
   nothing. See `feedback_verification_false_greens`.

7. **The one oracle that works is manual and sparse.** The choir director's
   weekly packets are what actually catch defects — they are what the parish
   sings. We hold 9 packets, 30 OCR'd files. Several 10-05 findings were settled
   only by a packet (one overturned a conclusion I had drawn from the books).

## The measurement surfaces that exist today

Inventory them yourself, restricted to Vespers and Liturgy.

| surface | command | what it is | in-scope relevance |
|---|---|---|---|
| structural audit | `npm run audit`, `audit:full`, `audit:date` | 131 rules in 6 families (A calendar, B availability, C substitution, D structure 105, E provenance, F theme) | 21 rules name `vespers`, 30 name `liturgy`; latest run = 93 Vespers + 7 Liturgy findings |
| contract tests | `npm run test:contracts` | 55 files, 376 tests | 26 files exercise Vespers or Liturgy |
| unit tests | `npm test` | 232 tests | register/pronoun transforms feed both |
| data drift | `npm run drift:check` | DB integrity, dupes, rubric bleed, transformer integrity | service-agnostic; feeds both |
| LLM judge | `npm run audit:judge` | semantic/translation review; costs API credits; **auto-fix leg removed 2026-10-03** as ~96% of cost for one PR ever | both |
| snapshots | `snapshot:capture`, `snapshot:verify`, `snapshot:determinism` | rendered-output diffing | both |
| rescrape diff | `rescrape:check` | our rows vs the OCA published source | mostly Vespers stichera |
| parish baseline | `audit:parish-baseline` | the oracle named in `project_two_terminal_coordination` | both |
| e2e | `npm run test:e2e` | Playwright, rendered DOM | both |
| corrections log | `corrections_log` table (14 rows) | every applied choir-director correction, with branch and rejected branches | both |
| choir packets | `docs/choir-packets/` | 9 packets, 30 OCR'd files — the only ground truth about what is actually sung | Great Vespers, Daily Vespers and Liturgy sheets |

`npm run audit` runs eight services by default. For this work, narrow it:
`node audit/index.js --year 2026 --services vespers,liturgy --http http://localhost:3000`.

## What to research

1. **Inventory and classify.** For each surface: what question does it answer,
   what can it not see, how is it reported, and does anything act on it? Which
   pairs of surfaces measure overlapping things without being reconciled?

2. **Find the blind spots empirically, not by reading.** Pick several defects
   from the 10-05 commits (`git log` from `fa5a121` to `0cd1b02`) and, for each,
   determine which surface *should* have caught it and why it did not. The commit
   messages state the failure modes; verify them.

3. **Separate the axes that are currently conflated.** At least these are
   distinct and are all being folded into one "findings" count:
   - *well-formedness* — is this even grammatical English in the register we
     claim? (newly gated by `test/contracts/text-well-formedness.test.js`)
   - *fidelity to a source* — does our row match the book it claims to come from?
   - *fidelity to the parish* — does it match what this choir actually sings?
   - *liturgical correctness* — is the right hymn in the right slot at the right
     tone for this date?
   - *coverage* — do we have anything at all for this slot?
   A metric that sums these cannot be acted on.

   Check whether these axes even carry the same weight in both services. Vespers
   is mostly *which text* (translation, tone, slot, whose hymn); Liturgy is mostly
   *which structure and which propers* (antiphons, entrance verse, troparia and
   kontakia order, prokeimenon/alleluia/koinonikon selection). Read
   `server-lib/sources/liturgy-from-orthocal.js` and `server-lib/sources/propers.js`
   before assuming a Vespers-shaped measure transfers.

4. **Address the unreachable-floor problem.** Several measures count defects that
   are bounded by material we do not have and may never have. Propose how to
   represent "as correct as the available sources allow" distinctly from "wrong".

5. **Weigh ratchets against walls.** The repo uses both: `KNOWN_RUBRIC_BLEED` is
   *"empty by policy"* as a silent-suppression set, while the new
   `text-well-formedness` contract uses itemised baselines with a stale-entry
   check so a list cannot outlive its debt. `KNOWN_STICHERA_MISKEYS`,
   `KNOWN_SOURCE_GAPS` and `KNOWN_RANK_GAPS` are other variants. Which pattern
   should be standard, and when?

6. **Make the packets go further.** They are the only real oracle and they are
   sparse and manual. Research what would raise their leverage: more OCR
   coverage, an automated packet-vs-render diff, a measure of *how much of the
   year a packet actually constrains*. Note that the packets skew to Great
   Vespers, Daily Vespers and Sunday Liturgy — which is exactly this scope — so
   their coverage of it is better than the 9-packet count suggests. Quantify it.

7. **Say what Liturgy needs that Vespers does not.** Vespers has had far more
   attention: most of the 131 rules, most of the memory, and all of the 10-05
   work. Liturgy produced 7 of the latest 101 findings, and that is at least as
   likely to mean *under-measured* as *correct*. Establish which it is — a
   plausible probe is to compare a Liturgy render against a packet Liturgy sheet
   and count what no rule would have caught. Memory entries worth reading first:
   `project_liturgy_audit_2026_06_17`, `project_great_feast_eisodikon_gap`,
   `project_beatitudes_oca_gap`, `project_sunday_resurrection_kontakion_pending`.

## A second audience: clergy and choir leaders

Everything above is engineering-facing. There is a **second, harder requirement**:
a handful of measures that can be put in front of a priest or a choir director
without translation. They will not read "D23 is 88" or "376 contract tests pass".
They will ask four questions, and the scorecard has to answer them:

1. *Can I trust the sheet for this Sunday?*
2. *What changed since last week?*
3. *Where do you already know you are wrong?*
4. *Is this the translation we actually sing?*

Design for that audience **as a first-class deliverable, not an appendix.** Rules
for it:

- Count **services and dates**, never rows or rules. "19 Vespers this year use a
  generic text instead of the saint's own hymns" lands; "254 stichera rows in 114
  commemorations" does not.
- Separate **"we are wrong"** from **"no book we can reach has this"**. Conflating
  them is what makes the current numbers unusable, and clergy are the audience
  most entitled to that distinction.
- Prefer measures they can **spot-check themselves** on a date.
- Keep it to about four numbers. A dashboard nobody reads is worse than one line
  that is true.

### Measured starting points, 2026, Vespers + Liturgy

These were computed on 2026-10-05 by sweeping all 365 dates for both services as
the parish (`?translation=st-john-damascus-tyler`). Re-derive them; they are a
floor for the proposal, not the proposal.

| | Vespers | Liturgy |
|---|---|---|
| dates the service is appointed and renders | **365 / 365** | **330 / 330** |
| dates with any hymn whose book is unidentified | **0** | **330 — every single one** |
| dates drawing on more than one book | 261 | not computable |
| dates using a General Menaion (generic) text | 19 | 1 |
| dates where every hymn comes from a book this parish uses | **224 / 365 (61%)** | not computable |

Books appearing in Vespers, by number of dates: OCA 365, Daily Octoechos 213,
St. Sergius 106, Myrrh-bearers (Raphaela) 92, Lambertsen 21, unknown 13,
St. Sergius (General) 10. The 141 dates that fail the last row break down as
St. Sergius 106, Lambertsen 21, unknown 13, St. Sergius (General) 10 — none of
which is a book St John of Damascus sings from.

**The finding that most constrains this work: Liturgy has no provenance at all.**
Every one of its 330 dates returns hymns with no `provenance`, so the single most
meaningful question for a choir director — *which book is this from?* — is
answerable for Vespers and unanswerable for Liturgy today. Any clergy-facing
scorecard either reports Vespers only and says so plainly, or the Liturgy
provenance gap is fixed first. Treat establishing that as a candidate
recommendation in its own right, and check `server-lib/routes/api-service.js`
against the Liturgy route to find why one carries provenance and the other does
not.

### Do not put these in front of clergy

`D23`'s count, rule ids, contract-test totals, `drift:check` warnings, baseline
sizes. They are real and they matter internally; none of them answers any of the
four questions above, and two of them move the wrong way when the work is good.

## What to deliver

A proposal document containing:

1. **TWO scorecards, and the clergy one first.**
   - *For clergy and choir leaders*: about four numbers, in their language,
     answering the four questions in the section above. For each: the one-line
     wording you would actually put in front of them, how it is computed, what
     "good" looks like, and how they could spot-check it on a date. Say plainly
     where Vespers can be reported and Liturgy cannot.
   - *For us*: a small number of named, separately-reported measures, each with
     the question it answers, how it is computed, whether it can reach zero, and
     what to do when it moves the wrong way. State for each whether it is
     Vespers-only, Liturgy-only, or both; do not invent a shared number if the
     honest answer is two numbers.
   The two must be consistent — the clergy number should be derivable from ours,
   not a separate estimate.
2. **A per-measure verdict on every existing surface** *as it bears on these two
   services*: keep as is, re-scope, merge, or retire. Say what to do about `D23`
   specifically, since it accounts for 88 of the latest 101 findings and is the
   metric that went up when the texts got better.
3. **A regression story** — what must be true for a defect class to be
   *closed*, as opposed to its instances being fixed. The 10-05 session's lesson
   is that fixing rows without fixing the transform guarantees recurrence.
4. **A falsification requirement** — how every new measure proves it can fail
   before it is trusted. This is already project practice; make it explicit.
5. **A cost note** — the judge's auto-fix leg was removed for cost. Say what any
   proposal costs per run and per month.
6. **What you would NOT measure**, and why. Over-measuring is a real failure mode
   here; `drift:check` currently exits non-zero on one long-standing warning,
   which trains people to ignore it.

## Ground rules

- **Verify every claim in this brief.** Several numbers in the project's own
  memory have turned out to be wrong — `files.oca.org` was recorded as dead and
  is merely partial; a "~170 sites" figure turned out to be 6. If this document
  and the repo disagree, the repo wins; say so in your proposal.
- **Prove a probe can fail before reporting what it found.** The single most
  repeated mistake in this project's history is trusting a check that could not
  have failed. Memory: `feedback_verification_false_greens`,
  `feedback_assert_structure_not_labels`.
- **`npm run audit` needs a server on `localhost:3000`**, and `audit:quick` does
  not pass `--http`, so it under-reports. Kill the dev server before any git push
  (it holds a SQLite lock).
- **Read-only.** Do not write to `storage/oca.db`, do not commit. If you want to
  demonstrate a measure, compute it in a scratch script and show the number.
- **Liturgical correctness is not yours to decide.** Where a question is "which
  book does this parish follow", that is a question for the choir director, not
  an inference. Flag those rather than resolving them.
