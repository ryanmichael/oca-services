# Schemas

JSON Schema (draft 2020-12) definitions for the three data layers:

1. **L1** — `service-structure/*.json` (ordered service skeletons)
2. **L2** — `fixed-texts/*.json` + `fixed-texts/translations/<id>/{manifest,*-fixed}.json`
3. **L3** — `variable-sources/**/*.json` (menaion, calendar, feast-canons, octoechos, triodion, festal-matins, plus ~12 top-level singletons)

`_defs.schema.json` is the locked vocabulary (Tone, Speaker, Troparion, Kontakion, Hymn, Prokeimenon, Alleluia, CanonOde, ServiceBlock, StructureBlock, ...). Per-file schemas `$ref` into it.

`registry.js` maps repo-relative file paths to schemas. `index.js` exposes `validate(relPath, content)`.

## Running

```bash
npm run validate            # full sweep, all layers
node scripts/validate-schemas.js --max=20
node scripts/validate-schemas.js --quiet
```

Boot-time (`server-lib/boot/load-fixed.js`) runs the sweep on startup. Dev: fail-loud. Prod (`NODE_ENV=production`): warn-only — pre-push + CI already gate this; downtime is worse than a logged warning. Sentry alerts on the warning once Track C lands.

Pre-push hook runs `npm test`, which runs `npm run validate` first.
GitHub Actions has a dedicated `Schema validation` step before smoke tests.

## v1 posture: permissive

Schemas v1 only require fields the existing hand-rolled validators already required, plus `_meta` where it's universally present. Tightening happens iteratively in v1.1 (~30 days from 2026-06-19) once we see what surfaces in real authoring.

Two atoms remain **open enums** to avoid lock-in: `SaintCategory` and `FeastRank`. They are documented with `examples` instead of `enum`. New values surface naturally over years.

`Tone` accepts `integer 0-8 | null`. Both forms exist in the corpus.

## Coexistence with `data-validators.js`

Both run; both are gates. They cover different concerns:

| Concern | Schemas | `data-validators.js` |
|---|---|---|
| Shape, type, presence, format | ✓ | partial |
| Cross-file reference (via `$ref` into `_defs`) | ✓ | — |
| Semantic business rules (e.g., "great-feast-variants entries require both troparion and tone"; menaion canon-ode strict shape requirements; afterfeast-flagged odes have different rules) | — | ✓ |
| Per-file API used by boot (`validateMenaionFeast`, `validateAllMenaionFeasts`, etc.) | — | ✓ |

Don't migrate one into the other. New shape rules go into schemas; new semantic rules go into `data-validators.js`.

## Adding a new file type

1. Author the schema under `schemas/<layer>/<thing>.schema.json` with `$id` matching the canonical URL pattern.
2. Add a path-pattern rule to `registry.js` mapping repo-relative paths to the new schema.
3. Run `npm run validate` to confirm no existing files break.
4. If you also need semantic rules, add a validator function to `data-validators.js` and call it from the same boot step that loads the file.

## Adding a `$ref` between schemas

Use the absolute `$id` URL form, e.g.:

```json
{ "$ref": "https://oca-services.local/schemas/_defs.schema.json#/$defs/Troparion" }
```

The validator (`schemas/index.js`) also accepts relative `$ref` paths and rewrites them transparently, but the absolute form is preferred for clarity.
