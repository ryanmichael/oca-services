# Feature: the Reader's Beatitude troparia print as cues

**Rubric:** `antiphons.beatitudesTropariaPrintAsCues` (registry-only boolean,
`parish_rubrics`; requires `beatitudesTropariaReaderLed`). On for
St. John of Damascus, Tyler, from 2026-11-23.
**Contract tests:** `test/contracts/beatitudes-print-cues.test.js` (INV-1..5),
`test/contracts/parish-book.test.js` (C6, C7).

## Why

Where the Reader reads the Third Antiphon troparia between the Beatitude
verses the choir sings ([[beatitudes-reader-led]]), the people follow the
troparia by ear. Printing their full text made the Third Antiphon the largest
section of the weekly insert, about a third of it. Asked for by the parish's
own reader of the booklet (user, 2026-11-23).

## What prints

| Surface | Reader's troparia | Beatitude verses, Glory, Now |
|---|---|---|
| App / API | full text (unchanged) | unchanged |
| `/booklet` (pew copy) | one cue line: **Reader** Troparion of the Resurrection | full hymn size (`.prayer.sung`) |
| `/booklet` **Reader's copy** toggle, or `?readers=1` | full text | unchanged |
| Parish Book (bound book) | **omitted entirely**, no cue | full hymn size |
| Parish Book insert | the Third Antiphon is no longer on it | — |
| Static booklet (`?format=html` → Booklet) | cue line | full size |
| Static page / Standard print | full text | unchanged |

The Reader's copy is not remembered between visits on purpose: a church
computer is shared, and the next person to print the pew copy must not
inherit it. The insert page links to it ("Reader's copy →").

## How

- **Names are attached where the troparia are chosen**
  (`server-lib/sources/beatitudes.js`, `CUE`), never derived from `label`.
  Labels are display text and are not consistent: the Myrrh-bearers Octoechos
  stack has none, "Theotokion" occurs for both books, and the Pentecostarion's
  "Troparion of Ode 6" is not a Resurrection troparion.
  - Octoechos Sunday set: by **position**. Every tone and every stack is
    6 Resurrection + Glory (Trinity) + Theotokion.
  - Blend parts carry a `cue` (`'Troparion of the Entry'`, …). A genre the book
    records on one troparion (Theotokion, Triadicon) wins over its part's name.
  - Holy Fathers → "Troparion of the Fathers"; a spliced feast override →
    "Troparion of the Feast"; the legacy ode path and anything unnamed →
    "Troparion". Pentecostarion `beatitudesTroparia` items are not named yet,
    so they print "Troparion" (the Paschal edition is not built).
- `_litBeatitudes` (`assemblers/liturgy-parts/antiphons.js`) emits a block
  field `print` only when the rubric is on **and** the speaker is the Reader:
  `{ cue }` on each troparion, `{ emphasis: 'sung' }` on the verses, Glory and
  Now. Text, speaker, label and tone are unchanged, so L17, L45 and
  `beatitudes-reader-led` INV-2 are unaffected. Off, the blocks are
  byte-identical to before. Named `print`, not `cue`, because `density: 'cue'`
  already means something else.
- Renderers: `renderBlocks(blocks, { print, readersCopy })` in
  `public/scripts/renderer.js`; the panel never passes `print`. Root
  `renderer.js` renders both the full block (`.print-full`) and the cue
  (`.print-cue`, hidden on the page); its Booklet button strips `.print-full`.
- Parish Book: the edition's `omit: { printCues: true }` removes every block
  carrying `print.cue` before the split (`split.js` `project`), frozen into the
  book and its fingerprint. The Beatitudes then render identically on every
  claimed Sunday and become book text; the insert's stretch starts at the
  Troparia. Sundays with **festal antiphons** (a Feast of the Lord) are not
  claimed (`membership.antiphons: "typical"`, `/api/liturgy` `antiphons`).

## Measured (2026-11-23, local, real paginator)

- Insert: 11-22 14 → **10** half-pages; 11-29 **8**, 12-06 **9**, 12-13 **8**,
  2027-01-24 **7** (8 = two sheets).
- Book: 36 → **40** pages (37 → 40 for saddle-stitch).
- `/booklet` 11-22: 44 → 43 half-pages (the verses now print at full size).

## Not done

- A reserved (unsourced) slot (8-16, 9-20) prints nothing in the pew copy,
  though the Reader reads something there; a cue could stand in for it.
- Pentecostarion items have no specific cue names.
- The phone's Standard print of the app panel prints full text (it is a
  Reader's copy by default).
