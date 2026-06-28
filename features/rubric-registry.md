# Feature: parish rubric registry

**Status:** shipped (Commit 1 of 2 — data plumbing; UI dynamism follows in Commit 2)
**Contract test:** `test/contracts/rubric-registry.test.js`
**Registry file:** `data/rubric-registry.json`
**DB table:** `parish_rubrics (parish_id, rubric_id, value, updated_at)`

## Purpose

Replaces the one-typed-column-per-rubric pattern on `parish_settings` (now at 9 columns and growing) with a single data-driven registry. Before this refactor, adding a new rubric required ~5 touchpoints (schema migration, `buildRubrics()` branch, parish-admin route whitelist, HTML checkbox, JS snapshot/load/save). After: **one registry entry plus one assembler consumer**.

## Architecture

Three pieces:

1. **`data/rubric-registry.json`** — the schema. Each rubric declares its UI label, description, runtime namespace, type (`boolean` or `csv-strings`), default value, which services it `appliesTo`, the legacy `dbColumn`, and (optionally) a stable `domId` for the admin form.
2. **`parish_rubrics` table** — generic key-value storage (`parish_id`, `rubric_id`, `value` as TEXT). One row per parish per rubric whose value differs from the default. Backfilled by migration 007 from existing typed columns.
3. **`server-lib/parishes/rubric-registry.js`** — loader (`loadRegistry`), reader (`getRubricPicks`), writer (`setRubricPick`), and type coercion (`coerce`).

At runtime, `buildRubrics(row, picks)` (in `server-lib/parishes/index.js`) walks the registry, reads each rubric's pick (falling back to default), coerces it, skips defaults, and assigns it into the rubrics object via `setDottedKey(r, def.namespace, value)`.

## Dual-write transition

During this bake-in period, parish-admin POSTs write to BOTH the typed columns (legacy) AND `parish_rubrics` (new). Reads go through the registry. Once a follow-up commit confirms no consumers reference the typed columns, they'll be dropped.

## How to add a new rubric (post-refactor)

1. Add a `rubrics` entry in `data/rubric-registry.json`. Set `appliesTo`, `namespace`, `type`, `default`, `label`, `description`.
2. Add the consumer in the appropriate assembler — read `opts.rubrics?.<namespace>` and branch on it.
3. (Until the typed columns are dropped) add a migration with `ALTER TABLE parish_settings ADD COLUMN rubric_<snake> …` matching the `dbColumn` field; the dual-write path uses it.

## Current registry entries

| id | namespace | type | appliesTo | dbColumn | consumer |
|---|---|---|---|---|---|
| `confessFirst` | `preCommunion.confessFirst` | boolean | liturgy | `rubric_confess_first` | `assemblers/liturgy.js` |
| `omitPreTrisagionLitany` | `omitPreTrisagionLitany` | boolean | liturgy | `rubric_omit_pre_trisagion_litany` | `assemblers/liturgy.js` |
| `includeLesserSaints` | `troparia.includeLesserSaints` | boolean | liturgy | `rubric_include_lesser_saints` | `server-lib/sources/liturgy-from-orthocal.js` |
| `includeSecondGospel` | `readings.includeSecondGospel` | boolean | liturgy | `rubric_include_second_gospel` | `server-lib/sources/liturgy-from-orthocal.js` |
| `includeSecondKoinonikon` | `readings.includeSecondKoinonikon` | boolean | liturgy | `rubric_include_second_koinonikon` | `server-lib/sources/liturgy-from-orthocal.js` |
| `omitCatechumensSeasons` | `omitCatechumensSeasons` | csv-strings | liturgy | `rubric_omit_catechumens_seasons` | `assemblers/liturgy.js` |
| `paschalCommunionYearRound` | `paschalCommunionYearRound` | boolean | (none) | `rubric_paschal_communion_year_round` | **orphan-unused** |
| `beatitudesTropariaReaderLed` | `antiphons.beatitudesTropariaReaderLed` | boolean | liturgy | `rubric_beatitudes_reader_led` | `assemblers/liturgy-parts/antiphons.js` |
| `faithful2Long` | `litanies.faithful2Long` | boolean | liturgy | `rubric_faithful_litany_2_long` | `assemblers/liturgy-parts/litanies.js` |

## Code surface

- `data/rubric-registry.json` — registry definitions.
- `storage/migrations/007_parish_rubrics_registry.sql` — table + backfill (idempotent).
- `server-lib/parishes/rubric-registry.js` — loader, picks reader/writer, coercion.
- `server-lib/parishes/index.js > buildRubrics(row, picks)` — registry-driven materialization.
- `server-lib/routes/parish-admin.js` — dual-write POST; serves `/api/rubric-registry`.
- `scripts/capture-rubrics-snapshot.js` — captures the legacy buildRubrics() output for roundtrip testing.

## Invariants (tested)

- **INV-A** — Every `rubric_*` typed column appearing in any `storage/migrations/*.sql` has a corresponding registry entry (matching `dbColumn`).
- **INV-B** — Every registry rubric with non-empty `appliesTo` has at least one consumer (grep for the namespace's terminal key in `server-lib/` or `assemblers/`).
- **INV-C** — Migration 007 is idempotent: re-running produces the same `parish_rubrics` row set byte-for-byte.
- **INV-D** — For every known parish, `buildRubrics(row, getRubricPicks(db, parishId))` (new registry path) deep-equals the legacy typed-column-only `buildRubrics(row)` output captured in `test/contracts/__snapshots__/rubrics-pre-refactor.json`.
