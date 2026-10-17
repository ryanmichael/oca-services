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

**Tristate rubrics are exempt from the dual-write** — see below. Their typed column is pinned to the registry default and never mirrors the pick.

## Tristate rubrics

A rubric is **tristate** when its consumer reads `undefined` differently from `false`. It declares `"tristate": true` and three `tristateOptions`. `includeSecondKoinonikon` is the only one today:

| State | Stored as | What the consumer does |
|---|---|---|
| `unset` | **no row** in `parish_rubrics` | polyeleos saint's Communion Verse sings; cocelebrated-overlay extras off — **OCA practice** |
| `1` | `value='1'` | both sources |
| `0` | `value='0'` | neither; one Communion Verse only |

Such a rubric is driven **only** by its `parish_rubrics` row, and the admin UI renders it as a three-way `<select>` (`renderTristateRubrics`), never a checkbox. `server-lib/parishes/rubric-registry.js > planRubricPickWrites()` is the single place that decides the writes, so the rules below are testable without a server, a token or a DB write.

### Why (two silent failures, 2026-08-08 → 2026-10-16)

1. **A checkbox cannot express `unset`.** The control was labelled *"Second communion verse — When the day has two koinonika, both are sung"*, which reads as an optional extra. Unchecking it stored an explicit `0`, and `0` suppresses the saint's *own* appointed verse. Measured over 2026 (all Sundays): **01-11** Theodosius · **07-05** Athanasius of Athos · **07-26** Jacob Netsvetov · **08-09** Herman of Alaska · **08-16** the Image Not-Made-By-Hands (*the OCA order prescribes both verses here*) · **08-30** Alexander of Constantinople · **09-13** Founding of the Church of the Resurrection · **10-18** Apostle Luke · **12-06** Nicholas. The parish had no way to ask for the default back; `setRubricPick` is an UPSERT and never deletes.
2. **Any later save re-asserted it.** The dual-write fired for every typed rubric column present in the payload, changed or not, so clearing the row by hand was undone by the next save of an unrelated setting — and nothing appeared in `parish_settings_history`, because the value had not changed.

Lenten Sundays 2/4/5, Holy Fathers (07-19, 10-11) and the Sunday after the Elevation (09-20) were already immune via `prescribedSecondKoinonikon` (2026-10-08).

### Rules

- A tristate rubric's typed column is **excluded from the dual-write** and **pinned to the registry default** on every save. The pin matters: `buildRubrics` falls back to the typed column when no pick exists, so a leftover `1` there would make a cleared pick read as `true` — turning "OCA default" into "always both".
- `value: 'unset'` in `rubric_picks` means **DELETE the row**, via `clearRubricPick`.
- An unrecognised value is stored as a definite state, never treated as `unset`: a garbled payload must not silently reset the parish.
- `GET /parish-admin/<slug>/settings` reports `tristate_rubrics: {id: 'unset'|'1'|'0'}`. The legacy `rubric_include_second_koinonikon` boolean is still sent for API compatibility but is **not** the truth — it cannot represent `unset`.
- Each option carries both a `label` and a `detail`. The detail spells out the consequence; the original one-line description is what made the suppressing value look harmless.

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
| `includeSecondKoinonikon` | `readings.includeSecondKoinonikon` | boolean (**tristate**) | liturgy | `rubric_include_second_koinonikon` (pinned to default) | `server-lib/sources/liturgy-from-orthocal.js` |
| `omitCatechumensSeasons` | `omitCatechumensSeasons` | csv-strings | liturgy | `rubric_omit_catechumens_seasons` | `assemblers/liturgy.js` |
| `paschalCommunionYearRound` | `paschalCommunionYearRound` | boolean | (none) | `rubric_paschal_communion_year_round` | **orphan-unused** |
| `beatitudesTropariaReaderLed` | `antiphons.beatitudesTropariaReaderLed` | boolean | liturgy | `rubric_beatitudes_reader_led` | `assemblers/liturgy-parts/antiphons.js` |
| `faithful2Long` | `litanies.faithful2Long` | boolean | liturgy | `rubric_faithful_litany_2_long` | `assemblers/liturgy-parts/litanies.js` |

## Code surface

- `data/rubric-registry.json` — registry definitions.
- `storage/migrations/007_parish_rubrics_registry.sql` — table + backfill (idempotent).
- `server-lib/parishes/rubric-registry.js` — loader, picks reader/writer (`setRubricPick`, `clearRubricPick`), coercion, and `planRubricPickWrites()` / `tristateStates()` for the tristate rules.
- `server-lib/parishes/index.js > buildRubrics(row, picks)` — registry-driven materialization.
- `server-lib/routes/parish-admin.js` — dual-write POST (tristate columns excluded); serves `/api/rubric-registry`; GET reports `tristate_rubrics`.
- `public/scripts/parish-admin.js > renderTristateRubrics()` + `public/parish-admin.html` `[data-tristate-rubric]` host — the three-way control.
- `scripts/capture-rubrics-snapshot.js` — captures the legacy buildRubrics() output for roundtrip testing.

## Invariants (tested)

- **INV-A** — Every `rubric_*` typed column appearing in any `storage/migrations/*.sql` has a corresponding registry entry (matching `dbColumn`).
- **INV-B** — Every registry rubric with non-empty `appliesTo` has at least one consumer (grep for the namespace's terminal key in `server-lib/` or `assemblers/`).
- **INV-C** — Migration 007 is idempotent: re-running produces the same `parish_rubrics` row set byte-for-byte.
- **INV-D** — For every known parish, `buildRubrics(row, getRubricPicks(db, parishId))` (new registry path) deep-equals the legacy typed-column-only `buildRubrics(row)` output captured in `test/contracts/__snapshots__/rubrics-pre-refactor.json`.
- **INV-E** — An explicit pick of a tristate rubric survives default-compaction: the parish's chosen value reaches the consumer, because absent means "allowed" there.
- **INV-G** — Every rubric declaring `tristate: true` offers exactly three `tristateOptions` (`unset`/`1`/`0`), each with a `label` and a `detail`. Without them the admin UI falls back to a checkbox and cannot express the unset state.
- **INV-H** — A tristate rubric is driven only by its pick: its column is always in `skipDualWriteColumns` and pinned to the registry default (**even when the payload carries no pick for it** — that is the re-assertion trap), `unset` plans a `clear`, `1`/`0` round-trip as themselves, and an unparseable value plans a `set`.
- **INV-H2** — Non-tristate rubrics keep their existing write path: a column-backed boolean sent in `rubric_picks` stays a no-op there, a registry-only rubric is still settable, and an unknown id is dropped.
