# Booklet density tiers

**Status:** shipped 2026-10-31
**Contract test:** `test/contracts/density-tiers.test.js`
**Field:** `ServiceBlock.density` — `compact` | `cue` | `fine` (absent = body size)
**Styled in:** `public/styles/main.css` (panel + `#bk-root` booklet), `renderer.js` (static page + static booklet)
**Stamped by:** `public/scripts/renderer.js` (panel/booklet source), `renderer.js` → `DENSITY_CLASS`

## The problem

A Great Vespers booklet for 2026-10-31 (St John, Tyler) was **36 half-pages —
9 sheets of paper**, with every role set in the same 15pt/1.75 body type. By
text volume the service is choir 38%, reader 33%, deacon 17%, priest 10%, and
the typography said all four weigh the same.

Measured on that date:

- The four litanies are **9.2 of 36 pages — 29% of the booklet** — and the
  pew's entire part in them is to sing "Lord, have mercy."
- **31% of all blocks (55 of 177)** are one of eleven repeated short
  acclamations: `Lord, have mercy` ×17, `Amen` ×8, `Alleluia, alleluia,
  alleluia` ×8, `Grant this, O Lord` ×6, `To Thee, O Lord` ×4.
- Psalm 103 is **3.5 pages** the congregation listens to while the priest
  censes.

Meanwhile Lord, I Have Cried — the stichera, the reason the booklet exists —
is 25%.

## The tiers

| Tier | For | Panel | Booklet | Static page | Static booklet |
|---|---|---|---|---|---|
| *(none)* | what the pew sings or says | 16px | 15pt | inherit | 11pt |
| `compact` | long text spoken **to** the pew: readings, psalmody, the deacon's petitions, the priest's exclamations | 14px | 11.5pt | 10pt | 9pt |
| `cue` | a short invariant acclamation — located, not read | 13px | 10.5pt | 9.5pt | 8.5pt |
| `fine` | text read privately (the silent pre-Communion prayer) | 12px | 10pt | 8.5pt | 8pt |

The ladder is **strictly** ordered in every surface (compact > cue > fine), so
it reads in one direction: the smaller the type, the less the pew is expected
to do with it. A tie is as bad as an inert tier — the reader cannot tell two
tiers apart either way — so INV-2 rejects it.

`compact` is **roman in the booklet and italic everywhere else.** In the panel
it marks a short reading; in the booklet it carries multi-page runs, and a page
of italic is harder to read in a dim nave than the size step alone. The size
step does the hierarchy work.

## The Liturgy readings — a decision that had never been made

The Epistle and Gospel were tagged `compact` by earlier work, but because
`#bk-root .prayer.compact` did not exist they printed at full body size in
italic for the whole life of that tag. **Fixing the CSS is what enacted the
decision**; the first Gospel anyone ever saw at 11.5pt was the day this
shipped. Put to the parish explicitly on 2026-10-31 and **kept**: a reading is
read ALOUD to the congregation, not said by it. Guarded by INV-8, which also
pins the announcements around them (`ep-reader`, `gos-rubric`, `gos-end`) at
body size, since those are the cues that mark where a reading starts and ends.

Six service types carry these tiers, not just Vespers — Great and Daily
Vespers, Matins, Divine Liturgy, Presanctified and Lamentations — because the
litany module is shared. Liturgy 61 -> 50 half-pages, 16 -> 13 sheets.

## What is never stepped down

A hymn never carries a density step. Neither does the Kathisma's "Blessed is
the Man", Vouchsafe, the Nunc Dimittis, or Our Father — the pew says those.
Nor do the short landmark exclamations that tell a reader where they are: the
opening blessing, the Entrance, the Prokeimenon dialogue, the final Dismissal
blessing. Those stay at body size *even though shrinking them would have saved
another page*: a booklet you cannot navigate is not shorter, it is worse.

## Result

| | before | after |
|---|---|---|
| Great Vespers 2026-10-31 | 36 pages / 9 sheets | **26 pages / 7 sheets** |
| Divine Liturgy 2026-11-01 | 61 pages / 16 sheets | **50 pages / 13 sheets** |

(Includes the pagination fix below, which is independent of the tiers.)

The stichera, the psalm refrains and everything the congregation sings are
untouched at full size.

### Why 11.5pt

Measured across the whole ladder on 2026-10-31 (Great Vespers / Divine
Liturgy, sheets):

| compact | 12.5 | 12 | 11.5 | 11 | 10.5 | 10 |
|---|---|---|---|---|---|---|
| Vespers | 8 | 8 | **7** | 7 | 7 | 7 |
| Liturgy | 14 | 14 | 14 | 14 | 14 | 13 |

12pt buys nothing. **11.5 is where Vespers crosses 28 pages into 7 sheets**,
and 11 and 10.5 buy nothing further — so anything between 11.5 and 10.5 costs
legibility for no paper. The next real stop is **10pt**, which takes the
Liturgy to 13 sheets; rejected for now, because 10pt EB Garamond is two thirds
of the body size and this is read standing, in a nave, in low light. If a
parish asks for it, it is a one-line change and the contract test already
guards the ladder.

A different aggressive version — stepping down *every* priest and deacon
block, dismissal and entrance included — also reaches 7 sheets. It was
measured and rejected for the wayfinding reason above: it buys the same sheet
by taking away the landmarks instead of the type size.

## The trap this feature was born from

`#bk-root .prayer` carries an **id**, so it outranks a plain `.prayer.compact`
class. main.css had a `#bk-root` override for `.fine` but **none for
`.compact`**, so in the booklet `compact` set only `font-style` — every block
tagged compact (the whole Liturgy anaphora, both readings) printed at **full
body size in italic**. Half-applied is worse than absent: italic at body size
is harder to read and saves nothing. Live in production until 2026-10-31,
found by probing computed styles in the rendered booklet.

Nothing caught it because `silent-communion-prayers.test.js` INV-10 asserts
the ladder only in the **panel** scope — the one surface where it was correct.
`density-tiers.test.js` INV-1/INV-2 therefore assert the ladder in **all four**
surfaces, and assert it as a ladder (each tier smaller than the body, cue and
fine smaller than compact) rather than as the presence of a rule.

**Adding a surface that renders blocks means adding its row to `surfaces()` in
the contract test.** A surface with no rule for a tier is not a styling nit; it
is a tier that silently does nothing there.

## The pagination trap this feature also sprang

A block too tall for the space left on a page is **clipped** and continued on
the next, with the remainder pulled up by a negative margin. Both the clip
height and the continuation offset must land on a whole line *of the element
being cut*, or the page shows half a line of text.

`booklet.js` snapped both to one module constant derived from the **body**
type — `15pt x 1.75 = 35px`. Correct while every block was body size. These
tiers broke it: `compact` is 11.5pt/1.5 = **23px**, `cue` 10.5pt/1.3 = 18px.
Snapping a compact block to 35px steps cuts at 35/70/105 while its lines end
at 23/46/69, so page 2 of a Great Vespers printed Psalm 103 with its top line
sliced in half. **Caught on paper, not by any test.** Measured: 7 mid-line
cuts before, 0 after, every one of them `compact`.

`paginate()` now measures each item's own computed `line-height` alongside its
height and passes it to `splitItem`. `LINE_H_FALLBACK` remains only for
`line-height: normal`, which computes to a keyword rather than a length.

**Guarded by `test/e2e/10-booklet-pagination.spec.js`, not by a node contract
test** — the defect exists only in laid-out pixels, and the node suites (710
tests) were green for its whole life. Any future tier, or any change to a
tier's line-height, is covered automatically because the test reads geometry
rather than a size table. It also asserts that a compact block *was* clipped,
so the check cannot pass vacuously.

## A second pagination bug, found by asking why pages ended early

`paginate()` measures each item in an off-screen probe div to decide how much
fits on a page. That div is **absolutely positioned**, which makes it a block
formatting context — so the child's margins do **not** collapse out of it and
the measured height **already includes them**. The code then added
`marginBottom` on top, double-counting it on every single item: 8px per
`prayer`, 6px per `compact`, 3px per `cue`, 10px per section head.

Measured 2026-10-31: the paginator believed its pages held ~680 of 706px
while they rendered at ~630 — **47px short per page**, 1314px over 28 pages,
close to two whole pages of blank bottom margin. Present since the booklet's
first commit; nothing had ever looked, because short pages read as a design
choice rather than a defect.

Removing the addition is the whole fix. A real `.bk-half` has padding, so it
is a BFC too and its children's margins likewise do not collapse away —
measuring and rendering agree only when the margin is *not* added.

| | before | after |
|---|---|---|
| Great Vespers | 28 pages, median gap 75px, 12 pages >80px short | **26 pages**, median gap 26px, 1 page (the last) |
| Divine Liturgy | 54 pages, median gap 88px, 31 pages >80px short | **50 pages**, median gap 37px, 1 page (the last) |

## Still open

- `public/dashboard.html` has its own block renderer with **no density support
  at all** — it ignores `compact` and `fine` today, and now `cue`. It is an
  internal dev preview, so it is not in `surfaces()`; if it ever becomes a
  print path it must be.
- `ps103-refrain` is typed `rubric` though it is psalm text the reader says
  aloud, so it renders in the red italic that means "do not say this"
  everywhere else. Not a density problem; tracked separately.
- In Matins the kathisma heading collides with its section head, and the two
  mean different things: section `Kathisma 1` (which kathisma of THIS service)
  sits directly above rubric `Kathisma Seven` (which kathisma of the Psalter).
  Two numbers, both called "Kathisma", adjacent, disagreeing. Fixing it means
  renaming sections, and section names are load-bearing — audit rules M1/M26
  match `'Kathisma 1'`/`'Kathisma 2'`, `api-kneeling-vespers.js` matches
  `section === 'Kathisma'`, `omit-read-kathisma.test.js` asserts it. That is a
  liturgical-logic change wearing a styling costume, so it is left alone.
