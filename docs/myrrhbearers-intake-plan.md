# Holy Myrrh-bearers Intake Plan

**Goal:** Adopt Holy Myrrh-bearers (myrrh-bearers.org, Etna CA) service texts and
default them for a specific parish.

**Status:** In progress (2026-07-07). **Decisions CONFIRMED:** scope = Octoechos +
fixed-text wording (keep St-Sergius Menaion); **Phase 0 permission CLEARED** (parish
is able to use it); default = a **reusable** "Myrrh-bearers" stack (not parish-only).
**Phase 1 done** — result below.

## Phase 1 result (baseline diff)

Their Sunday Octoechos vs our `variable-sources/octoechos.json`: **~70% mean
word-overlap** on the Saturday Great Vespers resurrectional stichera across all 8
tones (65–75% per tone; 48 stichera compared). Same hymns / same tradition, but a
genuinely distinct translation — ~30% of words differ (Zion/Sion, "make merry"/"be
glad", "life-receiving tomb"/"lifebearing tomb"). **Conclusion: full-Octoechos
intake is warranted.** Parser + harness in `scripts/myrrhbearers-ingest/`.

## Key reframe — this is bounded

Myrrh-bearers is largely a **service-prep curation site**, not a new corpus.
Per-Sunday, their propers pull the **English Menaion straight from St-Sergius
Emenaion** (`st-sergius.org/services/Emenaion/MM-DD.pdf`) — the *same source our
DB already uses* for menaion propers/canons. What is genuinely distinctive to
Myrrh-bearers:

1. Their own **Sunday Octoechos** translation — `octoechos/english-1…8.htm`
   (HTML) + `publications/Sunday-Octoechos-Tone-N.pdf` (authoritative PDF).
2. Their composed **service booklets / fixed-text wording / rubrics** (per-Sunday
   Liturgy + Rubrics PDFs).

So "move to Myrrh-bearers" ≈ **their Octoechos + their fixed-text wording**, while
**keeping the St-Sergius Menaion we already have.** Not a from-scratch rebuild.

### Our current Octoechos is already St-Sergius-adjacent
`variable-sources/octoechos.json` is keyed by tone with **per-hymn `_source`
tags** already present — a mix of `stSergius` (`st-sergius.org/services/oktiochos/`)
and OCA (`oca-2026-…`, `oca-parma-stsergius`). So the delta to Myrrh-bearers may be
small for some tones. Phase 1 measures it. The existing per-hymn source tagging
also means a parish source-preference override is a clean fit.

## Redistribution — GRANTED (2026-07-07)

Holy Myrrh-bearers granted **both use and public redistribution** (repo is public
at `ryanmichael/oca-services`). So their derived text is committed in-repo (like
the MIT Lambertsen data), with attribution retained in each file's `_meta._source`
/ `_meta._permission`. No private-delivery path needed. **Always keep the
attribution.** Files: `variable-sources/octoechos-myrrhbearers.json` (+ future
`fixed-texts/translations/myrrhbearers/`), regenerable via `build-overlay.js`.

## License / provenance (Phase 0 — HARD GATE)

Myrrh-bearers posts **no reuse license** — only "© 2026 Holy Myrrh-bearers" +
`e-mail@myrrh-bearers.org`. Contrast Lambertsen (MIT, `english-md`). **The parish
must obtain written permission** to reuse their texts in the digital service tool
before any ingestion. Likely granted (own tradition, own liturgical use). Draft
email in `docs/myrrhbearers-permission-email.md`.

## Phases

- **0 — Permission.** Parish emails Holy Myrrh-bearers; get written OK. Gate for 2–3.
- **1 — Baseline diff (no ingestion of their text needed beyond a sample under
  fair-use review).** Compare one tone of their Octoechos + one Sunday's booklet
  against what we render today; quantify the wording delta per tone/service. Right-
  sizes 2–3. Reuse the QA-diff technique from the Lambertsen work
  (`scripts/menaion-ingest/menaion-qa.js` pattern).
- **2 — Octoechos intake.** Mostly done. `parse-octoechos.js` + `build-overlay.js`
  emit `variable-sources/octoechos-myrrhbearers.json` (source-tagged overlay;
  base untouched). **Done, all 8 tones, structural parity + text-verified:**
  Saturday Great Vespers (resurrectional stichera + glory + dogmatikon + aposticha
  + aposticha-theotokion + troparion + dismissal-theotokion) · Sunday Matins
  (sessional hymns ×2, hypakoï, antiphons of degrees [3; Tone 8 = 4], matins
  prokeimenon, post-Gospel sticheron, lauds ×8) · Sunday Liturgy (beatitudes ×8).
  Schema/tests/drift green (nothing loads it yet). Known source gap: Tone 4 is
  missing Antiphon II on their page.
- **2b — Resurrection canon (deferred).** Their canon (irmoi + resurrection/cross/
  theotokos troparia) has per-tone-variable structure (ode-section counts 11–24;
  irregular `<p>` splits), so it needs a label-based ode parser ("Ode N" / "Canon
  of…" headers + irmos/troparion detection) rather than count-based grouping —
  building it carelessly would mis-assign troparia. Targets base
  `sunday.matins.canonIrmoi.N` + `canonTroparia.N` (3 res + 3 cross + 3 theotokos,
  refrains are fixed formulas already known).
- **3 — Fixed-text overlay.** Their Liturgy/Vespers/Matins ordinary wording →
  `fixed-texts/translations/myrrhbearers/` (manifest + sparse `liturgy-fixed.json`).
  Fully supported by the existing overlay cascade today.
- **4 — Parish default (the actual ask).** Two sides:
  - *Fixed texts:* set the parish's default translation stack to include the
    `myrrhbearers` overlay — existing `parish_settings` + stack mechanism.
  - *Variable texts (Octoechos/Menaion):* **new capability.** Source preference is
    today a GLOBAL hardcoded ranking — `SOURCE_PRIORITY` in `oca-psalter.js`
    (`oca-menaion:1 > stSergius:2 > stSergius-general:3 > unknown:99`), consumed by
    `deduplicateBySource` (used in `server-lib/sources/menaion.js`,
    `server-lib/sources/db-source.js`, octoechos selection). Make this ranking
    **parish-configurable** (a per-parish source-priority override) so this parish
    prefers `myrrhbearers` without changing global behavior. This also closes the
    documented "overlays don't cover variable-sources" gap
    (`project_overlay_variable_sources_gap`).
- **5 — QA + guardrail.** Cross-check rendered services vs the Myrrh-bearers
  booklets (parish-baseline oracle style, cf. `scripts/ocanwa-baseline.js`); add a
  scrape-drift check on their pages.

## Interaction with the Lambertsen rollout (just completed)

No conflict, nothing to undo. Lambertsen menaion stichera sit at priority 99
(`SOURCE_PRIORITY` unknown → surfaces only where nothing else exists). Once this
parish prefers `myrrhbearers`/`stSergius`, those take precedence automatically.

## Recommended scope defaults (pending user confirmation)

- **Adoption:** Octoechos + fixed-text wording (keep St-Sergius Menaion).
- **Permission:** draft + send the email first.
- **Default scope:** parish-scoped first (ship per-parish source-preference for one
  parish); generalize to a reusable "Myrrh-bearers" stack later if wanted.
