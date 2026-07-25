---
name: menaion-ingest
description: Ingest Menaion saint-day texts (stichera + troparia) from a source corpus into oca.db as coverage-fill — parse → coverage-diff → extract the saint's own share → attribute → apply reversibly → QA → drift-guard. Use when the user wants to ingest, backfill, import, or QA Menaion hymns for saints that currently render the generic General-Menaion fallback.
---

# Menaion ingestion workflow

Most `commemorations` rows have no proper stichera, so their principal saint renders the generic `(name)` General-Menaion fallback. This skill fills that gap from a licensed source corpus (default: Lambertsen / typiconman/english-md) **without ever overwriting existing OCA texts**, and closes each batch with QA + a drift guard so a bad import can't reach prod silently.

The prototype this codifies is the Lambertsen rollout (memory `[[project_lambertsen_menaion_ingest]]`, commits `d7f5eaa` → `24457a3`). Read that memory before a large run.

## Default mode: DRY-RUN, DB WRITES ARE THE LAST STEP

**No tool in this pipeline writes `oca.db` implicitly.** `import-menaion.js` emits `import-<m>.sql` only. You review the SQL, back up the DB, then apply via the `sqlite3` CLI. The MCP `write_query` tool does **not** persist to the on-disk DB — never use it to apply an import.

Dry-run output ends with:

> Ready to apply. Reply "apply" to run the backup + `sqlite3` import, or tell me what to change and I'll regenerate the SQL.

## Three non-negotiable invariants

1. **Attribution.** Every imported row is tagged `source='lambertsen'` (or the corpus's source id). The corpus is used *with attribution*; provenance must be cleared before first use (Lambertsen: cleared 2026-07-07). `deduplicateBySource` prefers OCA where both exist.
2. **Never overwrite OCA.** Import only touches commemorations with **zero** existing stichera. Confirm this in the diff before generating SQL — a non-empty `stichera` set for a target cid is a hold, not a merge.
3. **Import the saint's own share only.** LIC blocks blend feast + saint stichera. `groupRole(label)` must classify each sub-group; feast/forefeast/afterfeast/Pentecostarion/Triodion/Octoechos/Cross/departed groups come from *other* tracks and are excluded. When `extracted ≠ declared` slot count, **hold the chapter** — do not pad or truncate.

## The pipeline

Run from repo root with the corpus cloned and `MENAION_SRC` exported (see `scripts/menaion-ingest/README.md`).

| Step | Tool | Output | Gate |
|---|---|---|---|
| 1. Parse | `node scripts/menaion-ingest/parse-menaion.js MenaionLambertsen<Month>` | tone-tagged sections | sanity-check tone tags + section split |
| 2. Coverage-diff | `node scripts/menaion-ingest/build-diff.js MenaionLambertsen<Month> <m>` | gap-fillable vs already-covered vs unmatched | unmatched are usually transliteration — inspect before discarding |
| 3. Match + validate | `node scripts/menaion-ingest/menaion-audit.js [--validate]` | `menaion-manifest.json` (all 12 months) | fidelity validator must pass |
| 4. Generate SQL | `node scripts/menaion-ingest/import-menaion.js <m>` | `import-<m>.sql` (dry-run) | **review every held chapter is genuinely ambiguous, not a matcher miss** |
| 5. Apply (reversible) | backup → `sqlite3 storage/oca.db < import-<m>.sql` | DB rows | see below |
| 6. QA cross-check | `node scripts/menaion-ingest/menaion-qa.js` | independent-witness report | flags saints storing moveable-cycle text instead of their proper |
| 7. Repair (if QA flags) | `node scripts/menaion-ingest/repair-menaion.js` | displaced-row fix SQL (dry-run) | high-precision filter; re-review before applying |
| 8. Drift guard | `npm run drift:check` | green | new `source='lambertsen'` rows must pass sticheron/troparion integrity checks |

### Step 5 — the only DB-mutating step

```bash
cp storage/oca.db storage/oca.db.bak-<label>            # ALWAYS back up first
sqlite3 storage/oca.db < scripts/menaion-ingest/import-<m>.sql
```

Roll back a batch:

```sql
DELETE FROM stichera WHERE source='lambertsen';          -- or scope by commemoration_id
```

Target schema: `stichera(commemoration_id, section['lordICall'|'aposticha'], order, tone, label, text, source)` and `troparia(commemoration_id, type, tone, text, pronoun, source)`. Watch for `UNIQUE(cid, section, order)` collisions.

## Coordination landmine — read before touching oca.db

`oca.db` is a **binary file that cannot be merged**. If a parallel terminal/session is also mutating it (see `[[project_two_terminal_coordination_2026_07_07]]`), the DB-owning session applies imports; a code-only session must not. Confirm ownership before Step 5. Verify the DB is byte-clean (`git status` on `storage/oca.db`) before and after.

## Pronoun register

Imported text may be modern-English ("you/your"). Convert to archaic ("thou/thee") with `node scripts/yy-to-tt.js` (see the `pronoun-transform` path / memory `[[project_menaion_pronoun_pass_2026_06_17]]`). The transformer flags a `needs-review` set — those rows are the judgment tail, not auto-apply.

## Holds are a feature

A held chapter (ambiguous saint, feast-blend that won't cleanly separate, Paschal interleave) is **correctly deferred**, not a failure. Log the held set with a one-line reason each. Silent truncation of a blended LIC block is the failure mode this skill exists to prevent.

## Model routing (cheaper bias)

| Sub-task | Model | Why |
|---|---|---|
| Parse / coverage-diff / SQL generation / running the QA + drift scripts | **Haiku 4.5** | Deterministic tooling; you're driving scripts and reading their output. |
| Feast-vs-saint `groupRole` calls, saint/slot keying, resolving `extracted ≠ declared` holds, `needs-review` pronoun rows | **Sonnet 5** | Liturgical judgment against orthocal + chapter titles; wrong call bleeds feast text into a saint. |
| Genuinely ambiguous transliteration/attribution (multi-saint chapters, Paschal interleave design) | **Opus 4.8** — escalate only these | The hard tail where a mis-attribution corrupts a saint's proper across every year. |

## Report shape (dry-run)

```
### Run — Menaion <Month>, source=lambertsen
Gap-fillable: N   Already-covered: N   Unmatched: N   Held: N
DB owner this session: <this terminal | other — code-only>

### Imports (gap-fillable, cid → stichera count)
- 0421 Theodore of Sykeon → 6 (lordICall) [tones 1,4,8]
…
### Held (with reason)
- 0106 Theophany forefeast blend — extracted 3 ≠ declared 8, feast+saint mix
…
### QA cross-check
- <clean | N flagged for repair-menaion>

Ready to apply. Reply "apply" to run the backup + sqlite3 import.
```

## Pointers

- Plan + phase log: `docs/lambertsen-menaion-plan.md`; memory `[[project_lambertsen_menaion_ingest]]`
- Tooling + setup: `scripts/menaion-ingest/README.md`
- Inspect a date's menaion state vs orthocal: `node scripts/menaion-inspect.js <date>`
- Gap-detect: `getMenaionRanked` sticheraComm null; fallback trigger `server-lib/assemble/for-date.js`; generic source `server-lib/sources/general-menaion.js`
- DB write conventions: `storage/README.md`, memory `[[project_synaxis_na_data_fix]]`
- Related: `[[project_stichera_miskey_sweep_2026_07_19]]` (the drift rule that catches mis-keyed imports), `[[project_menaion_pronoun_pass_2026_06_17]]`
