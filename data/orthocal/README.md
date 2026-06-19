# Vendored orthocal responses

This directory contains pre-warmed `orthocal.info` API responses, one file per
date (`YYYY-MM-DD.json`). It is the **source of truth** for orthocal data
within the vendored window; the live API is only consulted for dates outside
the window.

Why vendor at all: `orthocal.info` is the only external runtime dependency
this app has. Shape changes, downtime, or service discontinuation would all
silently break date-keyed lookups. Vendoring the responses removes that
fragility — the app keeps working with no external HTTP at all for every
date in the window.

## Lookup order (in `server-lib/cache/orthocal.js`)

1. **Vendored file** at `data/orthocal/YYYY-MM-DD.json` (this directory)
2. **In-process Map** — caches live-API responses for the lifetime of the
   Node process; discarded on restart
3. **Live API** at `https://orthocal.info/api/gregorian/Y/M/D/`

In practice, in-window dates always hit (1); out-of-window dates fall through
to (3) and the response is cached in (2) so a repeated request within the same
process doesn't re-fetch. The DB-backed cache was retired in Track E
(2026-06-19) so `storage/oca.db` stays byte-stable across boots.

## Window

The current window is **2025-01-01 → 2029-12-31** (5 calendar years).

## Refreshing / extending

Use the vendor script:

```bash
# Refetch a year
node scripts/vendor-orthocal.js --year 2027 --force

# Extend the window forward
node scripts/vendor-orthocal.js --from 2030-01-01 --to 2031-12-31

# Refetch a date range
node scripts/vendor-orthocal.js --from 2026-04-01 --to 2026-04-30 --force
```

Without `--force` the script skips files that already exist (idempotent).
Default politeness delay is 200ms between requests; tune with `--delay <ms>`.

## Refresh cadence

Annually, or whenever upstream `orthocal.info` publishes a new year. The
orthocal data for far-future dates is calculated deterministically from the
paschalion + a fixed-cycle saint database, so re-fetching is only required
if their saint database changes (rare). Refetching is otherwise a no-op.

## Schema

Each file is the verbatim JSON response from
`https://orthocal.info/api/gregorian/Y/M/D/`. Top-level keys include
`pascha_distance`, `year`, `month`, `day`, `tone`, `feasts`, `saints`,
`readings`, etc. The codebase consumes `feasts`, `readings`, and `saints`
today; the full payload is stored for future-proofing.
