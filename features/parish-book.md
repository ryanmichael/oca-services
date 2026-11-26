# Parish Book

**Status:** step 1 of 5 (Chrysostom edition + weekly insert), staging, 2026-11-17
**Contract test:** `test/contracts/parish-book.test.js`
**Modules:** `server-lib/parish-book/` · route `server-lib/routes/parish-book.js` ·
page `public/parish-book.html` + `public/scripts/parish-book.js`
**Data:** `parish-books/<parish>/<edition>.json` (config) and `<edition>.book.json` (frozen)

## What it is

A **bound book** holding the text of a service that does not change, printed
once by a print shop (St. John of Damascus: Mixam, saddle-stitched, digest
5.5×8.5), plus a **loose weekly insert** printed onsite that carries what
does. On an ordinary Sunday the reader leaves the book at a black bar at the
Troparia, reads the insert through the Gospel, and resumes at a boxed
"◀ Resume here". The Beatitudes are in the book as verses only: the Reader's
troparia between them are not printed anywhere in the pew's copies
(see "What it leaves out"). A few occasional changes ("It is truly meet", the Communion
hymn, the patron troparion, the Dismissal) sit in "Also this week".

## It owns no text

Both halves are cut from the assembled service, fetched through the same
`/api/<service>` route the app uses, in-process (`service-source.js`). A choir
correction, a parish variant pick or a register change reaches the book
exactly as it reaches the app. There is no second copy of any text.

## What it leaves out

The contract is book + insert = the assembled service **less the edition's
`omit` rule**. One rule exists: `omit: { printCues: true }` drops every block
carrying a print cue, i.e. the Reader's Beatitude troparia of a parish with
`antiphons.beatitudesTropariaPrintAsCues` on (features/beatitudes-print-cues.md).
`split.js` `project()` applies it before deriving the book and before every
insert cut; it is frozen into the book and its fingerprint. Contract C6 asserts
it removes exactly those troparia and nothing else. The Reader's copy is the
full booklet, linked from the insert page.

## Membership

`membership` selects the dates an edition claims: weekday, `seasons`,
`serviceName`, and `antiphons` ("typical"). A Feast of the Lord on a Sunday
sings festal antiphons in place of the Beatitudes the book prints, so it is not
claimed and that week prints the full booklet (decided 2026-11-23; C7). The
insert page says so in those words rather than reporting a misfit.

A Sunday under a dated **seasonal layer** (`rubrics.seasonalLayers`,
`server-lib/overlays/seasonal-layers.js`) is likewise not claimed by an edition
printed in the standing texts: St John of Damascus sings "Liturgy #2" from
2026-11-29 to Forgiveness Sunday 2027-03-14, and the book keeps the Liturgy #1
wording (decided 2026-11-26), so those weeks print the full booklet. An edition
printed for a layer would name it in `membership.seasonalLayer` (C8).

## How the split is derived

`split.js`, pure:

1. Assemble every date the edition claims across `sampleYears`.
2. A block is an **anchor** (printed in the book) when it renders identically
   — same id, text, speaker, type, label, density — on `anchorShare` of them.
   St. John's uses `1`: identical on **every** sampled Sunday.
3. A **stretch** (config: `fromSection` → `toSection`) is everything strictly
   between the last anchor before it and the first anchor after it. The
   insert carries it whole; anchors inside it are dropped, since the book never
   prints them.
4. Every other place where some Sunday has extra or different text is a
   **slot**. If one content occurs on ≥50% of Sundays the book prints it
   (marked "Unless this week's insert appoints otherwise" when it ever varies);
   otherwise the book points to the insert. The insert lists a slot only in a
   week it differs.

A date that cannot be cut this way (a changed anchor, a missing one, text
where the book has no slot) **does not fit**. The page says so and links the
full booklet. It never prints a book and insert that disagree with the service.

## Frozen editions

A bound book is printed once and kept for years, so the site serves the
**frozen** layout (`<edition>.book.json`), never a fresh derivation.
`fingerprint` hashes what the book prints. Every insert page carries the
fingerprint in its footer, so a stale insert in a new book, or the reverse,
is visible on paper.

```bash
npm run parish-book:build -- st-john-damascus-tyler     # derive + freeze
npm run parish-book:check -- st-john-damascus-tyler     # exit 1 on drift
```

Contract **C4** fails when the frozen book no longer matches the service. That
is deliberate. It means the copies in the narthex now disagree with the app,
and the fix is a decision (rebuild and reprint, or revert), not a snapshot
refresh.

## Typography: every tier ≥12pt

The booklet's `compact` 11.5 / `cue` 10.5 / `fine` 10pt tiers and its 9.75pt
speaker labels sit under the 12pt floor for readers over 50. `body.parish-book`
raises them all to 12pt. The hierarchy is carried by style and colour instead.
The existing booklet is untouched. The only text under 12pt is the insert's
edition tag in the footer (9pt), which is a printer's mark rather than reading
text.

## Measured (2026-11-23, after the Beatitudes moved into the book)

- **Book:** 37 pages → 40 for saddle-stitch. 2026–2028: 113 of 113 claimed
  Sundays fit (2028-08-06, the Transfiguration, is no longer claimed). Slots
  7 → 4: the two that existed only for the Transfiguration's antiphons are gone.
- **Insert (15pt):** 11-22 **10** half-pages (was 14); 11-29 **8**, 12-06 **9**,
  12-13 **8**, 2027-01-24 **7**. Two sheets is now reached on most ordinary
  Sundays at the booklet's own size.

## Measured (2026-11-17, local, real `booklet.js` paginator) — before

- **Book (Chrysostom):** 35 pages, so 36 for saddle-stitch.
  2026–2028: 114 of 114 claimed Sundays fit, 0 misfits.
- **Insert, all 38 ordinary Sundays of 2027**, half-pages (8 = 2 sheets, 12 = 3):

  | hymn size | 8 | 9 | 10 | 11 | 12 | 13 |
  |---|---|---|---|---|---|---|
  | 15pt / 1.75 (booklet) | | | 1 | 24 | 10 | 3 |
  | 13pt / 1.5 | 5 | 27 | 5 | 1 | | |
  | 12pt / 1.45 | 26 | 11 | 1 | | | |

  **Two sheets is not reachable for every Sunday at ≥12pt with the whole
  stretch on the insert.** Open decision. See the session handoff.

## Not yet built (the plan)

2. Mixam print-ready PDF (reading order, ×4 pages, bleed/trim).
3. Server-side fold-order PDF of the insert (iOS ignores `@page size`).
4. Basil and Paschal editions (same code, new configs and stretches).
5. Edition freeze workflow (record what was sent to Mixam), Thursday insert job.
