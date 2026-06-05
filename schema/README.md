# Schema — the public data contract

JSON Schema (draft 2020-12) definitions for the project's core data shapes. The intent is to make Orthodox Daily Services the **de facto data layer for Orthodox liturgy in English** (`ASSESSMENT.md` §7), and that starts with publishing the contract.

## What's here

| File | What it describes |
|---|---|
| [`service-block.schema.json`](./service-block.schema.json) | The `ServiceBlock` output shape produced by `assembler.js` and consumed by the renderer and `/api/*` clients |
| [`calendar-entry.schema.json`](./calendar-entry.schema.json) | The per-date "conductor" object that drives the assembler (`variable-sources/calendar/YYYY-MM-DD.json` or runtime-generated) |
| [`overlay-manifest.schema.json`](./overlay-manifest.schema.json) | The translation / parish / jurisdiction overlay manifest (`fixed-texts/translations/<id>/manifest.json`) |

Each schema declares `$id` as a stable GitHub-raw URL so external tooling can `$ref` it from anywhere.

## Status

**These schemas are documentation contracts, not yet runtime-enforced via `ajv` or similar.** Runtime validation today lives in:

- [`server.js`](../server.js) — `validateManifest()` validates overlay manifests at boot and per `/api/translations` request
- [`data-validators.js`](../data-validators.js) — boot-time validators for shipped data files (`great-feast-variants.json`, `pentecostarion-sunday-overrides.json`, etc.)

The hand-written validators are the source of truth for *runtime behavior*; these schemas are the source of truth for *the contract documentation*. When the two disagree, the runtime validator wins, and the schema should be updated to match. A future PR may collapse the two by adopting an `ajv`-based path — see "Future work" below.

## How to use these schemas externally

```bash
# Validate a calendar entry with ajv (Node):
npx ajv-cli validate \
  -s schema/calendar-entry.schema.json \
  -d variable-sources/calendar/2026-03-07.json

# Or in your editor: most modern editors auto-validate JSON files against
# a schema referenced by $schema in the file itself, e.g.:
#   { "$schema": "https://raw.githubusercontent.com/ryanmichael/oca-services/main/schema/overlay-manifest.schema.json", … }
```

The `$id` on each schema is the stable identifier — the URL it points at is the canonical fetch location today but may move to a custom domain later.

## Strictness conventions

- **`overlay-manifest.schema.json`** is **strict** (`additionalProperties: false` at the top level, enums match `server.js`). Misspelled keys are rejected; the runtime validator does the same.
- **`service-block.schema.json`** is **permissive** on extras (`additionalProperties: true`). Five fields are required (`id, section, type, speaker, text`); the well-known optionals (`tone, source, label, _overlay, _source`) are documented; other extras are allowed because `assembler.js#makeBlock` accepts open-ended extras.
- **`calendar-entry.schema.json`** is **strict at the top level** but **loose on the per-service sub-objects** (`vespers`, `matins`, `liturgy`). The internal structure of those is service-specific, still evolving, and would be premature to lock down in v1. Tightening them is on the roadmap.

## Versioning

No version number on the schema URLs today. When a breaking change is needed, the convention will be to add a `v2/` directory (`schema/v2/service-block.schema.json`) and freeze the v1 file. Until then, the current files are the contract.

Backwards-compatible additions (new optional properties, new enum values that don't remove old ones) do **not** require a version bump.

## Contributing a schema change

1. If you're tightening or relaxing an existing shape, update both the schema **and** the corresponding runtime validator (`server.js#validateManifest` or `data-validators.js`) in the same PR. Drift between the two erodes the contract.
2. Add a real example to the schema's `examples` array. CI's smoke tests should cover the new shape.
3. If introducing a new schema, also update this README and the root `README.md` Contributing section.

## Future work

- **`ajv` adoption**: replace `validateManifest` + `data-validators.js` ad-hoc validators with `ajv`-driven validation that loads the schemas directly. Trade-off: adds a single npm dependency (`ajv`) to a project that currently has one (`@anthropic-ai/sdk`). Deferred until the schema set is stable and the cost feels lower than the duplication.
- **Per-service sub-schemas** for `vespers`, `matins`, `liturgy` inside `CalendarEntry`. Will likely become `schema/vespers-spec.schema.json`, `schema/matins-spec.schema.json`, etc., `$ref`'d from the parent.
- **`FixedText` schemas**: separate schemas per service file (`vespers-fixed`, `matins-fixed`, `liturgy-fixed`) describing the canonical key paths. Useful for editor autocomplete in overlay JSON files.
- **Old-Style calendar additions**: when the `style: 'new' | 'old'` axis lands (ROADMAP.md Weeks 4–7), `calendar-entry.schema.json` will pick up an optional `style` field and `julianDate` becomes required for `style: 'old'`.
