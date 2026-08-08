# Practice Library — Stability Contract

Named **shape** presets a parish picks from — which units of a canonical text
are actually sung. The sibling of `fixed-texts/variant-library/`, which governs
*what the words are*.

Parishes store references as `(practice_key, preset_id)` in `parish_practice_picks`.
**Those references must remain resolvable for as long as the parish row exists.**
The four rules below are identical in force to the variant library's.

## Why this is separate from the variant library

A variant supplies a **value** that replaces whatever is at `_target.path`.
A preset supplies an **operation** applied to the canonical value at that path.

They are not interchangeable, and conflating them would break the property the
practice layer exists for: a selection can never delete canon. See
`features/practice-layer.md`.

## File shape

```json
{
  "key": "typical-antiphon-1",
  "_version": 1,
  "_label": "First Antiphon (Ps 102) — verses sung",
  "_target": { "service": "liturgy", "path": "typical-antiphon-1.verses" },
  "presets": [
    { "id": "full", "label": "Full — every verse (default)" },
    { "id": "krasnostovsky-abridged",
      "label": "Abridged — Krasnostovsky choir books (Diocese of the South)",
      "op": "select", "units": "stichoi",
      "keep": ["1.1", "1.2"], "reprise": ["1.1"],
      "fingerprint": "1b43a6ce",
      "_provenance": { "...": "..." } }
  ]
}
```

Required per preset: `id`, `label`. A preset with **no `op`** is a deliberate
no-op — it exists so a parish can state "we sing it all" explicitly rather than
leaving the field blank. Everything else is passed to the practice engine as an
entry; see `server-lib/practice/index.js` for the supported ops (currently
`select` only).

`_label` on the file is the settings-page field label. Without it the UI falls
back to the key, which is not something to show a choir director.

## ID naming convention

Preset IDs are **source-semantic**, not parish-attributed — the same rule as the
variant library. The library is a catalog of *performing practices*, not of
*who asked for what*; the pick table already records the parish.

Good: `full`, `krasnostovsky-abridged`, `jordanville-short`.
Bad: `tyler-cut`, `st-johns-antiphon`.

Name by the printed edition or the practice's distinctive character, and record
the parish that contributed it in `_provenance`.

## The four rules

### 1. IDs are immutable
Once shipped, a `presets[].id` cannot be renamed in place. To rename, add the
new id with `"aliases": ["<old>"]` and remove the original in the same PR.

### 2. IDs cannot be removed
Removing an id referenced by a parish row silently reverts that parish to the
canonical full text with no error. Mark `"deprecated": true` instead — the
loader still resolves it; the settings UI hides it from new parishes.

### 3. IDs and aliases share one namespace per file
The loader builds one flat `{ id-or-alias → preset }` map per key and throws on
collision at load.

### 4. The fingerprint is part of the contract
Every preset carrying addresses must carry a `fingerprint` of the canonical
array it was derived from. `npm run drift:check` fails when it stops matching,
because that is the moment a human must re-read the selection against the parish
source. **Never re-point an address to make a check pass** — re-derive it from
the source, then update the fingerprint.

## Promotion path

A parish practice starts life as a bespoke inline entry in
`parish_settings.rubrics_extra_json.practice[]` (authored by us, with
provenance). **The moment a second parish wants the same thing, promote it to a
preset here** and repoint both parishes at it. That keeps the fingerprint in one
place instead of copied per parish, and is the mechanism that stops bespoke
entries accumulating.

An inline entry always overrides a preset for the same target, so a parish can
deviate from a preset it otherwise matches without forking it.
