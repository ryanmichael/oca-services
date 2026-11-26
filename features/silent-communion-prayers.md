# Silent pre-Communion prayer during the Communion Hymn

**Status:** shipped 2026-10-12; set in fine print 2026-10-25; printed at the back 2026-11-26
**Contract test:** `test/contracts/silent-communion-prayers.test.js`
**Rubric:** `liturgy.silentCommunionPrayers` (registry: `silentCommunionPrayers`) — off by default;
`liturgy.silentCommunionPrayersInAppendix` moves it to the back in print
**Text:** `fixed-texts/liturgy-fixed.json` → `prayers-before-communion`
**Emitter:** `assemblers/liturgy-parts/communion.js` → `_litCommunionHymn`

## What changed

While the clergy commune behind the curtain — several minutes — the Communion
Hymn section printed the koinonikon and then **seven rubric lines of choir
cues**: an intro plus one label per troparion and kontakion of the day, with no
text bodies, because the texts were already printed at the Little Entrance.

For the choir that is a cue sheet. For everyone else it is seven lines of dead
space at exactly the moment they have nothing to read and several silent minutes
to fill. St John of Damascus, Tyler asked for the prayer of St. John Chrysostom
from the rule before Holy Communion there instead, for the faithful to pray
**silently** — and their choir sings from its own printouts, so the cues are not
load-bearing for them.

With the rubric on, the cue rubrics **give way to** the prayer; they are not
printed alongside it. With the rubric off, the section is byte-identical to
before.

## Off by default, on purpose

Dropping the cue rubrics unprompted would strip the choir's cue sheet in any
parish whose choir *does* read this app rather than its own binder. The parish
that wants the prayer is the parish that knows its choir does not need the cues,
so the parish asks. One row in `parish_rubrics` turns it on for that parish.

**There is no global switch, and the registry `default` is not one.** Flipping
`default` to `true` does not enable this anywhere — `buildRubrics` compacts
default-valued rubrics out of the overlay to keep it sparse, so a parish's
explicit pick that now *equals* the default is dropped and the feature turns
**off** for the parish that asked for it, while the base (which has no picks at
all) is unaffected. Measured 2026-10-12: with `default: true`, Tyler's
`liturgy` namespace came back `{prayersOfThanksgiving, sungVenerationEnding}` —
`silentCommunionPrayers` simply gone. This is the `includeSecondKoinonikon`
tri-state footgun documented at `server-lib/parishes/index.js:165-180`, and the
reason INV-1 has to be falsified by breaking the *emitter* rather than by
flipping the default. Enabling it for more parishes means one row each.

## The text

Supplied by the parish on 2026-10-12 as the wording they use. **The published
edition is not identified** — the reading "nor sufficiently pleasing" matches
neither the OCA Service Book nor the Jordanville wording — so `_source` records
it as parish-supplied rather than crediting a book nobody here has seen.
Authored verbatim apart from lowercasing `And As Thou didst not abhor` in
paragraph 5. **If the edition is later identified, replace the note with the
citation; do not re-author the text.**

`prayers` is an **array** of `{ id, label, text }`, matching
`prayers-of-thanksgiving`, so further prayers of the rule can be added later
without reshaping anything or touching the assembler.

## Three things that bite

**A `label` on a prayer block is silently dropped.** `renderer.js` renders
`label` for `type: 'hymn'` only; for `rubric` it is the `service-title`
sentinel, and `prayer` ignores it entirely. So the attribution goes in its own
`rubric` block — the same shape `_litPrayersOfThanksgiving` uses. Setting
`label` on the prayer and calling it done would have lost the saint's name with
nothing failing.

**Paragraphs live inside one block, not one block each.** `esc()` turns `\n`
into `<br>`, so blank-line paragraph breaks render as gaps — the Creed is
already one multi-paragraph block. `_litCommunionPrayer` splits its prayer on
blank lines into separate blocks, which is right for three prayers said aloud
and wrong here: it would stamp `All:` on all ten paragraphs of one prayer.
INV-5 pins the paragraph count so a future split does not pass quietly.

**This is not the prayer said aloud.** The three prayers under **Communion
Prayer** ("I believe, O Lord, and I confess…", "Of Thy Mystical Supper…", "May
the communion of Thy Holy Mysteries…") are a different moment — said aloud by
all as the chalice comes out — and are untouched. Confusingly, the key holding
them is named `pre-communion.prayer-chrysostom`, where "chrysostom" means *the
Chrysostom Liturgy*, not authorship: the first of those three is Symeon
Metaphrastes'. Nothing new here may take a `-chrysostom` suffix for that reason.
INV-6 asserts the aloud prayers still render.

## Fine print, and a rubric that says so (2026-10-25)

Ten paragraphs at full reading size dominate the page at a moment when the
congregation is *not* being asked to read them aloud — and the parish asked for
the opposite emphasis: small, clearly optional, clearly quiet.

Two changes, no new rubric:

**A third density step, `fine`.** `density: 'compact'` (14px desktop / 18px
phone) is the small italic already used for readings and long spoken prayers,
so it does not distinguish this from them. `fine` is one step below it (12px /
17px desktop / phone, 8.5pt in print, 11pt in the booklet) and is a general
presentational step, not a one-off class: any block read privately can take it.

It has to be styled in **four** places, because the class alone is inert:
`.prayer.fine` in `public/styles/main.css`, the `≤767px` phone override beside
`.prayer.compact`, `p.prayer.fine` in the print stylesheet in `renderer.js`, and
`#bk-root .prayer.fine` — the booklet's `#bk-root` selector outranks
`.prayer.fine`, so without its own rule the booklet prints at full size. (The
same specificity trap means the booklet has never honoured `.compact`; that is
left alone here rather than changed blind.)

Both renderers map it: `densityClass()` in `renderer.js` (print/static) and the
`densityCls` ternary in `public/scripts/renderer.js` (the panel). INV-10 renders
a block through **both** and asserts the class reaches the markup, then compares
the two CSS font sizes — a `fine` rule that is larger than `compact` fails.

**The rubric now names the wait and the quiet.** It read "While the clergy
commune, the faithful pray silently:" — true but terse, and it did not say that
there are several minutes to fill or that saying it quietly to oneself is the
intent rather than following along. It now reads:

> While the clergy commune there is a wait of several minutes. The faithful may
> pray silently, saying this quietly to themselves:

`silently` stays in the wording on purpose: INV-4 matches `/\bsilent/i`, and
"keep silence" would not satisfy it.

## In print, at the back (2026-11-26)

St John of Damascus asked for the prayer to come out of the Communion Hymn on
paper and sit in an appendix at the back of the book, with a note telling the
reader where to find it. New rubric `liturgy.silentCommunionPrayersInAppendix`
(registry `silentCommunionPrayersInAppendix`, boolean, off), one row in
`parish_rubrics` for St John's.

**It is a print hint, not a reorder.** The assembler still emits the prayer in
the Communion Hymn, so the API, the screen and every audit see the service in
its real order. It adds `print` hints, the same mechanism as the Beatitude
print cues (features/beatitudes-print-cues.md):

- `ch-silent-rubric` gets `print: { pointer, appendix }`. In print it reads
  `prayers-before-communion.appendix.pointer`: "…The faithful may pray
  silently the Prayer of St. John Chrysostom, found at the back of this book",
  plus " (page N)" where the surface prints folios, and a full stop.
- The attribution and the prayer get `print: { appendix: "Prayers Before Holy
  Communion" }` (the title also comes from `appendix.title`).

**Who honours it.** `renderBlocks` in `public/scripts/renderer.js`, when
`opts.print`: blocks carrying `print.appendix` leave their place and render
after everything else as a section "Appendix: <title>". That covers the
booklet (`/booklet`) and the Parish Book, which both render through it.
`paginate()` in `booklet.js` starts a `.print-appendix` section on a fresh
page. The Parish Book prints folios, so `parish-book.js` lays the pointer out
with a " (page 00)" placeholder and fills in the folio of the page holding the
appendix heading once paginated. The booklet has no folios, so its pointer
carries no number. The static `renderer.js` wraps the blocks for its
`printBooklet()` to lift out too, but `/service` renders Vespers only today,
so that path never meets the prayer.

**What it costs.** Parish Book: still 37 pages, so 40 for saddle-stitch; the
appendix is page 36 and the pointer is on page 25 (measured 2026-11-26). The
weekly booklet for 2026-11-29 grew one half-page from the page break (47 → 48),
still 12 sheets. The prayer keeps `density: 'fine'`.

## Invariants

- **INV-1** — off by default: the OCA base keeps the cue rubrics and emits no
  silent-prayer block.
- **INV-2** — on for Tyler the prayer appears and **every `ch-cycle-*` cue
  rubric is gone**. It replaces, never accompanies.
- **INV-3** — position: the prayer sits inside Communion Hymn, *after* the
  koinonikon hymns, and the section still precedes Communion Prayer.
- **INV-4** — the prayer is spoken by `all` and is immediately preceded by a
  rubric that says it is prayed **silently**.
- **INV-5** — all ten paragraphs survive, first and last anchored.
- **INV-6** — the three prayers said aloud at Communion Prayer are unaffected.
- **INV-7** — a modern-register parish gets it converted: with `pronoun=yy` the
  prayer renders with no archaic forms left.
- **INV-8** — `_litCommunionHymn` called without fixed texts or rubrics (Typika
  does this) neither throws nor emits a silent-prayer block.
- **INV-9** — the rubric before it says there is a **wait** and that it may be
  prayed **quietly**, not only that it is silent.
- **INV-10** — the block carries `density: 'fine'`, both renderers stamp the
  class, and `.prayer.fine` is styled smaller than `.prayer.compact`.
- **INV-12** — with the appendix rubric on, the API order is unchanged: the
  prayer is still in Communion Hymn immediately before Communion Prayer; the
  pointer and the prayer name the same appendix.
- **INV-13** — print render: the prayer appears once, inside the appendix,
  which is the last section; the pointer sits in Communion Hymn, before
  Communion Prayer.
- **INV-14** — screen render: the prayer is inline and there is no pointer.
- **INV-15** — with the appendix rubric off, no block carries a print hint;
  on, the same ids and texts in the same order.
- **INV-16** — the static renderer wraps the prayer for `printBooklet()` and
  hides the pointer on its own page.
- **e2e `11-appendix-page`** — in the Parish Book the pointer's page number is
  the folio of the page the appendix heading starts; in the booklet the
  appendix starts a fresh page. Verified to fail with the page off by one.

## Scope

Liturgy only. `assemblers/typika.js:283` also calls `_litCommunionHymn` but
passes no `spec`, so Typika emits no cue rubrics today — there is nothing there
to replace, and it is left alone.
