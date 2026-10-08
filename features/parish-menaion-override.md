# Parish Menaion override

**Status:** shipped 2026-10-08
**Contract test:** `test/contracts/parish-menaion-override.test.js`
**Drift rule:** `drift:check` → menaion parish overrides
**Library contract:** `fixed-texts/variant-library/CONTRACT.md`

## The gap this closes

Menaion hymns — stichera, troparia, kontakia — live in `oca.db`, not in
`fixed-texts/`. The translation-overlay cascade is scoped to `fixed-texts/`
(`project_overlay_variable_sources_gap`), and `MENAION_HYMN_OVERRIDES` in
`liturgy-from-orthocal.js` is a flat global map with no parish dimension. So a
parish that sang a different sticheron or kontakion had exactly two options:
change the text for every parish, or live with the divergence.

Surfaced 2026-10-08 against the choir packet for the Sunday of the Holy
Fathers: Tyler sings a **Tone 8** kontakion where the OCA order appoints Tone
6, and a **distinct sixth** Lord-I-Call sticheron where the OCA text repeats
the first.

## How it works

A parish picks a menaion variant exactly as it picks a fixed-text one: a
`parish_variant_picks` row against a library file. The library file's
`_target.kind` is what differs.

```json
"_target": {
  "kind": "menaion",
  "commemoration": { "month": 10, "day": 11, "title": "…Seventh Ecumenical Council" },
  "hymn":   { "table": "stichera", "section": "lordICall", "order": 2 },
  "expect": ["96e54ce9…"]
}
```

`hymn.table` is `stichera` (`{section, order}`) or `troparia` (`{type}`).
A menaion variant's `value` is `{ tone, text }` — unlike a fixed-text variant,
it may change the tone, because the alternatives are sometimes different hymns
rather than different renderings of one hymn.

Menaion picks do not materialize into overlay data (there is no dotted key to
slot them at). `buildParishOverlay` collects them onto
`manifest.rubrics.menaionOverrides`, and the assemblers — which already thread
`opts.rubrics` — pass them to `getMenaionRanked` / `getSticheraDay` /
`getMenaionDay`. Those take an optional trailing `opts`; the ~20 read-only
routes that omit it keep base behaviour.

## Invariants

- **INV-1** — a parish with a menaion pick renders its own hymn.
- **INV-2** — the OCA base, and every parish without that pick, is unchanged.
- **INV-3** — an override carries its tone, and the rubric that announces the
  hymn announces the overridden tone. A Tone 8 hymn under a "Tone 6"
  announcement is the failure this project has shipped before
  (`feedback_assert_structure_not_labels`).
- **INV-4** — targeting is by **position**. The OCA text fills a short
  Lord-I-Call set by repeating a sticheron, so slots 1 and 2 can be
  byte-identical; replacing slot 2 must leave slot 1 alone.
- **INV-5** — targeting is **guarded by content**. If the base text at that
  slot is not one of `_target.expect`, the override does **not** apply and the
  base renders. A re-authored base re-surfaces the parish's decision instead of
  redirecting their wording onto whatever drifted into the slot.
- **INV-6** — a detached override is never silent: `drift:check` names the
  parish, the variant, the new base sha and the file to update.
- **INV-7** — overrides substitute in place. They never add or remove a hymn,
  so `hasTroparion` / `hasStichera` and every ranking decision downstream are
  unaffected by whether a parish has picked one.

## Why position *and* content

Position alone is unsafe: sticheron orders get renumbered, as they were on
2026-10-08 when the Fathers' set was re-keyed. Content alone is insufficient:
the repeat means one sha can match two slots, and a content-addressed override
would have replaced both. Addressing by order and verifying by sha is the pair
that survives both failures.

## Adding one

1. Read the parish's source **visually** — a scan, not the OCR sidecar, which
   mis-read "defines" as "de-fimes" on the very page this feature was built
   from.
2. Compute the base sha: `find-slot.js` prints it, or
   `sha256(text)` over the exact DB text.
3. Add the variant to a library file with a source-semantic id and a
   `_provenance` block (CONTRACT.md rules 1–4 apply unchanged).
4. Insert the `parish_variant_picks` row.
5. `npm run drift:check` — the override must report clean, not detached.

## Interaction with the tracked metrics

Two measurement effects, both expected, neither a defect:

**Provenance.** `provenance-sweep` names a hymn's book by matching its text
against the corpus index. A parish-authored hymn is not in any indexed book, so
each applied override moves one hymn from "named" to "unresolved" (2026-10-08:
3947 → 3946). That is honest — we cannot verify a book for it. Deliberately it
does *not* assert a source: `classify()` counts a claimed-but-unverifiable book
as `defaulted`, which would score worse than admitting the gap. Budget one
unresolved hymn per applied override when re-baselining.

**Packet fidelity.** `choir-packet-diff` scores only `[text]` OCR pages and
treats one page as one unit. The Tone 8 kontakion is on a `[music]` page, so it
is invisible to that metric; the sixth sticheron shares a page with two other
hymns, so matching one third does not move the page's score. Both overrides are
verified by the contract test instead. Do not expect the ratchet to move when
an override lands.
