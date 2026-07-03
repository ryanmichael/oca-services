# Rescrape Harness — Phase 2 & 3 Design

**Status:** Phase 2 BUILT + first full sweep run (2026-07-03). Data fixes pending triage. See "Phase 2 build status" at the bottom.
**Session context:** `MEMORY.md` § "One-shot audit plan (2026-07-02)"
**Related:** [reference_oca_docx_extraction](../.claude/memory/reference_oca_docx_extraction.md), audit skill (`audit-driven-fix`)

## Purpose

End the "1-2 findings per weekly date audit" cadence by cross-checking every DB row that came from an OCA DOCX scrape against a fresh re-parse of the same source. The 2026-07-02 Sergius audit surfaced 4 drift classes (row-misassignment, `Tone N` prefix bleed, OT-readings bleed, `<w:t>` XML residue) via one date's inspection; a full-DB pass will flush the same classes across the entire inventory in a single sweep.

## Non-goals

- **NOT for `stSergius` source rows.** 1,346 stichera rows have `source = 'stSergius'` — from the St. Sergius Prayerbook, not OCA-published DOCXs. Different provenance, different pipeline. Out of scope for this harness; tracked separately.
- **NOT authoring net-new content.** If the DOCX has a hymn our DB lacks (or vice versa), we surface the diff — we do NOT auto-import or auto-delete without human review.
- **NOT for `troparia` or `commemorations` tables.** Phase 2 targets `stichera` where 2026-07-02 drift concentrated. Extending to other tables is a Phase 4 follow-up once the shape is proven.

## Inventory

- **217 distinct `source_date` values** across `oca-menaion` (1,976 rows) and `oca-feast` (117 rows).
- **Distribution by year:** 2024 = 139 dates, 2025 = 50, 2026 = 28.
- **URL pattern:** `https://files.oca.org/service-texts/YYYY-MMDD-texts-tt.docx` (confirmed via `reference_oca_docx_extraction` memory).
- **Estimated download size:** ~50 KB × 217 = ~11 MB total.
- **Fetch time:** ~217 × 1s = ~4 min (respect a 0.5s rate limit gap to be polite).

## Architecture

```
                             ┌─────────────┐
                             │ inventory   │  SELECT DISTINCT source_date
                             │ (217 dates) │  FROM stichera WHERE source LIKE 'oca%'
                             └──────┬──────┘
                                    ▼
                             ┌─────────────┐
                             │ fetcher     │  scripts/rescrape-fetch.js
                             │ (with cache)│  files.oca.org → reference/scrape/<date>.docx
                             └──────┬──────┘
                                    ▼
              ┌───────────────────────────────────────┐
              │ parser                                │  scripts/rescrape-parse.js
              │ DOCX → (commemoration_title,          │
              │        section, order, tone, text)    │
              │ tuples                                │
              └────────────────────┬──────────────────┘
                                   ▼
              ┌───────────────────────────────────────┐
              │ normalizer                            │  server-lib/parsers/normalize.js
              │ Applied to BOTH the fresh parse       │
              │ AND the DB row before diff.           │
              └────────────────────┬──────────────────┘
                                   ▼
              ┌───────────────────────────────────────┐
              │ differ                                │  scripts/rescrape-diff.js
              │ tuple-by-tuple compare, categorized   │
              │ into 6 finding classes                │
              └────────────────────┬──────────────────┘
                                   ▼
              ┌───────────────────────────────────────┐
              │ report                                │  audit/reports/rescrape-diff-<date>.md
              │ Markdown, one section per finding     │  + aggregate rescrape-diff-summary.md
              │ class, actionable SQL snippets        │
              └────────────────────┬──────────────────┘
                                   ▼
              ┌───────────────────────────────────────┐
              │ human triage                          │  audit-driven-fix skill
              │ Approve/reject per-class fixes.       │
              │ Each accepted fix ships with a        │
              │ closing drift-check rule.             │
              └───────────────────────────────────────┘
```

Each stage is a separate script with clear input/output contracts so partial re-runs are cheap during triage. The fetcher, parser, and normalizer are pure functions (no DB writes); only the human-approved SQL migrations touch `storage/oca.db`.

## Parser design

### DOCX structure (empirical, from `reference/2026-0524-texts-tt.docx`)

- `word/document.xml` holds body content as a linear sequence of `<w:p>` (paragraph) → `<w:r>` (run) → `<w:t>` (text) nodes.
- **No paragraph styles** to key off (`w:pStyle` is default throughout). Section boundaries live in the TEXT itself, not the markup.
- **Text is syllable-split** for chant notation (stressed syllables in separate `<w:r>` runs with different formatting). Concatenating `<w:t>` values gives readable prose; nothing needs to be re-joined semantically.
- **Whitespace and line breaks** appear as `<w:br/>` or newlines within `<w:t xml:space="preserve">`.

### Section-boundary grammar

Sections are delimited by TEXT anchors. Empirical list (extend as new DOCXs surface variants):

| Anchor pattern (regex, case-insensitive) | Section |
|---|---|
| `^\s*["“]?Lord,?\s*I\s*(Call|Have Cried)` | `lordICall` |
| `^\s*Aposticha\b` | `aposticha` |
| `^\s*Litya\b` | `litya` |
| `^\s*Troparion\b` (in Vespers context) | `troparia` |
| `^\s*Kontakion\b` (in Vespers context) | `kontakia` |
| `^\s*Old Testament Readings\b` | `otReadings` |
| `^\s*\(at the Divine Liturgy\)` | end-of-Vespers, start-of-Liturgy |
| `^\s*V\.\s*\(\d+\)` | verse-numbered sticheron slot |
| `^\s*Glory\b` | Glory doxastikon (order=0 convention) |
| `^\s*Now\s*and\s*ever\b` | Now-and-ever Theotokion (order=-1 convention) |

### Commemoration attribution

Commemoration title lines appear as bolded headings BEFORE the first section. Empirically: title lines are ALL-CAPS ("SUNDAY, MAY 24") or Title-Case ("Holy Fathers of the First Ecumenical Council"). Multiple commemorations on the same day appear as separate title lines before their respective stichera groups.

**Heuristic:** After the day-header block ("SUNDAY, MAY 24 / TONE 6 / 7th Sunday of Pascha"), each Title-Case standalone line (no verse marker, no section anchor) is a commemoration title. The stichera that follow, up to the next commemoration title or section boundary, belong to that commemoration.

**Fallback:** when the harness can't attribute a sticheron unambiguously, tag it as `commemoration_title = null` in the tuple and let the differ emit an "unattributed sticheron" finding. Better to surface uncertainty than silently guess.

### Tone extraction

Tone appears as `Tone N` on its own line or immediately preceding a sticheron. The `Tone N` prefix is a MARKUP element for chant, NOT hymn text — the harness must strip it and populate the `tone` column instead. This is exactly the class of drift the 2026-07-02 sweep found (43 rows with `Tone N ` still in the text field).

## Normalization

Applied identically to both fresh-parse text and DB-row text before comparison. Order-sensitive.

1. **Strip Word-XML residue:** `<w:t>`, `<w:t xml:space="preserve">`, `<w:br/>`, etc. Rows swept 2026-07-02 in the same class.
2. **Strip `Tone N ` prefix** from text field (43 rows swept 2026-07-02).
3. **Normalize whitespace:** all whitespace runs → single space; strip leading/trailing.
4. **Normalize punctuation:** curly quotes → straight; en/em dashes → hyphen-minus; ellipsis Unicode → three periods.
5. **Normalize case-of-first-letter:** if the DB text starts lowercase but the DOCX text starts uppercase (or vice versa), consider it equivalent — chant markup sometimes lowercases the first word after a phrase break.
6. **Optional (feature-flagged): pronoun normalization.** OCA has updated some translations from `yy` (you/your) to `tt` (thee/thy) since the 2024 scrape. Run both sides through `scripts/yy-to-tt.js` before compare, so pre-update DB rows don't false-positive against post-update DOCX. Feature-flag so we can also see pronoun drift explicitly if desired.

## Tuple shape

```ts
type StichereonTuple = {
  source_date:  string;   // "2024-07-05"
  commemoration_title: string | null;
  section:      "lordICall" | "aposticha" | "litya" | "troparia" | "kontakia";
  order:        number;   // -1 = Now, 0 = Glory, 1+ = numbered slot
  tone:         number | null;
  label:        string | null;
  text:         string;   // normalized
};
```

Diff key: `(source_date, commemoration_title, section, order)`. Comparison field: `text` (after normalization). `tone` and `label` fields diffed separately with lower severity.

## Diff categories

Each finding fits exactly one bucket. Report groups by bucket.

| Bucket | Signature | Severity |
|---|---|---|
| **A. Row on wrong commemoration** | Fresh parse has `(A, section, order) → text X`; DB has `(B, section, order) → text X`. Same text under a different commemoration_id. Signature of the 2026-07-05 Sergius-on-Athanasius drift. | high |
| **B. Text differs (substantive)** | Same tuple key, both sides have text, normalized text differs. Sub-classified by edit distance: <5 chars = typo; 5-50 = phrase-level; 50+ = wholesale mismatch. | high |
| **C. DB row missing** | Fresh parse has the tuple; DB does not. Might be scrape oversight or DOCX content added post-scrape. | medium |
| **D. DB row extra** | DB has the tuple; fresh parse does not. Might be legit stSergius fallback or scrape-bleed drift (e.g. OT-readings-into-hymn already swept 2026-07-02). | medium |
| **E. Tone or label mismatch** | Text agrees; `tone` or `label` column differs. Class of the `Tone N` prefix drift already swept. | low |
| **F. Unattributed** | Parser couldn't confidently assign a fresh-parse sticheron to a commemoration. Human decides. | low |

## Migration / apply plan

The harness DOES NOT auto-apply fixes. Each report is triaged with the `audit-driven-fix` skill:

1. **Per-class review.** Read the top 5 findings of each class. Is the pattern generalizable? Any collateral risk in a bulk fix?
2. **Bulk SQL per class** in `/tmp/rescrape-fix-<class>-<date>.sql`, prefixed with a `BEGIN;` / `COMMIT;` and post-verification `SELECT`s. DB backup taken first (`storage/oca.db.bak.<date>-rescrape`).
3. **Closing drift-check rule** for the class in `server-lib/overlays/drift.js`, wired into `scripts/drift-check.js`. If the class isn't a "class" but a one-off, the finding gets its individual SQL and a comment explaining why no closing rule was authored.
4. **Contract test** if the fix touches a feature with an existing spec (e.g. changing an `saint_type` inference cascade needs a matching `test/contracts/` update).

## Estimated effort

| Stage | Effort |
|---|---|
| Fetcher | 2 hours (with cache + rate limit + retries) |
| Parser | 1-2 days (the section-grammar heuristics need tuning against edge cases — feasts, forefeast/afterfeast day-mixing, multi-saint days, Old-Style DOCXs) |
| Normalizer | 4 hours (mostly composing existing normalizations already in `drift.js`) |
| Differ | 4 hours (straight loop over tuple keys; edit-distance for sub-classification) |
| Report | 2 hours |
| Test harness | 4 hours (one integration test each against `reference/2026-0524-texts-tt.docx`, our one local DOCX; snapshot the expected tuples) |
| Phase 3 sweep run | 4 hours compute + 1 day triage |
| **Total** | **5-8 days** of focused work |

## Risks

- **DOCX layout drift.** Feasts + special-cycle DOCXs (e.g. Holy Week, Pascha booklet) may not follow the weekly-service layout. Mitigation: run the parser against 3-5 known-good samples first (`2026-05-24-texts-tt.docx` we have, plus fetch 4 more from different feast contexts); iterate the section-grammar until they parse cleanly.
- **OCA URL pattern change.** Some 2024 DOCXs may have moved. Mitigation: fetcher retries 3x with backoff, then falls back to Wayback Machine; explicitly logs any URL that 404s.
- **Row-attribution ambiguity.** When a sticheron doesn't clearly belong to a commemoration (e.g. shared aposticha at the end of the day for multiple co-celebrated saints), the parser's fallback is `null` attribution + finding class F. Manual triage handles it.
- **Tone-marker vs prose collision.** The literal string "Tone 6" appears as prose in some hymn texts (e.g. "we sing in Tone 6…"). The `Tone N ` stripper should be anchored to the start of the text field only. Mitigation: `text.startsWith('Tone ')` gate before applying the strip.
- **Pronoun-update false positives.** OCA has updated some `yy` → `tt` texts since 2024. Without the normalization flag, ~4,068 troparia rows might show phrase-level diffs. Mitigation: pronoun-normalize both sides by default; provide a `--show-pronoun-diffs` flag to surface the update classes explicitly.
- **Cost blowout.** 217 fetches × ~50 KB = ~11 MB — trivial. No LLM cost in Phase 2 (deterministic). Phase 3 sweep is compute-only.

## Phase 4 follow-up (out of scope for this doc)

Once the harness is stable:

- **Nightly GH Actions cron** — re-run `rescrape-diff` on the top 20 most-used dates each night; any drift = auto-issue.
- **Extend to `troparia` and `commemorations` tables.** Same architecture, different tuple shape. Roughly 3 days of parser adaptation.
- **`stSergius` pipeline.** Requires an authoritative source for the Prayerbook cycle — either OCR'd scan or a purchased digital edition. Separate provenance track; the tuple + diff mechanics are reusable but the fetch stage is different.

## Success criteria

- All 217 `oca-menaion`/`oca-feast` `source_date` values fetched and parsed cleanly, or explicitly categorized as parse-failure with reason.
- Diff report generated for each date + aggregate summary across all dates.
- Findings triaged by class; at least the top 3 classes have bulk fixes applied + closing drift-check rules.
- Post-fix year audit sweep unchanged from baseline (no regressions) OR every regression traced to a specific fix's expected side-effect.
- Drift-check exit code 0 across all classes the harness catches.

## When to start

Recommendation: **after Phase 1 (judge sweep) completes and its findings are triaged.** The judge findings will surface semantic bug classes the deterministic harness can't see (wrong saint attribution, translation register mismatches). Fixing those first reduces noise in the Phase 2 diff — many of the "text differs" findings would just be `yy`/`tt` register drift already handled by the pronoun pass, and the harness would produce a cleaner report on a cleaner DB.

If Phase 1 uncovers zero new bug classes (unlikely but possible), Phase 2 becomes higher-priority immediately. If Phase 1 uncovers many overlapping-with-deterministic bugs, deprioritize Phase 2 as the cost-benefit shifts.

---

# Phase 2 build status (2026-07-03)

The harness is built and ran its first full sweep. Design held up; a few empirical adjustments below.

## What shipped

| Stage | File | Notes |
|---|---|---|
| Fetcher | `scripts/rescrape-fetch.js` (`npm run rescrape:fetch`) | 214/217 DOCXs cached to `reference/scrape/` (gitignored). Cache-skip, 0.5s rate limit, 3× retry+backoff, Wayback fallback, incremental manifest. |
| Normalizer | `server-lib/parsers/normalize.js` | XML-residue strip, leading-`Tone N` strip, punctuation/quote/dash normalize, `//` chant-mark strip, **missing-space-after-punctuation insertion** (new), optional `yy→tt` pronoun pass (reuses `scripts/yy-to-tt.js`). |
| Parser | `server-lib/parsers/docx-tuples.js` | `unzip -p` (zero new deps). Two layers: `docxToLines` (paragraph split + **run-concat to rejoin chant syllable-splits** + bold/center detect + blank-boundary markers) and `parseDocx` (section grammar + **buffer-and-flush** sticheron grouping). 214/214 parse clean, ~25 tuples/date. |
| Differ | `scripts/rescrape-diff.js` (`npm run rescrape:diff`) | Text-anchored matching (token-Jaccard candidate → Levenshtein score) rather than strict order-key equality — robust to the DOCX being a superset (octoechos + fixed + menaion). Classes A/B/C/E/G. Per-date + aggregate reports in `audit/reports/` (gitignored). |
| Test | `test/rescrape-parse.test.js` | 13 assertions against the in-repo `reference/2026-0524-texts-tt.docx`; caught a real `?"`→`? "` normalizer bug. |

## Design deltas from the original plan

- **Bold/centered ARE available.** The doc assumed "no styles to key off"; in fact `<w:b/>` and `<w:jc w:val="center"/>` cleanly separate day-header / commemoration-title / section-anchor lines from hymn body. Used for attribution + anchor detection.
- **Matching is text-anchored, not order-keyed.** The `(source_date, commemoration_title, section, order)` diff key is unreliable because (a) multi-commemoration days defeat header-title attribution and (b) the DOCX contains octoechos + fixed content the DB `stichera` table doesn't. Matching each DB row to the closest DOCX sticheron by normalized text is far more robust. `order`/`tone` are diffed as secondary low-severity signals.
- **New class G (cosmetic).** Missing-space-after-punctuation ("denial.Therefore") is pervasive scrape drift; normalized away for the content match, reported separately.
- **Sticheron grouping needs blank-line + bare-`V.` boundaries.** Aposticha verses are `"V. <psalm text>"` (no `(N)`), and stichera are separated by blank paragraphs. Both are now flush points.

## First-sweep results (2070 `oca%` rows, 214 dates)

- **75.0% clean** exact normalized-text match on the first pass — validates fetch→parse→normalize→diff end to end.
- **B (found, text differs): 154 · C (absent from fresh DOCX): 363 · A (section): 1 · E (tone): 6 · G (glued-punctuation): 247.**

## Concrete DB drift classes surfaced (SQL-confirmed, `source LIKE 'oca%'`)

Union ≈ 130 rows of **Liturgy-propers-bled-into-stichera** — the clearest bulk class, likely one scraper bug that pulled the epistle/prokeimenon/alleluia block into hymn rows across many dates:

| Signature (SQL) | Rows | Example |
|---|--:|---|
| `text LIKE '%<w:t%'` (Word-XML residue) | 46 | `#5417` `<w:t>James 1:1-12 <w:t>James 1:13-27…` |
| `text LIKE '%Epistle%'` | 44 | `Epistle (135) 1 Corinthians 6:12-20 Tone 2…` |
| `text LIKE '%Alleluia, Alleluia%'` | 42 | `…Tone 8 Alleluia, Alleluia, Alleluia!` |
| short reading-citation only | 23 | `1 Peter 1:3-9 1 Peter 1:13-19 1 Peter 2:11-24` |
| glued-punctuation (class G) | 247 | `denial.Therefore Simon cried out…` |

The remaining C rows are a mix of genuine cross-source hymns (octoechos/festal content the date's DOCX doesn't carry) and parser section-coverage gaps — needs per-row triage, not a blanket fix.

## Next session — triage worklist (audit-driven-fix skill)

Ordered by leverage / safety:

1. **Liturgy-propers-bled class (~130 rows).** Verify none render as real stichera (check assembler pulls by `(commemoration_id, section, order)`), then bulk-clean + author a closing `validateSticheraNotLiturgyPropers` drift rule. **Author fix + rule in the same commit** (do NOT add a failing drift rule before the data is clean — `drift:check` is a CI gate).
2. **Class G glued-punctuation (247 rows).** Bulk `insertPunctuationSpaces` migration + closing rule. Purely cosmetic, low-risk, high-count.
3. **Class B (154).** Mostly trailing `"(at Vigil)"` / `"(at Great Vespers)"` editorial annotations baked into hymn text + a few real word-level diffs. Strip annotations to `label`, review the rest.
4. **3 fetch 404s** (`2025-12-24`, `2026-01-05`, `2026-03-25` — Nativity/Theophany Eve, Annunciation): special-cycle DOCXs under a different filename; fetch by hand or Wayback and re-diff.
5. **Parser section-coverage gaps.** Sample the genuine-hymn C rows; extend the section grammar where a date's layout isn't covered.
