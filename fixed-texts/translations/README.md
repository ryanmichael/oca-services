# Translation Overlays

Sparse overlays that override the canonical fixed-text files (`liturgy-fixed.json`, eventually `presanctified-fixed.json`, `vespers-fixed.json`, …). Selected per request via `?translation=<id>` or set globally via the `LITURGY_TRANSLATION` env var. Listed by the front-end via `GET /api/translations`.

## Folder layout

```
fixed-texts/translations/<id>/
  manifest.json          # required — describes the overlay
  liturgy-fixed.json     # optional — sparse overrides for the Divine Liturgy
  presanctified-fixed.json   # (future) sparse overrides for Presanctified
  …
```

Anything inside `fixed-texts/translations/<id>/` whose name starts with `_` is treated as hidden (editor scratch files, backups). Use this convention for in-progress work you don't want to ship.

## manifest.json schema

```jsonc
{
  "name":         "Display name shown in the picker",
  "kind":         "tradition" | "parish" | "jurisdiction",
  "jurisdiction": "oca" | "rocor" | "antiochian" | "goa" | "serbian"
                  | "romanian" | "bulgarian" | "georgian" | null,
  "extends":      ["other-overlay-id", ...],
  "description":  "One-line summary (optional)",
  "sources":      "Provenance — book, edition, URL (optional)"
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Human-readable label shown in the settings picker. |
| `kind` | yes | `tradition` for cross-jurisdictional translation lineages (HTM-Boston, Hapgood). `parish` for local customizations. `jurisdiction` for jurisdiction-wide curated default stacks (OCA, ROCOR, Antiochian) — selectable via the picker pill, typically empty `liturgy-fixed.json` plus an `extends` chain pointing at the canonical tradition. |
| `jurisdiction` | no | Filters the picker. Use `null` for cross-jurisdictional overlays. |
| `extends` | no | Parent overlay ids (applied parent-first, then this overlay). Use `[]` (or omit) to layer only over the base file. |
| `description` | no | Plain prose. Shown in the picker meta line. |
| `sources` | no | Where the text came from. Helps future you. |

Schema is checked at server startup and per `/api/translations` request — see the `warnings` array in the response.

## How the cascade works

Given `extends: ["A", "B"]`, the loader walks **parents first, depth-first**:

```
base liturgy-fixed.json
  → apply A's overrides
  → apply B's overrides
  → apply this overlay's overrides
```

If A itself extends X, the order becomes `base → X → A → B → self`. Each layer is deep-merged onto the result; only the keys present in a given layer change.

Cycle detection logs a warning and skips the cyclic edge; the server keeps running. Unknown keys (overlay keys that don't correspond to any key in the base file) also log a warning — useful for catching typos when a base file is restructured.

## Sparse override convention

Include **only the keys that differ** from the layer above. Everything else is inherited. Even within nested objects, only the leaves you want to change need to appear:

```jsonc
// Override only verses[1] of the Beatitudes; rest of the array (and the rest
// of the liturgy) is inherited from the parent.
{
  "beatitudes": {
    "verses": [
      "In Thy Kingdom, remember us, O Lord, when Thou comest in Thy Kingdom.",
      "Blessed are the poor in spirit, for theirs is the Kingdom of Heaven.",
      "Blessed are those who mourn, for they shall be comforted.",
      "...continue with the full array — arrays are replaced wholesale, not merged element-by-element."
    ]
  }
}
```

**Arrays are replaced, not merged.** If you need to override one element of an array, include the whole array. (Future enhancement: per-index array overrides if it becomes painful.)

**Keys starting with `_` are stripped at merge time.** Use `_note`, `_source`, etc. for inline metadata that documents your overlay without polluting the merged output.

## Examples

### Tradition overlay (cross-jurisdictional)

```jsonc
// fixed-texts/translations/htm-boston/manifest.json
{
  "name": "Holy Transfiguration Monastery, Boston",
  "kind": "tradition",
  "jurisdiction": null,
  "extends": [],
  "description": "Literal-Greek translation tradition — 'Kingdom of the Heavens', 'they that…', 'shall be sated'.",
  "sources": "HTM service books"
}
```

### Jurisdiction overlay (curated default stack)

```jsonc
// fixed-texts/translations/oca/manifest.json
{
  "name": "OCA (default)",
  "kind": "jurisdiction",
  "jurisdiction": "oca",
  "style": "new",
  "extends": ["sts-sluzhebnik"],
  "description": "OCA — curated default stack."
}
```

### Parish overlay extending a jurisdiction

Prefer extending the jurisdiction-kind overlay (not the tradition directly) so the parish inherits jurisdiction-wide defaults like `style` and any future jurisdiction-level rubrics. Cascade order resolves to `base → sts-sluzhebnik → oca → parish`.

```jsonc
// fixed-texts/translations/st-john-damascus-tyler/manifest.json
{
  "name": "St. John of Damascus, Tyler, TX",
  "kind": "parish",
  "jurisdiction": "oca",
  "extends": ["oca"],
  "description": "Local customizations layered through the OCA jurisdiction default.",
  "sources": "Parish service book"
}
```

## Adding a new overlay

1. Create `fixed-texts/translations/<id>/`.
2. Write `manifest.json`. Run the server — startup validation logs any errors.
3. Add `liturgy-fixed.json` with only the keys you're overriding.
4. Restart the server (or just hit `/api/translations` — manifests are read on every list).
5. Pick it from Settings → Service Text Version, or test via `curl '/api/liturgy?date=…&translation=<id>'`.

## Testing your overlay

- `npm test` exercises the cascade end-to-end, including cycle and drift detection.
- `curl /api/translations` shows the merged manifest list plus any per-overlay warnings.
- Drift warnings (unknown overlay keys) appear in the server log. Treat them as typos until proven otherwise.
