# Feature: choosing between a hymn row's label and its slot's

## Problem

A Vespers slot carries one label — the principal commemoration's title — over N
stichera. On a day where one commemoration hosts two saints' hymns, that title is
wrong for some of them. On 2026-08-30 all seven menaion stichera at Lord, I Call,
plus the Glory and the Aposticha Glory, printed as **"Saint Alexander, Patriarch
of Constantinople"** — including the four that are the Forerunner's.

## What N3 prescribed, and why it is wrong

The backlog's fix was `s.label || primary.title` at seven sites in
`server-lib/assemble/for-date.js`. **Do not do that**, and none of those seven
lines changed. A blanket "row label wins" is a downgrade almost everywhere: most
labelled rows carry a generic category incipit — "the holy martyrs", "the
venerable one", "the feast" — which is strictly less informative on a choir sheet
than the title the slot already supplies. Measured: 1,451 of 2,390 labelled
lordICall rows.

The choice is a **rendering** decision, and it already had a home:
`lord-i-call.js` had a `mixedSlots` mechanism for exactly this, added for the
2026-08-16 Dormition/Image case. It did not fire on 8-30 because its
`labelSubject` only understood the `(for X)` / `from X` form and returned null
for the entire bare-descriptor family.

## Rule

`assemblers/_shared/hymn-label.js` holds the rule; `lord-i-call.js` and
`aposticha.js` both consume it, so the two cannot drift apart again.

1. **`labelSubject(label)`** — the subject a label names, or null. Reads both the
   `(for X)` / `from X` form and the bare descriptor (`the holy forerunner`).
   Slot markers (`Glory`, `Theotokion`) return null; admitting them would make
   every slot holding a Glory row look mixed.
2. A slot is **mixed** when its hymns name more than one distinct subject.
3. In a mixed slot, **`preferRowLabel(row, slot)`** picks per hymn: the slot's
   title when the row belongs to the slot's own commemoration — detected by a
   shared content word, allowing containment so `feast` matches `Afterfeast` —
   and the row's own label otherwise. A row whose label has no content words can
   never outrank a title.
4. Genre and book words (`stichera`, `troparion`, `triodion`, …) are stopwords.
   They name the kind of hymn, never its subject.
5. The Aposticha **"Now and ever"** slot keeps the narrow rule: only an explicit
   `(for X)` / `from X` label may override its structural heading.

## Invariants

- **INV-1** — 8-29 Lord, I Call: the Forerunner's stichera are not labelled for
  the hierarchs, and vice versa. Anchored on hymn TEXT, so it cannot pass on a
  relabelled wrong hymn.
- **INV-2** — 8-29 Aposticha Glory is labelled for the Forerunner.
- **INV-3** — a bare descriptor never displaces the principal's own title:
  2026-10-16 keeps "Prophet Hosea" on Hosea's hymns while the co-commemorated
  saint's carry "the venerable martyr".
- **INV-4** — the Aposticha "Now and ever" keeps its structural label against a
  mis-keyed row: 2026-11-27 row 9466 is a Theotokion carrying the label "the
  venerable martyr".
- **INV-5** — an explicit `(for X)` label still wins at "Now and ever":
  2026-08-16 sings the Dormition's sticheron there and the Image's at the Glory.
- **INV-6** — `labelSubject` reads both forms and rejects slot markers.
- **INV-7** — `preferRowLabel` keeps the slot title for the slot's own subject,
  including the containment and genre-stopword cases.

## Blast radius

45 of 365 days change, labels only — no text, tone, order or slot count moves.
Most are a parenthetical melody incipit giving way to the real title
("(for St. Athanasius) (As one valiant among the martyrs)" → "Saint Athanasius
the Great, Archbishop of Alexandria"). The rest replace a *false* specific title
with a *true* but vaguer descriptor, which is the point.

## Known consequence: bad label data is now visible

Where a row's descriptor wins, whatever is in the DB prints. Three artifacts this
surfaced, all pre-existing and none created by this change:

- `the holy unmecinaries` (6-27) and `the holy unmercinaries` (10-31) — typos.
- `the holy martyr: 4` (7-29) — a glued footnote digit, the N6 class.
- Row 9466 (11-28) — a Theotokion labelled `the venerable martyr`. INV-4 guards
  the rendering; the row itself is still wrong.
