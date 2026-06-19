# Parish Self-Service — Inventory (Step 1 of design research)

**Status:** research-only. Do not implement from this doc yet — a design doc with storage/auth/MVP decisions comes next, after the user reviews this inventory.

**Anchor data point:** St. John of Damascus, Tyler, TX (the user's parish). It is by far the richest live parish overlay and the most realistic stress test for a self-service UI.

---

## 1. What "parish customization" actually means today

The overlay system has three kinds of override surface:

| Surface | Where it lives | Example | Self-service shape |
|---|---|---|---|
| **Text overrides** | `<overlay>/<service>-fixed.json`, sparse JSON keyed by dot-paths | Trisagion in 3 languages | Long-tail; needs a text editor + key picker |
| **Rubric toggles** | `manifest.json` → `rubrics: { ... }` | `omitCatechumensSeasons: ["paschal"]` | Toggle-shaped; cleanest UI fit |
| **Hierarch/temple data** | `manifest.rubrics.temple` + text overrides referencing `hierarch-commemoration.*` | Patron saint, Met. Tikhon, Abp. Alexander | Form fields (names, commemorationId picker) |

The cascade engine itself is mature (translation overlays + extends chain + drift detector). The self-service question is **which of those surfaces to expose, in what UI shape, and how to persist edits.**

---

## 2. Currently-consumed rubric flags (the toggle surface)

Grepped from `assemblers/`, `server-lib/`, `calendar/`. **Seven flags are live in code today:**

| Flag | Read by | What it does | Used by |
|---|---|---|---|
| `omitCatechumensSeasons` | rubrics validator + assembler | Skip catechumens litanies during named seasons | OCA jurisdiction (`["paschal"]`) |
| `omitPreTrisagionLitany` | liturgy assembler | Skip the "Lord save the pious…" expansion | (none currently set; reserved) |
| `preCommunion.confessFirst` | `assemblers/liturgy.js:233` | Sing "I believe, O Lord" *before* "In the fear of God" | **Tyler** |
| `temple.commemorationId` + `temple.title` | `server-lib/routes/api-liturgy.js:133` | Inject patron troparion + kontakion on Sundays | **Tyler** (id 2471 = John of Damascus) |
| `troparia.includeLesserSaints` | api-liturgy.js:88 | Don't suppress lesser-rank saint troparia | (none currently set) |
| `readings.includeSecondGospel` | api-liturgy.js:98 | Include the secondary Gospel reading | (none currently set) |
| `readings.includeSecondKoinonikon` | api-liturgy.js:107 | Include the secondary communion verse | (none currently set) |

**Observation:** the toggle surface is small and well-bounded. A v1 settings page covering just these seven flags + patron picker would deliver real value with low risk.

---

## 3. Tyler overlay — full inventory of text overrides

Tyler is the only parish overlay touching all four file types. Every override below is a real parish customization a settings UI would need to express.

### `manifest.json`
- `kind: "parish"`, `jurisdiction: "oca"`, `extends: ["oca"]` (cascade resolves base → sts-sluzhebnik → oca → Tyler)
- `rubrics.temple.commemorationId: 2471` + `title: "Venerable John of Damascus"` — patron-of-temple
- `rubrics.preCommunion.confessFirst: true` — Communion Prayer before "draw near"

### `liturgy-fixed.json` (8 override blocks)
| Key | What | UI shape |
|---|---|---|
| `typical-antiphon-1` | 4-verse short form of Psalm 102 (parish omits 6 of 10 verses) | Verse-array editor — **hard**, needs musical context |
| `anaphora-chrysostom.commemoration-hierarchs` | Metropolitan + Archbishop names | **Form fields: primate, ruling hierarch** |
| `anaphora-basil.commemoration-hierarchs` (+ `…-response`) | Same hierarchs, Basil's Liturgy | Auto-mirrored from Chrysostom names |
| `trisagion` (text + repetitions + variants[] + glory + final) | English / Slavonic / Greek trilingual rendering | **Multilingual variants editor** |
| `pre-communion.prayer-chrysostom` | HTM-family wording | **Pick-from-list** (3-4 canonical wordings) |
| `communion-of-faithful.body-of-christ` + `…-paschal` | Year-round "Receive ye the Body…" | Toggle: paschal-form-always |
| `hierarch-commemoration.greatLitany` + `.augmentedLitany` | Litany petitions naming hierarchs | Derived from hierarch fields above |
| `cherubic-hymn` (active) + `_cherubic-hymn-variants` (archive) | Tyler-1 setting active; Slavonic-calque archived | **Pick-from-list + custom-upload escape hatch** |

### `vespers-fixed.json`
| Key | What | UI shape |
|---|---|---|
| `hierarch-commemoration.greatLitany` / `.augmentedLitany` / `.litya` | Same hierarchs as Liturgy, Vespers litanies | Auto-mirrored |
| `kathisma.blessedIsTheMan` | HTM Psalter wording of "Blessed is the man" — 6 verses + refrain + Glory/Now | **Pick-from-list** (OCA / HTM / Jordanville) |

### `typika-fixed.json`
Empty (v0 stub). Inherits everything.

---

## 4. Other overlays — what the rest of the field looks like

Cataloged across 14 overlay dirs. **Tyler is an outlier in richness** — most jurisdiction overlays are stubs that exist just to set defaults for picker pills.

| Overlay | Kind | Key surface |
|---|---|---|
| `sts-sluzhebnik` | tradition | Beatitudes, Lord's Prayer, "It is truly meet", Anaphora (Chrysostom+Basil), Presanctified, Kneeling Vespers — the actual OCA-tradition text bedrock |
| `oca` | jurisdiction | Creed, Beatitudes, antiphons 1+2, `omitCatechumensSeasons: ["paschal"]` |
| `jordanville` | tradition | Creed, Lord's Prayer, pre-communion, beatitudes, antiphons, vespers kathisma |
| `htm-boston` | tradition | Vespers kathisma only |
| `rocor` | jurisdiction | empty — extends jordanville |
| `antiochian`, `antiochian-aocana`, `serbian`, `georgian`, `oca-modern`, `oca-tt`, `hapgood`, `julian` | mostly stubs | empty or near-empty; chain-anchors for `extends` |

So out of ~14 overlay dirs, **only ~4 carry meaningful content** (sts-sluzhebnik, oca, jordanville, htm-boston), plus **one rich parish overlay** (Tyler). This is encouraging for self-service: the catalog of "things parishes actually change" is much smaller than the file count suggests.

---

## 5. The categorization that matters for UI design

Mapping the Tyler overrides into UI-shape buckets:

### Bucket A — **Form fields** (easy, ship first)
- Parish name + city + jurisdiction (manifest)
- Primate name (e.g. "Tikhon, Archbishop of Washington, Metropolitan of All America and Canada")
- Ruling hierarch name (e.g. "Alexander, Archbishop of Dallas and the South")
- Patron saint — picker against menaion DB (`commemorationId`) + free-text `title`

Once these four fields are captured, the system can auto-derive:
- `anaphora-chrysostom.commemoration-hierarchs`
- `anaphora-basil.commemoration-hierarchs` (+ response)
- `hierarch-commemoration.greatLitany` / `.augmentedLitany` / `.litya`
- Patron troparion + kontakion injection (already automatic via `rubrics.temple`)

**That's 7 of Tyler's 10 override blocks from 4 form fields.** Strong v1 ROI.

### Bucket B — **Toggle pills** (easy, ship with A)
- `confessFirst` (Communion order)
- `omitCatechumensSeasons` (multi-select against season list)
- `includeLesserSaints`, `includeSecondGospel`, `includeSecondKoinonikon`
- "Year-round paschal Communion hymn" (yes/no)

### Bucket C — **Pick-from-list** (medium; needs a curated library)
- Pre-Communion Prayer wording: OCA / HTM / Sluzhebnik / Jordanville (4 known variants)
- "Blessed is the Man" wording: OCA / HTM-Boston / Jordanville (3 known variants)
- Cherubic Hymn setting: catalog needed (Tyler-1, Slavonic-calque, Tchaikovsky, L'vovsky exist somewhere)

Implementation: the library lives in a new `fixed-texts/parish-variants/<key>/<variant-id>.json` index. Parish picks → overlay materializes the chosen text.

### Bucket D — **Custom text editor** (hard; defer or hide)
- Antiphon verse-array (Tyler's 4-verse Psalm 102 short form)
- Trisagion variants (multilingual)
- Custom hymns the parish brought from elsewhere

These need a JSON-aware editor, a preview pane, and a "this might break the service" guardrail. **Strong recommendation: defer to v2.** Tyler is the only data point that needs them, and they were authored by a developer with full context.

---

## 6. Structural hard problems to flag for the design doc

1. **Patron-of-temple is date-keyed.** `commemorationId` 2471 means "John of Damascus" — but the assembler only injects on Sundays, and intersects with cocelebrated overlays + great feasts. The form field is simple; the *logic* behind it has 5 invariants already in `features/patron-of-temple.md`. UI must not promise "your patron always shows up."
2. **The `extends` chain is data, not UI.** Tyler is `extends: ["oca"]`, but a parish admin shouldn't know what "extends" means. UI should ask "Which jurisdiction?" → emit the right `extends` value.
3. **Cherubic Hymn archive pattern** (`_cherubic-hymn-variants`) is bespoke — a parish-side rotation mechanism the cascade strips. Self-service should formalize this as a generic "variant library + active pointer" so it's not a one-off.
4. **Two override blocks are auto-derivable but currently hand-written** (`anaphora-basil` mirrors Chrysostom; vespers hierarch-commemoration mirrors liturgy). A self-service generator should *always* derive these, never let the admin enter them twice.
5. **Drift warnings are noisy.** Tyler's manifest documents "drift warnings are expected and informational" for the Basil keys. Self-service must either fix the base (preferred) or suppress these warnings for derived overrides.

---

## 7. What I'd take into the design doc next

If you sign off on this inventory, the design doc would cover:

1. **Scope:** Buckets A + B + C for v1; D deferred. Targets ~80% of Tyler's overrides with 4 form fields + 6 toggles + 3 pick-from-lists.
2. **Storage:** file-based vs DB-backed vs hybrid — likely hybrid (DB for parish records, file generation for content).
3. **Auth:** parish-claim flow + magic link (lightest viable).
4. **Migration:** how the existing Tyler overlay round-trips into the new schema without losing any of its current overrides.
5. **MVP cut:** smallest shippable slice — probably "claim a parish, set hierarch names + patron, pick a Cherubic Hymn from the library."

---

## 8. Open questions for the user

- **Is Tyler's level of customization typical, or is Tyler an outlier?** This drives whether Bucket D (custom editor) is a launch blocker or a v3 feature.
- **Do you want jurisdiction admins (e.g. Diocese of the South) to set defaults that parishes inherit?** That's a third tier in the cascade and changes the data model.
- **Is "git-backed" a hard requirement?** Today every parish customization is in git. DB-backed parish records break this property — worth keeping if it matters for auditability.
- **Patron-saint picker UX:** menaion DB has ~3000 commemorations. Searchable typeahead, or filter by date-of-feast?
