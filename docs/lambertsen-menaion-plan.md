# Lambertsen Menaion Ingestion Plan (`typiconman/english-md`)

**Status:** Phase 0 cleared (2026-07-07). Phases 1–2 prototyped and validated.
**Source:** https://github.com/typiconman/english-md — Isaac E. Lambertsen's
complete Menaion (all 12 months), extended-Markdown, one `MMDD*.md` chapter per
principal commemoration + a per-month `manifest.xml`.

## Why

Only **366 of 2,638** `commemorations` rows have day-specific `stichera`; every
other saint-day renders our **generic General-Menaion fallback** (category text
with `(name)` substituted — see `server-lib/sources/general-menaion.js`,
fallback trigger `server-lib/assemble/for-date.js` L134–142). Lambertsen supplies
**proper, saint-specific** Vespers stichera + a full Matins canon for ~500 days.

## Provenance (Phase 0 — DONE)

Usable **with attribution**. The repo wrapper is MIT; the translation is
Lambertsen's, so attribution is the condition. Rules:
- Import under `stichera.source = 'lambertsen'` / `troparia.source = 'lambertsen'`.
- **Never overwrite existing OCA rows.** `deduplicateBySource` already prefers OCA,
  so Lambertsen only surfaces where we have nothing.
- Render an attribution line wherever Lambertsen text is shown.

## Coverage (validated prototype, full year)

| | Chapters | Notes |
|---|---|---|
| Total chapters | 512 | ~1.4 per calendar day |
| **Gap-fillable** | **212** | principal saint renders generic fallback today; Lambertsen has proper stichera |
| Already-covered | 211 | QA cross-check corpus (Phase 6) |
| Unmatched | 77 | genuinely-absent saints or secondary commemorations, not spelling |

Second axis: **every chapter carries a full 8-ode Matins canon** (~4,000 odes)
that our Matins track (`variable-sources/menaion/*.json`) largely lacks.

The 212 figure is stable across parser revisions — it keys on
`match + saint_type-bearing commemoration + 0 stichera + ≥1 parsed sticheron`,
not on exact counts.

## File format (parser notes)

- Blank-line-delimited paragraphs. Section headers end in the corpus em-dash `—`
  or `:`; hymn bodies are plain paragraphs between headers.
- Services: `AT VESPERS:`, `AT MATINS:`, `AT LITTLE VESPERS:`, `At Great Vespers`.
- LIC intro: `On "Lord, I have cried…", N stichera, in Tone IV: Spec. Mel.: "…"—`.
- Canon: `Ode I` … `Ode IX`, with `*Irmos:*`, `*Theotokion:*`, `*Stavrotheotokion:*`.
- Tones are Roman numerals; special-melody + idiomelon labels are inline.

### Extraction edge-cases discovered in Phase 2 (the real backlog)

1. **Split sticheron groups** — `8 stichera: 4 in Tone II… And 4 in the same tone…`.
   Handled: continuation intros (`CONT_RE`) fold into the open bucket.
2. **Multi-saint days** — `6 stichera: 3 of the hieromartyr… And 3 of the venerable one…`.
   The two sub-groups belong to **different `commemoration_id`s**. Counting is
   handled; **per-saint attribution is still to build** (Phase 2/3).
3. **Multiple Vespers services per file** — a saint may have both a daily form
   (e.g. 4 stichera) and a Great Vespers form (8). Import should prefer the
   Great Vespers form. Needs per-service segmentation.
4. **Paschal-season interleave** — `8 stichera: 3 from the Pentecostarion, and 5…`.
   Only the Menaion's own stichera should be imported; the rest come from our
   Pentecostarion track at assembly time.
5. **Feasts / rite / hours files** — Theophany, Dormition, Meeting, Nativity
   Hours, Blessing of Candles, etc. have non-standard structures. **Exclude** —
   we already handle Great Feasts; these are not gap-fill targets.
6. **Propers-light modern/local saints** — John of Shanghai, Grand Duchess
   Elizabeth, Basil of Ostrog carry only troparion/kontakion. Not parser bugs.

Prototype fidelity after handling (1)+(2)-counting: **290/512 clean**; residual
flags are dominated by (5) and (6), which are out of scope by design.

## Target schema

- `stichera(commemoration_id, section['lordICall'|'aposticha'], "order", tone, label, text, source)`
  — `order` 1..N for stichera, `0` for Glory/doxastikon.
- `troparia(commemoration_id, type['troparion'|'kontakion'|'theotokion'], tone, text, pronoun['tt'], source)`.
- **DB writes must use the `sqlite3` CLI** — the `sqlite-oca` MCP `write_query`
  does not persist (see `project_synaxis_na_data_fix`).

## Phases

- **0 — Provenance.** ✅ Use with attribution.
- **1 — Reconciliation & manifest.** Hardened transliteration-folding matcher;
  emit `menaion-manifest.json` classifying all 512 chapters
  (`commemoration_id | new-row | already-covered`, confidence). Human-review the
  77 unmatched + low-confidence matches. *Prototyped.*
- **2 — Extraction hardening, validated against the 211 covered days.** Handle
  edge-cases (1)–(4); exclude (5); flag (6). Validation oracle: re-parse covered
  days and confirm structural shape. *Prototyped; counting done, per-saint
  attribution + service segmentation remain.*
- **3 — Pilot import (April, reversible).** Write April's ~20 gap stichera under
  `source='lambertsen'` via `sqlite3`, with DB backup, dedup preferring OCA, a new
  audit rule, and a render check vs source. Prove the path + rollback.
- **4 — Full stichera rollout.** Remaining 11 months, batched, each backed up +
  audited. Dashboard shows the fallback→proper delta.
- **5 — Matins canon axis.** Ingest the ~4,000 canon odes into the Matins track.
  Structurally distinct → its own rollout mirroring 3–4.
- **6 — QA cross-check.** Feed the 211 already-covered chapters into the LLM-judge
  sweep to catch drift in our existing OCA texts. (Value survives even a "no" on
  provenance — no redistribution.)
- **7 — Maintenance guardrail.** Nightly re-parse-drift vs upstream; attribution
  rendering; optional `?translation=lambertsen` overlay.

```
Phase 0 ✅ ─────────────┐ (gates 3+)
1 → 2 → 3 → 4 → 6
        └────→ 5
                 7 (ongoing)
```

## Tools (prototype, session scratchpad → promote to `scripts/menaion-ingest/` at Phase 3)

- `parse-menaion.js` — manifest + chapter → structured, tone-tagged sections.
- `build-diff.js` — per-month coverage diff vs `oca.db`.
- `menaion-audit.js` — hardened matcher + Phase-2 fidelity validator + full-year
  `menaion-manifest.json` emission.

At Phase 3, vendor `english-md` into the repo (MIT + attribution) so the harness
is reproducible in CI.
