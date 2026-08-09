# Feature: OCA order-of-services rubric fetch

## Purpose

Keeps `reference/orders/` current with the rubrics OCA publishes, so the weekly
LLM judge always has an authoritative statement of the service **shape** to
compare against.

There are two OCA publications and they answer different questions:

| | Gives | Endpoint |
|---|---|---|
| Service texts | the **words** | `files.oca.org/service-texts/…` — **currently 404 for every date** |
| Order of services | the **shape** — stichera splits, whether a Litya is served, which prokeimenon | `oca.org/PDF/Music/Rubrics/YYYY-MMDD-order-services.docx` |

Nearly every structural defect this project has fixed came from the order.

## What was measured, not assumed (2026-08-09)

- **Sundays only.** Transfiguration, Nativity, Dormition, Peter and Paul and the
  Elevation all 404. **No weekday feast has an order document**, so weekday
  accuracy can only ever come from encoded rules — and a corpus of Sundays must
  never be mined as if it described weekdays.
- **History reaches ~2022.** `2022-01-09` resolves; `2020-01-05` does not.
- **404s are honest** — `text/html` ~11KB against ~28KB of real DOCX.
- **Filenames are not perfectly regular.** `2026-08-23` exists as both
  `-order-services.docx` and `-order-services-.docx`, twenty bytes apart; the
  index page links the latter.

## Design

**Two URL sources.** For the six weeks the index lists, **scrape the page** — it
carries OCA's own filenames including irregular ones. For history, **construct**
URLs, validating every response rather than trusting the pattern.

**Extraction is shared with the judge** (`extractText` in `audit/llm-judge.js`),
so a fetched week is an equivalent reference to a hand-prepared one — verified at
179 lines either way for `2026-08-09`. It is paragraph-aware: the previous
one-liner replaced every tag with a space, collapsing the document to one line and
splitting words (`202 6`, `10 th`).

## The three guards

1. **Content type AND the PK zip magic** are checked before anything lands on
   disk. oca.org answers a missing rubric with HTML; without both checks an error
   page gets saved as `.docx` and parsed as liturgical text.
2. **A zero-link index scrape throws**, and exits non-zero under `--page-only`.
   "Page restructured" and "no new weeks" look identical downstream, so quiet
   success is the dangerous outcome.
3. **sha256 per file in `_manifest.json`.** A document OCA later revises is
   *reported*, never silently overwritten — overwriting would erase the evidence
   a past decision rested on.

## Usage

```bash
npm run rubrics:fetch                                  # the weeks OCA lists (cron mode)
node scripts/fetch-order-rubrics.js                    # index + historical backfill
node scripts/fetch-order-rubrics.js --check            # report gaps, fetch nothing
node scripts/fetch-order-rubrics.js --since 2024-01-01 --limit 5
```

## The cron

`.github/workflows/weekly-order-rubrics.yml`, 11:00 UTC Friday — one hour before
the weekly judge (12:00 Friday). The coupling is safe both ways: the judge fetches
live when nothing is on disk, and a failure here never blocks it.

**It commits directly to `main`**, unlike the auto-fix cron which is PR-only. The
job adds nothing but reference data — `reference/` is never read by the running
server, only by CI and by humans — so a pull request per file per week would be
friction with no safety benefit. A **path guard** fails the run if anything
outside `reference/orders/` changed, making the blast radius provable rather than
assumed. Failures open an issue tagged `order-rubrics`.

## Why the archive is worth its size

At 22 documents most findings were unverifiable. At 233, **23 of the 34 open
rank-coverage findings** have an authoritative document.

More importantly it enables *controlled comparison*, which single documents
cannot support. St Raphael of Brooklyn (2-27) is ranked vigil by orthocal and
sixStichera by us; his 2022 commemoration fell on Meatfare Sunday, so the Vigil
and Polyeleos in that order come from the Sunday and prove nothing. Comparing
four other Meatfare Sundays shows all of them printing `Polyeleos` and "By the
waters of Babylon" with **no Magnification**, while his prints one — and a
magnification is sung for polyeleos rank and above. That method needs a corpus.

## Keep in sync

- `scripts/fetch-order-rubrics.js` and `EARLIEST` if the archive ever extends back
- `extractText` in `audit/llm-judge.js` — shared; changing it changes every future `.txt`
- `reference/orders/_manifest.json` — provenance and revision detection
- `.github/workflows/weekly-order-rubrics.yml`
