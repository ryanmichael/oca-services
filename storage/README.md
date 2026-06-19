# storage/

This directory holds the canonical data for the application. The DB
(`oca.db`) is committed; the supporting scrape inputs and parser outputs
are gitignored (see `../.gitignore`).

## oca.db tables (6 canonical + 0 runtime, as of 2026-06-19)

| Table | Rows | Populated by | Where it lives now |
|---|---:|---|---|
| `source_files` | 128 | `import.js` ← `storage/parsed/*.json` | DB only |
| `blocks` | 4,475 | `import.js` ← `storage/parsed/*.json` | DB only |
| `commemorations` | 2,639 | `scrape-menaion-troparia.js` (external HTTP) | DB only |
| `troparia` | 8,136 | `scrape-menaion-troparia.js`, transforms by `scripts/yy-to-tt.js` | DB only |
| `stichera` | 3,463 | `scrape-menaion-stichera*.js`, `scrape-great-feasts.js`, `storage/migrations/*.sql` | DB only |
| `general_menaion` | 250 | `scrape-general-menaion.js` (external HTTP) | DB only |

**Truth note**: the DB is the source of truth for 14,488 of the 18,919
rows. Only the 4,603 rows in `source_files + blocks` are derivable from
committed input (`storage/parsed/*.json`, currently gitignored too). The
remaining rows were scraped from external services and transformed
in-place; once written, they live only in `oca.db`.

If you ever need to rebuild from scratch:

```bash
# Rebuilds source_files + blocks only
node import.js --reset

# To rebuild the menaion content you must re-run the scrapers (slow,
# depends on external availability) and re-apply the migrations + yy→tt
# transform. There is no single-command rebuild today.
```

## Don't write here at runtime

Track E (2026-06-19) retired the `orthocal_cache` table — it was the
only runtime-mutated table and caused noisy binary diffs in git on every
server boot. Orthocal lookups now resolve in this order:

1. `data/orthocal/<date>.json` (Track B vendored 2025–2029)
2. In-process Map (per-Node-process, no persistence)
3. Live API (only for dates outside the vendored window)

The boot-time `ensureOrthocalCacheTable()` is now a no-op stub kept for
call-site compatibility. Calling routes don't need to change.

## storage/migrations/

Hand-written SQL corrections applied once and committed for the record.
Not auto-applied; if you ever rebuild the DB from scratch you must
replay these by hand. See individual filenames for context.

## Refreshing scraped data

- `scrape-menaion-troparia.js` — commemorations + troparia
- `scrape-menaion-stichera*.js`, `scrape-great-feasts.js` — stichera
- `scrape-general-menaion.js` — general_menaion
- `scrape-octoechos.js`, `scrape-pentecostarion.js`, `scrape-canon-troparia.js`, etc. — populate `blocks` via `parser → import` (these write to `storage/parsed/`)

After a scrape run the DB diff lands in `oca.db`. Commit the DB along
with any new `storage/migrations/*.sql` you generate.
