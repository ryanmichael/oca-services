# Service auditor

Sweeps the liturgical calendar and runs structural / theme rules against the assembled output. Catches the bug classes that have historically required manual audits before printing a service.

## Run it

```bash
npm run audit         # full year × vespers/liturgy/presanctified, needs server on :3000
npm run audit:quick   # structural rules only, no server needed, --strict (used by pre-push)

# Direct invocations for finer control:
node audit/index.js --date 2026-05-13
node audit/index.js --year 2026
node audit/index.js --year 2026 --rules C2-paschal-aposticha-window
node audit/index.js --year 2026 --strict        # exit 2 on any high-severity finding
node audit/index.js --year 2026 --no-allowlist  # raw output, ignore known-issues
node audit/index.js --year 2026 --http http://localhost:3000  # enable rules that need assembled output
```

`audit:quick` runs in the pre-push hook (`.git/hooks/pre-push`). Rules that need assembled output (`needsAssembled: true`) are silently skipped when `--http` is omitted — only the calendar-entry-level rules fire, which makes the quick path fast and server-free.

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
