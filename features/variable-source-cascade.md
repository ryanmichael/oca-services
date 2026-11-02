# Feature: per-stack cascade for `variable-sources/`

**Status:** shipped (this commit)
**Contract test:** `test/contracts/variable-source-cascade.test.js`
**Module:** `server-lib/sources/variable-source-overlay.js`

## Purpose

The translation-overlay cascade in `server-lib/overlays/` resolves
`fixed-texts/translations/<id>/<service>-fixed.json` and nothing else.
Everything under `variable-sources/` — Octoechos, Menaion, Triodion,
feast-canons, prokeimena — was invisible to it, so selecting a translation
could not change any of it. A parish got the shared default, and the only ways
to change a word were to edit the base for every jurisdiction or to fork the
file.

This feature gives `variable-sources/` the same sparse, extends-aware cascade
the fixed texts already had.

### The defect that forced it

At Liturgy on **2026-11-01** (Unmercenaries Cosmas and Damian, Tone 5) the
reader's portions of the Third Antiphon were heard to be in the wrong English.
They were. The section's ten troparia were:

| Half | File | Provenance | Family |
|---|---|---|---|
| 6 Resurrection | `variable-sources/octoechos.json` | `source: htm-octoechos-sunday-beatitudes` (saintjonah.org) | `htm` |
| 4 Unmercenaries | `variable-sources/menaion/november-01.json` | `_source: St-Sergius Emenaion 11-01.pdf` | `stsergius` |

Neither is OCA, and they are not each other. Meanwhile the choir's Beatitude
*verses*, which come from `fixed-texts/`, **did** follow the parish cascade and
rendered in Tyler's `dmitri-royster` wording. So the reader was the one voice in
the section that no translation selection could reach. Rendering the same date
under five translations returned byte-identical troparia every time
(`sha=c20eb2f7a8`) — proof the cascade could not touch them.

### What this does and does not fix

It makes those troparia **selectable**. It does **not** change what 2026-11-01
renders today, because there is no OCA text to select: OCA does not publish the
Beatitudes troparia at all (`project_beatitudes_oca_gap`, and the `troparia`
table holds no Beatitudes rows). The audible defect is now a sourcing task with
a working delivery path, and `L45-antiphon-translation-family` reports it until
then. See `features/antiphon-translation-family.md`.

## Interface

Overlay files live at:

```
variable-sources/translations/<stackId>/<path-relative-to-variable-sources>
```

so `variable-sources/menaion/november-01.json` is overridden at
`variable-sources/translations/<stackId>/menaion/november-01.json`.

```js
const { loadVariableSourceJSON } = require('./variable-source-overlay');
loadVariableSourceJSON('menaion/november-01.json', 'st-john-damascus-tyler');
```

Semantics match the fixed-text cascade exactly:

- an overlay is **sparse** — it names only the keys it changes and is
  deep-merged onto the base, so `matins.canon.ode3.troparia` can be replaced
  without restating the file;
- the stack's `extends` chain is walked **parents first**, so a child wins;
- keys beginning `_` are overlay-only metadata and are stripped on merge;
- a missing overlay is normal and silent; a missing **base** returns `null`.

A directory whose name begins `_` is a test fixture, not a selectable
translation (same convention as `fixed-texts/translations/`).

## Behavior table

| Stack | Overlay present for the file | Result |
|---|---|---|
| `null` / absent | — | base file, unchanged |
| any id | no | base file, unchanged |
| `X` | `translations/X/<rel>` | base deep-merged with X |
| `X extends [P]` | both `P` and `X` | base ← P ← X (X wins) |
| `X extends [P]` | `P` only | base ← P |
| any | base file missing | `null`, caller warns in its own terms |

## Code surface

- `server-lib/sources/variable-source-overlay.js` — `loadVariableSourceJSON`,
  `listOverlaysFor`, `invalidateVariableSourceOverlay`. Per-`(relPath, stack)`
  merge cache.
- `server-lib/sources/beatitudes.js` — `loadBlendParts(parts, stack)` and
  `loadFeastBeatitudesOverride(dateStr, fname, stack)` now read through the
  cascade instead of `fs.readFileSync`. `toVariableSourceRel()` maps a
  repo-relative `part.file` to a cascade-relative path; a path outside
  `variable-sources/` is read directly and is not overridable.
  `buildBeatitudesTroparia(..., stack)` threads it.
- `server-lib/sources/liturgy-from-orthocal.js` — `opts.stack`, documented with
  the other named opts; passed at the single `buildBeatitudesTroparia` call.
- `server-lib/routes/api-liturgy.js`, `api-typika.js` — pass
  `stack: translation || null`.
- `server-lib/sources/load.js` — Octoechos overlays are now **discovered** by
  globbing `variable-sources/octoechos-*.json` rather than enumerated in a
  hardcoded `['myrrhbearers']` list.
- `variable-sources/translations/README.md` — the authoring rules.

### Not yet routed

`api-pascha-collection.js` resolves no translation and passes bare `sources`;
it yields base text, which is its current behaviour. `sources.prokeimena` is
read from the boot singleton, so the Saturday Vespers Prokeimenon refrain named
in `project_overlay_variable_sources_gap` still needs its read site moved onto
`loadVariableSourceJSON` before an overlay there will take effect. The loader
is generic and ready for it.

## Invariants (tested)

- **INV-1** — With no stack, `loadVariableSourceJSON` returns the base file's
  content unchanged.
- **INV-2** — With a stack that has no overlay for the file, the result is
  deep-equal to the no-stack result. (This is what keeps every real translation
  on today's text.)
- **INV-3** — A sparse overlay replaces only the keys it names; sibling keys of
  the base survive the merge.
- **INV-4** — The cascade reaches the Beatitudes blend: with the `_test-diff`
  stack, the four feast troparia of 2026-11-01's Third Antiphon come from the
  overlay, and with no stack they come from the base Menaion file.
- **INV-5** — Overlay troparia land on the SAME stichoi as the base ones. The
  renderer right-aligns the troparia list into twelve slots, so an overlay that
  changed the list's length would move every earlier troparion onto the wrong
  verse — the 8-16 / 9-20 failure. Asserted positionally, by mapping each
  troparion to the verse block it follows, not by counting.
- **INV-6** — `_`-prefixed metadata keys in an overlay do not appear in the
  merged result.

## Edge cases

- **Arrays replace wholesale.** `deepMergeOverlay` does not merge array
  elements, so an overlay naming `troparia` substitutes the entire list. That is
  correct for a troparia list, and it is the same whole-array replacement that
  once deleted Ps 102:3-21 from Tyler's First Antiphon
  (`project_variant_replace_not_select`). Diff a proposed array against what the
  base already renders before authoring it, and confirm every omission is
  genuinely not sung.
- **Changing a list's length moves other hymns.** See INV-5. An overlay is for
  retranslating, not for re-counting; a count change belongs in
  `FEAST_BEATITUDES_BLENDS`.
- Merge results are cached per `(relPath, stack)`. Call
  `invalidateVariableSourceOverlay(stack)` after an overlay edit or a
  parish-settings change.

## Keep in sync

- Adding a route that builds the Liturgy: pass `opts.stack` or the Beatitudes
  silently fall back to base text.
- Adding an `octoechos-<id>.json`: nothing to register — discovery is dynamic.
- Moving another variable-source read onto the cascade: add it to the
  "Not yet routed" list above, or remove it from there.
