# Feature: Prayers of Thanksgiving after the dismissal

**Status:** shipped 2026-10-01
**Contract test:** `test/contracts/prayers-of-thanksgiving.test.js`
**Last verified:** this commit

## Purpose

Render the Prayers of Thanksgiving after Holy Communion — read by the reader
**after the dismissal**, while the faithful venerate the cross — and the sung
ending a parish may use in place of the reader saying it.

Asked for by the choir director of St John of Damascus, Tyler
(2026-09-24 blast, clarified 2026-10-01):

> "this occurs at the very end of the service. While everyone kisses the cross
> and is blessed by the priest, the Reader is reading what are called the
> prayers of Thanksgiving or the post-communion prayers. It is customary to end
> with 3 Lord have mercy's and some parishes sing it instead of the reader
> saying it. It is also customary to sing the troparion of the church at the
> end. If it were a feast day or the week following a feast we would not sing to
> St John but do the troparion of the feast."

**This is not the Litany of Thanksgiving**, which is inside the Liturgy. The
first reading of her 09-24 note put it there; asking is what corrected it.

## Source

Appendix II of **Service Books of the Orthodox Church**, 2nd ed., St. Tikhon's
Seminary Press, South Canaan PA, 2010, pp. 260–267. The book draws on the 1967
OCA text, used by permission, and is printed with the blessing of Metropolitan
Jonah — the same tradition as our base, so no translations are mixed.
Local copy: `reference/sluzhebnik_sts_3liturgies.pdf`.

The book's own heading is *"After the dismissal at the Liturgy"*, which
corroborates the director independently.

The Trisagion and the Lord's Prayer **reuse the keys this service already
renders** (`trisagion`, `lords-prayer`) rather than importing the book's
wording, so one Liturgy never carries two renderings of the Our Father. INV-9
pins that.

## Interface

Two rubrics, because they are two decisions:

| Rubric | Default | Effect |
|---|---|---|
| `liturgy.prayersOfThanksgiving` | off | render the section at all; otherwise the service ends at the dismissal |
| `liturgy.sungVenerationEnding` | off | the choir sings three "Lord, have mercy" and the temple's troparion, instead of the reader saying the book's twelve |

Fixed text: `liturgy-fixed.json → prayers-of-thanksgiving`.

## Behavior table — which troparion closes

Only when `sungVenerationEnding` is on.

| Day | Closes with | Why |
|---|---|---|
| ordinary | troparion of the temple's patron | the customary ending |
| a Great Feast (`feastOnly`) | the feast's troparion | "if it were a feast day… do the troparion of the feast" |
| Afterfeast / Leavetaking of a Great Feast | the feast's troparion | "the week following a feast" |
| **Forefeast** | the patron | she spoke only of the week *following*; a forefeast is before, and is left alone |
| a **lesser** feast's window (e.g. 2026-08-30, the Beheading) | the patron | the same line `menaion-principal.js` draws for "Now and ever…" — not one of the Twelve |

The feast's troparion arrives as `feastWindow.troparion`, surfaced by
`liturgy-from-orthocal.js` alongside the feast-window signal.

⚠️ **Do not select it by matching rubric text.** An earlier draft did, and
silently failed on "Troparion of Afterfeast of the Dormition" because the
commemoration title the rubric is built from is not the window title. The
existing `feastWindow` flag on a troparia entry is also **not** a reliable
marker: it is set only when the window sings *second*, so on 2026-08-16 — where
it sings last, at "Now and ever…" — nothing is tagged.

## Invariants (tested)

- **INV-1** — a parish that has not opted in still ends at the dismissal.
- **INV-2** — all six prayers render, in the book's order.
- **INV-3** — the section follows the dismissal and is distinct from the Litany
  of Thanksgiving.
- **INV-4** — the choir sings three; the book's reader-said twelve does not also
  render.
- **INV-5** — an ordinary day closes with the temple's troparion.
- **INV-6** — a feast and the week after it displace the patron, on both the
  fixed and the moveable calendar.
- **INV-7** — a forefeast does not displace the patron.
- **INV-8** — a lesser feast's window does not displace the patron.
- **INV-9** — the Trisagion and Our Father are the same text the service
  already renders.

## Open questions for the director

- **Forefeasts** are unaddressed. Today they keep St John. If the parish in fact
  sings the forefeast's troparion, one line changes.
- **The count.** The book appoints **twelve** "Lord, have mercy" at the close;
  she described **three**. Implemented as three, since that is what the parish
  sings, but the divergence is deliberate and recorded here rather than
  reconciled silently.
- **The author's troparion.** The book closes with the troparion of the
  Liturgy's author (Chrysostom / Basil / Gregory) before the Theotokion; the
  parish sings the temple's instead. Not currently rendered in the sung path.

## Keep in sync

- `assemblers/liturgy-parts/prayers-of-thanksgiving.js` — the emitter
- `assemblers/liturgy.js` step 38 — the troparion selection
- `server-lib/sources/liturgy-from-orthocal.js` — `feastWindow.troparion`
- `features/feast-window-signal.md` — the signal this depends on
- `data/rubric-registry.json` — both rubrics
