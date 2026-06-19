# Parish Self-Service — Design Doc (v2, post-architect-review)

**Status:** design proposal, revised after independent system + data architect reviews 2026-06-19.
**Companion:** [parish-self-service-inventory.md](parish-self-service-inventory.md) — what parishes actually customize today.
**Anchor parish:** St. John of Damascus, Tyler, TX.

**Changelog from v1:**
- Eliminated file-as-source-of-truth for parish overlays (was: materialize to `data/parish-overlays/`). New: **DB is source of truth, overlays injected in-memory into the loader.** Removes Railway ephemeral-FS risk + two-source-of-truth sync bugs.
- Normalized `variant_picks_json` blob → `parish_variant_picks` side table with FK to a versioned library registry.
- Replaced opaque `patron_commemoration_id` INT with a stable natural key (`patron_natural_key TEXT`); commemorationId resolved at request time.
- Promoted `rubrics_json` blob → typed columns for the 7 known flags; small `rubrics_extra_json` for overflow only.
- Added **Phase 0**: migration runner + variant-library stability contract before any `parish_settings` row exists.
- Added §11 (derivation templates as data) and §12 (rollback + write-path security).

---

## 1. Scope decisions (from research session 2026-06-19)

| Question | Decision |
|---|---|
| Is Tyler's customization level typical? | Assume yes; library-first strategy keeps custom uploads rare |
| Diocese tier in the cascade? | No. Parish priest / choir director / delegate is the actor |
| Storage model | DB is source of truth; loader does in-memory overlay injection (no on-disk parish overlay artifact) |
| Patron-saint picker UX | Searchable typeahead; store stable natural key |
| Auth model | Manual invite for v1; Tyler is the first parish, hand-onboarded |
| Bucket D (custom text upload) | Deferred to v2 |
| Preview panel | Whole-service preview, production-fidelity HTML |
| Parish pages public? | No for v1 |

### v1 ships these three buckets only:

- **A. Form fields** — parish name, jurisdiction pick, primate, ruling hierarch, patron saint
- **B. Toggle pills** — the 7 live rubric flags
- **C. Pick-from-list** — pre-Communion wording, "Blessed is the man," Cherubic Hymn

Covers **Tyler's overrides minus 2** (trilingual Trisagion and 4-verse antiphon — Bucket D, deferred; legacy overlay file remains mounted for these until v2).

---

## 2. Architecture (revised)

### 2.1 DB as source of truth, in-memory overlay injection

The original v1 design wrote materialized overlay files to a runtime dir. **That's gone.** Both architect reviews flagged it (Railway ephemeral FS, two-source-of-truth sync, no invalidation contract, write-path attack surface). Revised:

```
┌──────────────────────────────────────────────┐
│  SQLite parish_settings (+ side tables)      │
│  (source of truth)                            │
└──────────────────────────────────────────────┘
                  │
                  │  on request: build overlay map in memory
                  ▼
┌──────────────────────────────────────────────┐
│  overlay loader                              │
│  (existing) — accepts injected overlay map   │
│  for `parish:<id>` in addition to file dirs  │
└──────────────────────────────────────────────┘
                  │
                  ▼
        cascade engine (unchanged)
```

**What changes in code:**
- Overlay loader gains an in-memory overlay source — `loadOverlay(id)` checks an injected-map registry before falling back to file. Memoized by `parish_id + parish_settings.updated_at`.
- A `buildParishOverlay(parishId)` function takes the DB row + library + derivation templates and returns the same shape as a file-based overlay would. Pure function. Trivial to test.
- Existing cascade engine, drift detector, `/api/translations` untouched.

**Why this is better:**
- No filesystem writes outside boot. Closes Railway ephemeral-FS risk.
- No materializer sync state. The "two sources of truth" problem doesn't exist.
- Write-path attack surface shrinks to a SQLite write + an in-memory cache invalidate.
- Rollback is a DB rollback; no orphaned files.

**Cost:** ~20-30 lines in the overlay loader. The system architect's review explicitly endorsed this trade.

### 2.2 Schema (revised)

```sql
CREATE TABLE parish_settings (
  parish_id          TEXT PRIMARY KEY CHECK(parish_id GLOB '[a-z0-9-]*'),
  name               TEXT NOT NULL,
  city               TEXT,
  jurisdiction       TEXT NOT NULL,            -- 'oca', 'rocor', etc.
  extends_chain      TEXT NOT NULL,            -- explicit; e.g. ["sts-sluzhebnik","oca"]
  primate_name       TEXT,
  ruling_hierarch_name TEXT,

  -- Patron (stable natural key, not commemorationId)
  patron_natural_key TEXT,                     -- e.g. "12-04/john-of-damascus"
  patron_title       TEXT,                     -- display title; e.g. "Venerable John of Damascus"

  -- Rubrics: 7 known flags as typed columns
  rubric_confess_first              INTEGER NOT NULL DEFAULT 0,  -- bool
  rubric_omit_pre_trisagion_litany  INTEGER NOT NULL DEFAULT 0,
  rubric_include_lesser_saints      INTEGER NOT NULL DEFAULT 0,
  rubric_include_second_gospel      INTEGER NOT NULL DEFAULT 0,
  rubric_include_second_koinonikon  INTEGER NOT NULL DEFAULT 0,
  rubric_omit_catechumens_seasons   TEXT NOT NULL DEFAULT '',     -- comma-joined; empty = none
  rubric_paschal_communion_year_round INTEGER NOT NULL DEFAULT 0,
  rubrics_extra_json TEXT,                                        -- overflow only

  legacy_overlay_path TEXT,                                       -- for Tyler-style v2 carryover

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE parish_variant_picks (
  parish_id    TEXT NOT NULL,
  variant_key  TEXT NOT NULL,                  -- e.g. 'pre-communion-prayer'
  variant_id   TEXT NOT NULL,                  -- e.g. 'htm'; FK enforced at app layer
  PRIMARY KEY (parish_id, variant_key),
  FOREIGN KEY (parish_id) REFERENCES parish_settings(parish_id) ON DELETE CASCADE
);

CREATE TABLE parish_settings_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  parish_id    TEXT NOT NULL,
  changed_at   INTEGER NOT NULL,
  actor        TEXT,                            -- magic-link token id or 'admin'
  field        TEXT NOT NULL,                   -- column or variant_key
  old_value    TEXT,
  new_value    TEXT
);

CREATE TABLE _schema_migrations (
  filename     TEXT PRIMARY KEY,
  applied_at   INTEGER NOT NULL
);
```

**Schema rationale (from data architect review):**

- **`patron_natural_key`** (`"12-04/john-of-damascus"`) is stable across menaion rebuilds. Track B / Track E / the Synaxis-NA reassignment on 2026-06-13 are direct evidence that menaion `commemorations.id` is NOT stable. Resolve to current id at request time via a `resolvePatron(naturalKey) → { commemorationId, troparion, kontakion }` helper. Boot integrity check warns if any parish's natural key fails to resolve.
- **Typed rubric columns** — 7 known flags, all bool or short scalar. Closed set. Indexable. CHECK-constrainable. Supports "which parishes have `confessFirst` on?" queries trivially. `rubrics_extra_json` is escape hatch for future unmodelled flags only.
- **`parish_variant_picks` side table** — replaces JSON blob. Indexable, queryable ("who's on Tyler-1?"), and the variant library registry can be FK'd at app layer with deprecation/alias support.
- **`parish_settings_history`** — append-only diff log; trivially backups, satisfies audit need without git.
- **`extends_chain` explicit** — Tyler's chain is `base → sts-sluzhebnik → oca → tyler`, which is NOT derivable from `jurisdiction: "oca"` alone. Storing explicitly keeps drift detection honest.
- **`legacy_overlay_path`** — replaces the under-specified `pending_custom` field from v1. Honest about what's happening: the parish has Bucket D content still in a file overlay, mount it as a layer below the in-memory parish overlay.
- **`_schema_migrations`** — pairs with the new migration runner (§3 Phase 0).

### 2.3 Variant library — stability contract

`fixed-texts/variant-library/<key>.json`:

```json
{
  "key": "pre-communion-prayer",
  "_version": 1,
  "_contract": "Variant IDs are immutable. Renames require an alias entry. Removals are forbidden — use deprecated:true instead.",
  "variants": [
    { "id": "oca", "label": "OCA Service Book", "text": "..." },
    { "id": "htm", "label": "HTM Boston", "text": "...",
      "aliases": ["htm-boston"], "deprecated": false }
  ]
}
```

**Stability enforcement:**
- Loader builds a registry at boot: `{ key → { id-or-alias → variant } }`.
- Parish picks resolve through the registry; alias lookup is transparent.
- Contract test (`test/contracts/variant-library.test.js`): for every `parish_variant_picks` row in the seed DB (Tyler), referenced `variant_id` must resolve or test fails CI.
- Drift detector (existing) extended: walk library + check no parish references a missing non-aliased id.

### 2.4 Derived fields (now treated as data, not code)

V1 design said hierarch-commemoration keys are "auto-generated" via in-code templates. Data architect pushback: that's a code-deploy blocker for any parish that wants a slightly different commemoration form (e.g. Antiochian parishes commemorate differently).

**Revised:** derivation templates live in `fixed-texts/derivation-templates/`:

```
fixed-texts/derivation-templates/
  hierarch-commemoration-oca.json
  hierarch-commemoration-rocor.json
  hierarch-commemoration-antiochian.json
```

Each template declares: the overlay keys it generates, the form-field inputs it consumes, and the text template. Jurisdiction default picks the template. A future `parish_settings.derivation_overrides_json` column can let a parish substitute their own template (deferred — not in v1).

---

## 3. Phasing (revised — Phase 0 added)

| Phase | Work | Estimate |
|---|---|---|
| **Phase 0 (NEW — prerequisite)** | Migration runner + `_schema_migrations` table + variant-library stability contract + extend drift detector to parish overlays | ~2 days |
| **MVP (Phase 1)** | `parish_settings` table (rev'd schema), in-memory overlay injection in loader, settings page with 4 inputs + 1 toggle, magic-link auth, Tyler migration | ~1 week |
| **Phase 2** | Patron picker (typeahead, stable-key storage), rubric toggles (6 more), `parish_variant_picks` table, derivation-template data layer | ~3-4 days |
| **Phase 3** | Variant library extraction (3 keys × ~3-4 variants each, with stability contract) | ~1-2 weeks |
| **Phase 4** | Whole-service preview panel (in-memory overlay re-rendering, no draft files) | ~3-5 days |
| **Phase 5** | Onboard second parish manually; iterate | ongoing |
| **Phase 6 (v2)** | File upload + admin approval queue + promotion-to-library workflow | later |

**Why Phase 0 first:** the migration runner is a 50-line investment that's impossible to retrofit once live parish data exists. The stability contract is a similar one-shot prerequisite — adding it after Tyler has rows is much harder than before.

---

## 4. The settings UI

(Unchanged from v1 — see prior version §3 for ASCII mock. Page structure: Parish fields + Preview panel on top row, Rubrics + Library Picks below.)

Preview panel mechanics:
- Date + service picker drives preview content; default = next Sunday Liturgy
- On save (debounced): invalidate the parish's in-memory overlay cache → call `/api/<service>?date=…&translation=<parish_id>` → render
- No draft dir, no second materializer — the in-memory overlay loader takes the parish's *staged* DB row directly via a `?preview=true` request flag that reads from a `parish_settings_draft` table OR just-saved row
- Production-fidelity HTML matches `/api/liturgy` exactly
- Quick links: "Preview at Pascha," "Preview at Cheesefare Sat," "Preview at typical Sunday"

Patron picker:
- Typeahead against menaion `commemorations` table
- Display: "Venerable John of Damascus — December 4"
- On selection: compute natural key (`"12-04/john-of-damascus"`) and store; the int id is recomputed at request time
- Free-text fallback for non-menaion patrons → Bucket D (deferred)

---

## 5. Auth — manual invite v1

Unchanged from v1, with **two security-hardening additions from system architect review**:

1. `parish_id` constrained to `^[a-z0-9-]+$` at the DB layer (CHECK constraint above) — closes path-traversal in any future code path that uses it as a key.
2. Magic-link tokens: stored as SHA-256 hash (not plaintext) + 90-day expiry + per-parish rate limit (10 saves/min). Token table not yet in schema above; add in Phase 1.

For Tyler: hand-onboard, generate parish_id, seed DB row from existing overlay, hand over URL `/parish-admin/<parish_id>?token=<long-random-token>`.

Triggers to invest in real auth: 10+ parishes, role separation request, revocation needed.

---

## 6. Tyler migration

1. Read Tyler's current overlay files.
2. Extract → DB:
   - `name`, `city`, `jurisdiction`, `extends_chain` → `parish_settings`
   - `rubrics.temple` → `patron_natural_key` (compute from commemorationId 2471 → `"12-04/john-of-damascus"`) + `patron_title`
   - `rubrics.preCommunion.confessFirst` → `rubric_confess_first`
   - Cherubic active variant → `parish_variant_picks(tyler, 'cherubic-hymn', 'tyler-1')`
   - Pre-communion text matches HTM → `parish_variant_picks(tyler, 'pre-communion-prayer', 'htm')`
   - Vespers `blessedIsTheMan` matches HTM → `parish_variant_picks(tyler, 'blessed-is-the-man', 'htm')`
   - Hierarch names → `primate_name`, `ruling_hierarch_name`
3. Two Bucket D items: `typical-antiphon-1`, `trisagion` — leave in `fixed-texts/translations/st-john-damascus-tyler/` and set `legacy_overlay_path` to that dir. Overlay loader stacks legacy file UNDER the in-memory parish overlay.
4. **Automated diff harness** (system architect requirement): run `/api/liturgy?date=2026-06-21&translation=st-john-damascus-tyler` under old + new system, assert byte-identical. Block the Tyler cutover until green.

---

## 7. Rollback strategy (system architect R4)

Every schema migration in `storage/migrations/` ships as a pair: `NNN_forward.sql` + `NNN_rollback.sql`. The migration runner records applied filenames in `_schema_migrations` and can apply rollbacks in reverse order.

**Tyler safety net:** nightly cron exports Tyler's DB row + variant picks + history to a committed seed file (`seeds/tyler-snapshot.json`). If the DB is lost (rare) or rolled back through Tyler's row, the seed re-imports. This also satisfies the "git-backed auditability" intuition raised in the inventory's open questions — settings end up in git, just not as overlay JSON.

---

## 8. Write-path security checklist (system architect R5)

Before Phase 1 ships:
- [ ] `parish_id` regex CHECK constraint (already in §2.2 schema)
- [ ] Magic-link token hashed at rest, expiry enforced, rate limited
- [ ] Every settings-write endpoint validates `parish_id` from URL matches token's claim
- [ ] No filesystem writes on save (architecture removed them — verify no regressions)
- [ ] SQL writes use parameterized statements only
- [ ] CSRF protection on settings POSTs (single-token CSRF cookie pattern)
- [ ] Audit log captures actor + before/after for every write

---

## 9. Open items not in this doc

- **Route prefix:** `/parish-admin/<parish_id>` proposed. Pick before building.
- **Backup / export** — `/parish-admin/<id>/export` returns: DB row + variant picks + history + snapshot of currently-resolved library entries (system + data architects both want library state captured for portability). Format: zipped JSON.
- **Migration runner shape** — 50 lines, applies `storage/migrations/NNN_*.sql` files in order, records in `_schema_migrations`. Boot-time + CLI mode.
- **Variant library contract test location** — `test/contracts/variant-library.test.js`, runs in CI + pre-push.

---

## 13. Design system

The project already has an established visual language in `public/styles/main.css` (1100 lines) with `public/dashboard.html` (1235 lines) as the closest existing admin-UI precedent. **The settings page reuses this language; no new framework, no Storybook, no design debt.**

### Tokens (already in `:root`)

```
--bg #F5F0E8 (parchment)   --surface #FAF7F2 (card)   --text #1A1209 (sepia)
--rubric #8B1A1A (red)     --gold #C9A84C (accent)     --muted #6B6358
--border #DDD5C4
```

### Typography (already loaded)

- **Cinzel** (Roman inscriptional serif) — labels, headings, small-caps with .1–.18em letter-spacing
- **EB Garamond** (Renaissance book face) — body text + form values

### Reused patterns (from `dashboard.html`)

| Settings element | Pattern source |
|---|---|
| Header bar (cross + Cinzel title + back link) | `<header>` in dashboard.html |
| Page wrapper (max-w 1200, padding 28/32) | `.dashboard` → rename `.parish-admin` |
| Section headers (Parish info / Hierarchs / Rubrics) | `.stat-label` — Cinzel 10px tracked uppercase, `--muted` |
| Section cards | `.stat-card` — `--surface` bg, `--border` hairline, 16-18px padding |
| Hierarch derived-preview text | `.feast` — Garamond italic 13px, `--muted` |
| Save button + "View Liturgy" link | `.bar-btn` (primary variant gets `--rubric` border + text) |

### New patterns to add in Phase 1 (~50 lines of CSS, reusable forever)

1. **Form inputs** — `.field-input` / `.field-label` / `.field-help` / `.field-error`. Garamond 15-16px, `--surface` bg, 1px `--border`, focus → `--gold` ring, error → `--rubric` border.
2. **Toast** — `.toast` / `.toast-success` / `.toast-error`. Bottom-right, auto-dismiss 3s, gold/rubric left-border, `--surface` bg.
3. **Primary button variant** — `.bar-btn--primary`. Filled `--rubric` background, parchment text.

These three primitives carry through Phase 2 (jurisdiction picker, patron typeahead), Phase 3 (library picks), Phase 4 (preview panel).

### Responsive

`dashboard.html` already defines breakpoints at 1090 / 767 / 640px. Settings page inherits — single column at all sizes; mobile works by default.

### Accessibility baseline (from MVP day one)

- `<label for="…">` on every input
- Focus visible (`--gold` on inputs, `--rubric` on buttons)
- Form errors `aria-live="polite"`
- `<button>` not `<div onClick>`
- Save submittable via Enter
- `--muted` on `--surface` only at 14px+ (contrast AA)

### What this rules out

- Tailwind / Material / shadcn / Bootstrap — would clash with the parchment liturgical aesthetic and add toolchain weight for ~5 fields.
- Storybook — premature at 3 new components. Revisit at 15+.

---

## 10. Decision summary for review

1. **In-memory overlay injection** (vs. materialize-to-disk) — confirm OK?
2. **Stable patron natural key** (vs. opaque commemorationId) — confirm OK?
3. **Typed rubric columns + normalized variant picks** (vs. JSON blobs) — confirm OK?
4. **Phase 0 prerequisite** (migration runner + library stability) before Phase 1 MVP — confirm OK?
5. **MVP-first** (hierarchs + `confessFirst` for Tyler, ~1 week) vs. ship-the-whole-design-at-once. Lean: MVP.
6. **Tyler migration** with `legacy_overlay_path` for Bucket D carryover (clean-cutover Bucket A/B/C; Bucket D stays on file) — confirm OK?
