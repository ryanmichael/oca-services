# Menaion ingestion harness (Lambertsen / english-md)

Tools for the coverage-fill described in `docs/lambertsen-menaion-plan.md`.
Source corpus: **[typiconman/english-md](https://github.com/typiconman/english-md)**
(Isaac E. Lambertsen's Menaion, MIT wrapper — **use with attribution**).

## Setup

The corpus is not vendored. Clone it and point the tools at it:

```bash
git clone --depth 1 https://github.com/typiconman/english-md.git
export MENAION_SRC="$PWD/english-md"     # or place it at scripts/menaion-ingest/english-md
```

## Tools

| Script | Purpose |
|---|---|
| `parse-menaion.js` | Parse a month's chapters into structured, tone-tagged sections. `node parse-menaion.js MenaionLambertsenApril` |
| `build-diff.js` | Per-month coverage diff vs `storage/oca.db`. `node build-diff.js MenaionLambertsenApril 4` |
| `menaion-audit.js` | Hardened matcher + extraction-fidelity validator; writes `menaion-manifest.json` (all 12 months). `node menaion-audit.js [--validate]` |
| `import-menaion.js` | Emit `import-<m>.sql` for a month's gap-fillable chapters, with per-saint attribution + dedup. **Dry-run** (writes SQL only). `node import-menaion.js 4` |

## Applying an import (reversible)

`import-menaion.js` never writes the DB itself — review the SQL, then:

```bash
cp storage/oca.db storage/oca.db.bak-<label>          # backup
sqlite3 storage/oca.db < scripts/menaion-ingest/import-4.sql
```

All rows are tagged `source='lambertsen'`. To roll back a batch:

```sql
DELETE FROM stichera WHERE source='lambertsen';        -- or scope by commemoration_id
```

Imports only touch commemorations that have **zero** existing stichera, so OCA
texts are never overwritten; `deduplicateBySource` prefers OCA where both exist.

## Known deferrals (see plan §edge-cases)

- **Paschal-season interleave** chapters (Menaion + Pentecostarion stichera in one
  LIC block) are skipped by the importer — need Pentecostarion-aware handling.
- Great Feasts / rite / hours files are out of scope (handled elsewhere).
