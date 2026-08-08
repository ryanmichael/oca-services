# Feature: Archbishop Dmitri (Royster) translation layer

## Purpose

Carries the English translation of **Archbishop Dmitri (Royster)** (1923–2011),
late Archbishop of Dallas and the South (OCA), as printed in the Diocese of the
South choir books. It is a whole coherent translation by a named translator, not
a set of parish preferences — so it lives in the cascade as its own layer and is
inheritable by any Diocese of the South parish, rather than being copied into
each parish overlay.

Transcribed 2026-08-07 from the St. John of Damascus (Tyler) choir book,
`docs/Fixed Divine Liturgy - St John/Fixed sections Liturgy.pdf` (15pp, scanned,
no text layer — read visually). Every engraved page is signed
`Translation: +Dmitri (Royster); NAP`.

## Cascade position

```
base → sts-sluzhebnik → oca → dmitri-royster → st-john-damascus-tyler (parish leaf)
```

Set on the parish by `parish_settings.extends_chain = ["oca","dmitri-royster"]`.

## What the layer supplies

| Key | Distinctive reading vs the `oca` layer |
|---|---|
| `only-begotten-son` | "Immortal Word", "Holy Theotokos and Ever-virgin Mary", "save us!" |
| `creed` | "of His Kingdom there shall be no end" (not "Whose Kingdom shall have no end"); "I confess one baptism for the forgiveness of sins" (not "acknowledge…remission"); "and became man"; lowercase divine relative pronouns |
| `beatitudes` | "Kingdom of heaven", "clean of heart", "children of God", "they which are persecuted", "shall say every evil against you falsely", "Rejoice, and be glad", colons at the caesura |

## What lives in the variant library instead, and why

`cherubic-hymn` and `pre-communion.prayer-chrysostom` have rows in
`parish_variant_picks`. **The parish overlay is the cascade leaf**, and variant
picks materialize into it — so a pick masks anything a layer beneath it says.
Putting these two in `dmitri-royster` would have been silently inert.

They ship as library variants pinned to Tyler:

- `cherubic-hymn` → **`royster-bortniansky`** ("We, the Cherubim mystically
  representing… That the King of all we may receive by angelic hosts invisibly
  escorted"), superseding `russian-doubled-1` / alias `tyler-1`.
- `pre-communion-prayer` → **`royster`** ("of whom I am first", "thine own
  immaculate Body"), superseding `htm`.

Both superseded variants remain resolvable per `variant-library/CONTRACT.md`
rule 2. The header on the source page reads "Cherubim Hymn **- 1**", so the
parish book very likely holds further numbered settings not yet transcribed.

## Register

The sources are archaic throughout. Tyler's `defaultPronoun` was flipped
`yy` → `tt` on 2026-08-07 so the rendered text matches the choir books.

This also resolves the `-eth` hybrid noted in
`memory/project_variant_replace_not_select.md` **for Tyler specifically**: the
artifact ("who cleanseth all **your** infirmities") only arises in the `yy`
direction, where `applyYouYour` converts pronouns but leaves archaic verbs. The
underlying app-wide gap for other modern-register parishes is untouched.

## Invariants (tested)

`test/contracts/dmitri-royster-overlay.test.js`

- **INV-1** — The layer supplies its own Only-Begotten Son, Creed and Beatitudes.
- **INV-2** — The `oca` readings it replaces do not also render.
- **INV-3** — The layer **may re-word** an antiphon but **may never shorten it**:
  verse count and per-verse stichos count must match `oca` exactly. Replaced the
  original "declares no antiphon keys" form, which forbade the honest full-length
  re-wording while guarding the same hazard. A short array, or a re-split verse,
  still fails at authoring time.
- **INV-3b** — A gap marker must never appear in a rendered service.
- **INV-4** — Tyler renders traditional register (litany responses "by Thy
  grace", "To Thee, O Lord").
- **INV-5** — The pinned Royster variants win over the parish-leaf masking rule,
  and the superseded folder transcriptions do not render.
- **INV-6** — Selecting `oca` is unaffected; no Royster text leaks downward.

## The antiphons — authored with explicit gap markers

The layer carries both typical antiphons, but **only the stichoi the choir book
actually prints**. Every slot the book lacks holds a marker:

```
[Not in the Royster choir book — stichos 2.3]
```

**Why markers and not OCA text.** Filling the gaps from the layer beneath would
present a half-Royster antiphon as Royster, which the project's
don't-mix-translations rule forbids, and would be inherited by any future Diocese
of the South parish. A marker is honest: the gap stays visible instead of being
silently papered over.

**Why not simply a shorter array.** Because that is `c95da45` — a short array
deletes canon, and an overlay replaces a whole array with no way to express a
subset. The arrays here keep the **same verse and stichos structure as `oca`**
(10 verses / 18 stichoi for Ps 102, 8 / 15 for Ps 145) so practice-layer
addresses keep resolving. Which verses a parish *sings* is a separate concern,
handled by a practice preset — see `features/practice-layer.md`.

**The markers never reach a service.** Tyler's `krasnostovsky-abridged` preset
selects only the transcribed stichoi. INV-3b pins that, and it was verified
across 46 Sundays spanning the year with zero leaks. If a future edit shifts the
selection, the test fails long before a marker turns up mid-Liturgy.

Transcribed from the vocal underlay with singers' elisions expanded
(`long-suff'ring` → `long-suffering`), the same rule the Creed and Cherubic
already follow.

Completing the wording needs the **published** Krasnostovsky/Royster edition —
not the parish's copy, which is cut by intent (confirmed with the parish
2026-08-08).

## Open / unresolved

- **"NAP"** in the attribution line is unidentified. Do not expand it in
  user-facing text until confirmed with the parish.
- **Musical elisions were expanded** — the engraving prints `cath'lic`,
  `mystic'ly`, `long-suff'ring` to fit note values; stored as `catholic`,
  `mystically`, `long-suffering`. Recorded in `manifest._transcription`.
- **Beatitudes troparia-start rubric.** The source annotates verse 5 `(on 8)`,
  verse 7 `(on 6)`, verse 9 `(on 4)` — the verse at which troparia begin for an
  8-, 6- or 4-troparia count. Captured in `_rubricNote` only; **not wired** into
  troparia placement.
- **Cherubic settings rotation** — see `memory/project_cherubic_rotation_tyler.md`;
  only setting #1 has been transcribed.

## Keep in sync

- `fixed-texts/translations/dmitri-royster/manifest.json` + `liturgy-fixed.json`
- `fixed-texts/variant-library/cherubic-hymn.json`, `pre-communion-prayer.json`
- `parish_settings.extends_chain` and `parish_variant_picks` for Tyler
- `parish_rubrics.defaultPronoun` for Tyler (INV-4)
- `test/contracts/__snapshots__/rubrics-pre-refactor.json` — embeds live Tyler
  rubric state, so any deliberate parish setting change requires updating it
