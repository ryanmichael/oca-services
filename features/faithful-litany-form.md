# Feature: faithful2Long (2nd Litany of the Faithful form)

**Status:** shipped (this commit)
**Contract test:** `test/contracts/faithful-litany-form.test.js`
**DB column:** `parish_settings.rubric_faithful_litany_2_long` (INTEGER 0/1, default 0)

## Purpose

The 2nd Litany of the Faithful at the Divine Liturgy exists in two well-attested forms:

- **Short form (OCA Sluzhebnik, St Tikhon's Press 2010):** opening ("Again and again in peace, let us pray to the Lord") → "Help us, save us…" → "Wisdom!" → priest's exclamation.
- **Long form (older Russian-tradition Liturgika):** opening → **four great-litany-style petitions** ("For the peace from above…" / "…the peace of the whole world…" / "…this holy temple…" / "…deliverance from all tribulation…") → "Help us, save us…" → "Wisdom!" → priest's exclamation.

The four extra petitions in the long form are identical to the corresponding ones in the Great Litany at the start of the service, so they audibly "repeat." Tyler parish observed the short form 2026-06-21; the default ships as short to match Sluzhebnik. The long form remains available via parish opt-in.

## Interface

**DB / admin form:** boolean rubric flag `rubric_faithful_litany_2_long` on `parish_settings`. Surfaced as a checkbox in the parish-admin form ("2nd Litany of the Faithful — long form").

**Runtime rubrics object** (built by `server-lib/parishes/index.js > buildRubrics`):

```json
{ "litanies": { "faithful2Long": true } }
```

Default false → Sluzhebnik short form. No query-param override.

## Behavior table

| Flag | 2nd Litany of the Faithful rendered blocks |
|---|---|
| absent / 0 | `lf2-opening` → `lf2-response` → `lf2-petition` → `lf2-pet-resp` → `lf2-wisdom` → `lf2-excl` → `lf2-amen` |
| 1 | `lf2-opening` → `lf2-response` → `lf2-p0..p3` (+ response each) → `lf2-petition` → `lf2-pet-resp` → `lf2-wisdom` → `lf2-excl` → `lf2-amen` |

The 1st Litany of the Faithful is unaffected (always short).

## Code surface

- `assemblers/liturgy.js:160` — passes `opts` into `_litLitaniesFaithful`.
- `assemblers/liturgy-parts/litanies.js:76` — `_litLitaniesFaithful(f, opts = {})` derives `const longForm = opts.rubrics?.litanies?.faithful2Long === true`; conditional `petitions[]` rendering.
- `fixed-texts/liturgy-fixed.json#litany-faithful-2.petitions` — long-form petition text (always present in data; only rendered when flag is set).
- `server-lib/parishes/index.js > buildRubrics` — maps DB column → `rubrics.litanies.faithful2Long`.
- `server-lib/routes/parish-admin.js` — column in `WRITABLE_FIELDS`, `BOOL_FIELDS`, response projection.
- `public/parish-admin.html` + `public/scripts/parish-admin.js` — checkbox + snapshot/load/save plumbing.
- `storage/migrations/006_parish_rubric_faithful_litany_2_long.sql` — schema.

## Invariants (tested)

- **INV-1** — Default (no overlay rubric): 2nd Litany of the Faithful contains **no** `lf2-p*` petition blocks; deacon goes from opening directly to `lf2-petition` ("Help us, save us…").
- **INV-2** — `faithful2Long: true` (long-form rubric): 2nd Litany contains exactly 4 `lf2-p0..p3` petition blocks between opening and `lf2-petition`, each with a `Lord, have mercy.` response.
- **INV-3** — 1st Litany of the Faithful is unaffected by the flag: same blocks rendered regardless (`lf1-opening` → `lf1-response` → `lf1-petition` → `lf1-pet-resp` → `lf1-wisdom` → `lf1-excl` → `lf1-amen`).
