# `variable-sources/translations/<stackId>/`

Per-stack overlays for files under `variable-sources/`, resolved by
`server-lib/sources/variable-source-overlay.js`. An overlay is **sparse**: it
names only the keys it changes and is deep-merged onto the base file, and the
stack's `extends` chain is walked parents-first so a child wins.

The path under `<stackId>/` mirrors the base file's path relative to
`variable-sources/` — so `variable-sources/menaion/november-01.json` is
overridden at `variable-sources/translations/<stackId>/menaion/november-01.json`.

A directory whose name begins `_` is a test fixture, not a selectable
translation (same convention as `fixed-texts/translations/`).

**Arrays replace wholesale.** `deepMergeOverlay` does not merge array elements,
so an overlay naming `troparia` substitutes the entire list. Diff a proposed
array against what the base already renders before authoring it — a cue-sheet
transcription once deleted Ps 102:3-21 this way.
