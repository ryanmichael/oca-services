# Feature: OCA coverage probe

**Status:** shipped 2026-10-04 — chunk 2 of the OCA-standardisation plan
**Contract test:** `test/contracts/oca-coverage.test.js`
**Script:** `npm run oca:coverage` → `audit/reports/oca-coverage.json`
**Last verified:** this commit

## Purpose

Answer, with measurement rather than estimate, how much of the non-OCA corpus
can actually be sourced from OCA — and cache what can. Chunk 3 converts; this
chunk tells it what is there to convert.

Replacing a row we cannot replace would drop that saint to the generic General
Menaion, which is a worse liturgical outcome than a translation seam. So the
size of the convertible set is the thing that governs the whole plan.

## `files.oca.org/service-texts/` is PARTIAL, not dead

Project memory recorded it as dead (2026-08-09) and that belief cost real work:
on 2026-10-04 it led to telling the user the OCA text for St Hierotheus was
unobtainable, and to transcribing it from a scan, while
`2026-1004-texts-tt.docx` was fetchable the whole time.

Two things were wrong. The host serves roughly a **third** of calendar dates —
the liturgically significant ones — and 404s ordinary weekdays across every
filename variant. And the probe that "proved" it dead used an invented filename
shape, `20241004-texts-tt.docx`; the publisher's shape is **`YYYY-MMDD`**, a
single hyphen after the year. INV-1 pins that.

**A 404 on the dates you happen to test is not proof a host is gone.** Probe
dates the publisher would actually publish.

## What it measured

272 month-days carry non-OCA stichera (lambertsen, st-sergius.org, raphaela).

| | month-days |
|---|---|
| already cached locally | 119 |
| available on Wayback | 24 |
| live on files.oca.org | 19 |
| **unavailable anywhere** | **110** |
| **obtainable** | **162 / 272 (60%)** |

The archive grew **214 → 254** DOCX (40 downloaded; 3 failed).

Day-level availability is an upper bound. Re-checking every target against the
expanded archive for whether the file actually names that saint:

**87 of 202 checked commemorations (467 rows) are genuinely convertible — 43%.**

That is up from 64 before the archive expanded, and it is the number chunk 3
should be planned against. It remains an upper bound: "named in the file" still
is not "the file prints their Lord-I-Call stichera", which is chunk 3's
per-commemoration check.

## Design

- **ONE shared fetcher.** `server-lib/sources/oca-service-texts.js` was extracted
  from `rescrape-fetch.js`, which keeps its own job (re-fetch dates that already
  fed an `oca-menaion` row, so a later diff can cross-check our rows). The
  coverage probe needs the opposite — dates we do **not** have. Two copies would
  drift, and the copy the audit does not use is the one that breaks silently
  (INV-4).
- **Request budget stays small.** The Wayback CDX index is **one** request for
  every archived date; the local cache is consulted before any network call; a
  live probe happens only for targets neither cached nor archived.
- **Fixed-calendar saints** mean a 2024 text serves a 2026 date, so availability
  is tracked by **month-day**, not full date.
- **Fetch-only.** It opens `storage/oca.db` read-only to list targets and writes
  only to `reference/scrape/` and the report. INV-7 pins that it issues no
  writes.

⚠️ Requiring `rescrape-fetch.js` used to **run a full fetch pass** — `main()` sat
at module scope. Extracting the shared module tripped exactly that: a 197-date
pass fired from a `require`. It is now behind `require.main === module`, and
INV-3 pins it.

## Invariants (tested)

- **INV-1** — the URL uses the publisher's `YYYY-MMDD` shape, never `YYYYMMDD`.
- **INV-2** — the Wayback URL asks for raw bytes (`2id_`), not the toolbar page.
- **INV-3** — requiring the rescrape fetcher does not run a fetch pass.
- **INV-4** — both scripts share one fetcher; neither re-implements `fetchOnce`.
- **INV-5** — the probe targets only non-OCA commemorations.
- **INV-6** — requiring the coverage script does not probe the network.
- **INV-7** — fetch-only: no `openDbWrite`, no INSERT/UPDATE/DELETE.

Falsified by removing the `require.main` guard: INV-3 fails.

## Keep in sync

- `server-lib/sources/oca-service-texts.js` — the fetcher
- `scripts/oca-coverage.js` — the probe
- `scripts/rescrape-fetch.js` — the other consumer
- `features/translation-mix.md` — chunk 1, which found the problem
