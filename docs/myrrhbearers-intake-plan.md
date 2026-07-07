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
- **2b — Resurrection canon. DONE.** Robust parser splits the canon service on
  every `Irmos:` marker (not section boundaries) → exactly 24 sub-canons (8 odes ×
  resurrection/cross/theotokos) on all 8 tones. This auto-handles per-tone
  irregularities: variable troparia counts, and even Tone 5's *missing "Ode VI"
  heading* that merges two sub-canons into one block. Emits `canonIrmoi.N`
  (resurrection irmos) + `canonTroparia.N` (troparia tagged resurrection/
  crossResurrection/theotokos with the fixed refrains). Verified sub-canon
  assignment incl. the Tone 5 merge boundary. **Octoechos intake COMPLETE.**
- **3 — Fixed-text overlay. MEASURED (2026-07-07) → small/targeted, not a full
  overlay.** Diffed their `publications/Divine-Liturgy.pdf` (dual-language, 50pp)
  vs our `fixed-texts/liturgy-fixed.json`: Creed ~95%, Trisagion ~91%, Lord's
  Prayer ~95% ("in heaven" vs "in the heavens"), "It is truly meet" ~95%, Anaphora
  dialogue = standard formula (matches). The invariable ordinary is standardized —
  differences are trivial (heaven/heavens, capitalization). **The one materially
  different, choir-sung text is the Cherubic Hymn (~65%):** ours "We, who
  mystically represent the Cherubim, and who sing to the Life-creating Trinity the
  thrice-holy hymn…" vs MB "Let us who mystically represent the Cherubim, and chant
  the thrice-holy hymn unto the life-creating Trinity…". **So Phase 3 = override
  ~1–5 specific texts (led by the Cherubic Hymn) in
  `fixed-texts/translations/myrrhbearers/liturgy-fixed.json`, NOT a wholesale
  overlay.** The manifest + cascade are already wired (Phase 4), so authoring the
  sparse override is all that remains.
- **4 — Parish default (the actual ask).** Two sides:
  - *Fixed texts:* set the parish's default translation stack to include the
    `myrrhbearers` overlay — existing `parish_settings` + stack mechanism.
  - *Variable texts (Octoechos):* DONE via a **per-request overlay cascade** (not
    a SOURCE_PRIORITY change — that global ranking is for DB stichera/menaion; the
    overlay is a whole-object cascade). New `server-lib/sources/octoechos-overlay.js`
    `resolveOctoechos(sources, stack)` reuses `deepMergeOverlay` + `resolveExtendsChain`:
    it walks the active stack's extends chain and cascades any registered octoechos
    overlay (`sources.octoechosOverlays[id]`, loaded at boot in `load.js`) onto the
    base, memoized per stack. Routes (`api-service.js`, `api-matins.js`) build a
    per-request `reqSources` and pass it to the Vespers/Matins assemblers. Returns
    the identical base object for null/other stacks (zero impact). **This closes the
    "overlays don't cover variable-sources" gap** (`project_overlay_variable_sources_gap`)
    for the Octoechos. Manifest `fixed-texts/translations/myrrhbearers/` (kind
    `tradition`, extends `oca`) registers the reusable stack; a parish adopts it by
    putting `myrrhbearers` in its `extends_chain` (resolveOctoechos picks it up via
    the chain). Verified: `?translation=myrrhbearers` renders Myrrh-bearers stichera/
    lauds for Vespers + Matins; base unchanged; 149 tests + drift green.
    **Route coverage:** wired on all four translation-aware content routes —
    `api-service` (Vespers), `api-matins` (Matins), `api-liturgy` (Liturgy
    beatitudes + resurrectional troparion/kontakion), `api-typika` (Typika).
    Verified all render Myrrh-bearers octoechos content with `?translation=
    myrrhbearers` and leave fixed texts intact. **Not wired (by design):**
    `service-page` (legacy HTML route — resolves no translation at all),
    `api-choir-prep` / `api-days` (use `buildMatinsSpec` only as a boolean
    availability probe — overlay irrelevant), `api-pascha-collection` (paschal
    content; octoechos resurrectional cycle is superseded during Pascha).
- **5 — QA.** DONE for the Octoechos overlay: `scripts/myrrhbearers-ingest/qa-overlay.js`
  validates all 8 tones for slot completeness, empty text, and content-sanity
  (theotokia read as Marian; canon sub-canons correctly assigned res/cross/theotokos
  — catching swaps). It surfaced that Tone 4's "Antiphon II" was mis-parsed
  (their page marks it `<p><i>Antiphon II</i></p>` not `<h4>`), now fixed in
  `parse-octoechos.js`. **All 8 tones pass clean.** (Remaining: cross-check rendered
  *services* vs their per-Sunday booklets + a scrape-drift check — future.)

## Interaction with the Lambertsen rollout (just completed)

No conflict, nothing to undo. Lambertsen menaion stichera sit at priority 99
(`SOURCE_PRIORITY` unknown → surfaces only where nothing else exists). Once this
parish prefers `myrrhbearers`/`stSergius`, those take precedence automatically.

## Recommended scope defaults (pending user confirmation)

- **Adoption:** Octoechos + fixed-text wording (keep St-Sergius Menaion).
- **Permission:** draft + send the email first.
- **Default scope:** parish-scoped first (ship per-parish source-preference for one
  parish); generalize to a reusable "Myrrh-bearers" stack later if wanted.
