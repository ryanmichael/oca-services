# Service auditor

Sweeps the liturgical calendar and runs structural / theme rules against the assembled output. Catches the bug classes that have historically required manual audits before printing a service.

## Run it

```bash
npm run audit         # representative-date sample (~208 dates), needs server on :3000
npm run audit:full    # full year (365 dates), needs server on :3000
npm run audit:quick   # structural rules only, no server needed, --strict (used by pre-push)
npm run audit:date -- 2026-06-07   # print-prep report for a single date

# Direct invocations for finer control:
node audit/index.js --date 2026-05-13
node audit/index.js --year 2026
node audit/index.js --year 2026 --rules C2-paschal-aposticha-window
node audit/index.js --year 2026 --strict        # exit 2 on any high-severity finding
node audit/index.js --year 2026 --no-allowlist  # raw output, ignore known-issues
node audit/index.js --year 2026 --http http://localhost:3000  # enable rules that need assembled output
```

`audit:quick` runs in the pre-push hook (`.git/hooks/pre-push`). Rules that need assembled output (`needsAssembled: true`) are silently skipped when `--http` is omitted — only the calendar-entry-level rules fire, which makes the quick path fast and server-free.

`audit:date` produces a per-date pre-print checklist: for each service (vespers/matins/liturgy/presanctified) it shows clean rule count, any findings with hints, and provenance gaps (blocks tagged with non-OCA `_source` — content still awaiting OCA translation replacement). Auto-enables `--http`. Use before printing a service text to spot regressions and translation gaps in one glance.

## Representative date sampling

`audit/sample-dates.js` exports `representativeDates(year)` which returns ~200 dates that exercise the same code paths the full 365-day sweep does, in roughly half the time. Composed of:

- **Tier 1 — boundaries**: every Pascha ± N (Forgiveness Sun, Lazarus Sat, Pascha eve/day/morrow, Apodosis, Ascension, Pentecost ±1) and every fixed Great Feast ± 1 day.
- **Tier 2 — coverage matrix**: walk the year, take the first date that hits each unique `(season, dow, tone, weekOfLent)` tuple. Catches every distinct calendar-entry generator path.
- **Tier 3 — vigil saints**: the 12 fixed vigil-rank feasts whose service structure differs from ordinary days.

`npm run audit` uses this set by default. `npm run audit:full` runs the full 365-day sweep when you want exhaustive coverage.

Reports land at `audit/reports/latest.{md,json}`.

## Add a rule

Drop a file in `audit/rules/<family>/<id>.js`. Families are by initial:
- **A** calendar geometry (season, tone, eothinon)
- **B** service availability (which services on which dates)
- **C** substitution flags (paschal opening, paschal aposticha, etc.)
- **D** variant tables (great feasts, vigil saints, co-celebrations)
- **E** provenance / source quality
- **F** theme / keyword heuristics

Each rule exports `{ id, family, severity, description, appliesTo, check, needsAssembled? }`. `appliesTo(ctx)` filters cells; `check(ctx)` returns `[]` for pass or an array of `{ message, hint? }`. Set `needsAssembled: true` if the rule needs `ctx.assembled.blocks` (auditor fetches via HTTP when `--http` is on).

## Allowlist

`known-issues.json` has three lists:
- **parishOverrides** — intentional divergence from OCA (HTM Beatitudes, Slavonic pre-Trisagion, etc.). Suppresses matching findings forever; cite the reason.
- **trackedGaps** — incomplete data (non-OCA `_source` tags). Suppresses individual finding but tracks the count.
- **knownFailures** — specific `(date, rule)` pins expected to clear once a planned fix lands.

## What the context object exposes

`ctx` is built per (date × service) and includes: `date`, `dateForEntry`, `season`, `dow`, `tone`, `daysSincePascha`, `isBrightWeek`, `isPentecostarion`, `isPaschalGreetingWindow`, `calendarEntry`, optional `assembled`. For `service: 'vespers'`, fields are computed off the *liturgical* day (date-shift applied), matching what the API serves.
