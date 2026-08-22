# Print booklet — context and design brief

A briefing for someone with **no access to the repository**, to think with about a
new print-booklet feature. Part 1 is why the app exists. Part 2 is the physical
problem. Part 3 is how imposition actually works. Part 4 is what is built today,
honestly. Part 5 is the open design space.

---

# Part 1 — What the app is for

## The immediate purpose

Generate the complete text of an Orthodox Christian service — every hymn, psalm,
litany and rubric, in the right order, for **any given date** — and put it in a
choir's hands in a form they can sing from.

## Why that is hard

An Orthodox service is not a fixed text. It is **assembled** at the moment of
celebration from several independent cycles that happen to collide on that date:

- an eight-week cycle of resurrection hymns (the **Octoechos**), rotating by
  "tone", a melodic mode
- a fixed calendar of saints, one volume per month (the **Menaion**)
- a movable Lenten cycle and a movable Paschal cycle, both keyed to Pascha,
  which itself moves
- feasts that cast a shadow forward and backward — a **forefeast**, an
  **afterfeast**, a **leavetaking** — and displace or merge with whatever else
  falls in that window

On an ordinary Sunday two or three of these are in play. On a Sunday that is also
the leavetaking of a great feast *and* carries a ranked saint, four or five are,
and the rules for who yields to whom are the accumulated practice of centuries.

The practical consequence: **a parish choir cannot simply own a book.** The text
for next Sunday exists in six or seven volumes, and assembling it means knowing
which page of each, in what order, in which tone, how many of each hymn, and
which hymn claims the two doxology slots near the end of each group. Most
parishes do this by hand, weekly, and it is skilled, unpaid, and thankless.

## What the app replaces

Before: someone spends two or three hours on a Saturday with a stack of books and
a photocopier, producing a stapled sheaf for the choir. That person is usually
also the choir director, and the work happens after a full week.

After: the service text is generated for the date, in the parish's own
translation and register, with the parish's own practices applied — and printed.

## Who it is actually for

The choir stands. For two hours. Often without seating, frequently holding a
candle, in a room where the lighting is designed for icons and not for reading.
They need to find their place instantly after looking up, and they turn pages
while singing.

This is the fact that makes print a first-class feature rather than an
afterthought, and it is the reason the booklet matters:

- **A screen is a poor fit.** It sleeps, it glows in a dark nave, it needs a hand
  to scroll, and a dropped phone during a service is a small catastrophe.
- **A stack of loose paper is worse.** It fans, it falls, the order goes wrong,
  and it makes noise.
- **A booklet is the right object.** It stays open, it holds its order, it turns
  quietly, it can be marked up, and at the end of the service it can be thrown
  away without guilt — which matters, because next week's is a different text.

The design target is therefore not "a printable page." It is **a physical object
a person can hold and sing from**, produced on a parish office printer by someone
who is already tired.

---

# Part 2 — The physical problem

The goal, stated as the user experiences it:

> Click Print. Take the stack out of the printer. **Fold it once.** Sing.

No collating, no reordering, no stapler, no trimming. One fold.

That is a **saddle-stitch booklet**: sheets printed on both sides, stacked,
folded together through the middle. Each physical sheet of US Letter, folded,
yields **four half-letter pages** (5.5" × 8.5") — a comfortable size to hold.

Two consequences fall straight out of the geometry:

1. **Page count is always a multiple of four.** 13 pages of content means a
   16-page booklet with 3 blanks. Where those blanks land is a design decision,
   not an accident.
2. **The pages are not printed in reading order.** Page 1 and the *last* page
   share one side of one sheet. This is the whole problem, and it is called
   **imposition**.

### The "no staples" constraint is real

A single fold with no stitching holds well for about 4–6 sheets (16–24 pages).
Past that the stack splays and the inner pages slide out. A Great Vespers lands
in roughly the right range, but this ceiling is a genuine design constraint —
it argues for controlling page count deliberately rather than letting it fall
where it may.

---

# Part 3 — How imposition works, from first principles

## The intuition

Take two sheets of paper. Stack them, fold them together, and number the pages
you see, 1 through 8. Now unfold them and look at what is where.

You find that **page 1 is on the same side of the same sheet as page 8** — page 1
on the right half, page 8 on the left. They are neighbours on the paper and
opposite ends of the book. Turn that sheet over and you have pages 2 and 7.

That is imposition. Working from the outside in, each sheet carries one page from
the front of the book and one from the back, and their numbers always sum to
N + 1.

## The formula

For `N` pages (padded to a multiple of 4) and sheets numbered `k = 0` for the
outermost:

```
Sheet k, front side:   left = N - 2k        right = 2k + 1
Sheet k, back side:    left = 2k + 2        right = N - 2k - 1
```

For an 8-page booklet on 2 sheets:

```
            LEFT   RIGHT                          fold
sheet 0  front:  [  8  |  1  ]   <- outermost      |
         back:   [  2  |  7  ]                     |
sheet 1  front:  [  6  |  3  ]   <- innermost      |
         back:   [  4  |  5  ]                     |
```

Stack sheet 0 on sheet 1, fold, and read: 1, 2, 3, 4, 5, 6, 7, 8. The front cover
is the right half of sheet 0's front; the back cover is its left half.

## The part that actually bites: the duplex flip

Getting the *order* right is arithmetic. Getting the *orientation* right is where
this becomes an engineering problem, because it depends on hardware.

When a printer prints the second side, it flips the sheet — and there are two
ways to flip:

- **Long-edge binding** — flips about the sheet's long edge
- **Short-edge binding** — flips about the short edge

For a **portrait** page the long edge is vertical, so long-edge flipping works
like turning a page in a book and the back side comes out upright. This is why
long-edge is everyone's default.

But booklet sheets are fed as **landscape** (11" × 8.5"). Now the long edge is
*horizontal*, and flipping about it turns the sheet like a wall calendar — so
**the back side lands upside down**. The correct setting for landscape duplex is
short-edge binding, which is not the default, is described differently by every
driver, and is the single most common way this goes wrong.

The software response is to **pre-rotate the back spreads 180°** so that the
printer's flip cancels out. That works, but only if you know which way this
particular printer flips.

### The two unknowns

Everything that varies between one parish's printer and another's reduces to two
booleans:

1. **Is duplexing available at all?** If not, the job has to be split into a
   front pass and a back pass with the user re-feeding the stack.
2. **Does the back side come out rotated 180°?** Long-edge vs short-edge, driver
   defaults, and "flip on short edge" checkboxes all collapse into this.

Four combinations. Every printer is one of them, permanently. **This is a
calibrate-once problem, not a per-print problem** — which is a much better
problem to have, and Part 5 argues it should be treated as one.

## The strategy question: who does the 2-up?

There are two ways to get two half-pages onto one landscape sheet, and choosing
correctly matters more than any other decision here.

**Strategy A — let the browser do it.** Emit half-letter pages in sequence and
ask the user to select "2 pages per sheet" in the print dialog. Tempting, because
the imposition is then a flat reordering of a list.

It is a trap. Browser N-up is not standardised — Chrome, Safari and Firefox order
and rotate the pair differently, drivers add their own scaling and margins, and
it hands the user four settings to get right (landscape, 2-up, duplex mode,
paper) instead of one. Worse, it fails *silently and plausibly*: you get a
booklet, it is simply the wrong one.

**Strategy B — do it ourselves.** Emit pages that are already physical sheets:
landscape US Letter, each containing two half-letter panels side by side, in
imposed order. Declared in CSS as `@page { size: 11in 8.5in; margin: 0 }`.

The user then prints at 100% scale, **1 page per sheet** (the default), duplex.
The browser's N-up feature is entirely out of the loop, and the only variable
left is the duplex flip.

**Strategy B is correct**, and it is what the working implementation does. This
is worth stating plainly because the repository still contains an artifact of
Strategy A — see Part 4.

---

# Part 4 — What exists today

## It works, and it lives in the browser

The live implementation is `printBooklet()` in `public/scripts/app.js`. It opens
a popup window, injects the service content plus a self-contained script, and
that script paginates and imposes before calling print.

- `@page { size: 11in 8.5in; margin: 0 }` — Strategy B, one landscape spread per
  print page.
- `buildSpreadsDuplex()` — the formula above, emitting `{ left, right, rotate }`.
- `buildSpreadsSingle()` — a non-duplex fallback: all fronts, then all backs, for
  manual re-feeding.
- Two calibration toggles, `duplex` and `rotateBack`, persisted to
  `localStorage`. These are the two booleans from Part 3.
- Typography is deliberate: EB Garamond for text, Cinzel small-caps for section
  headings, 15pt at 1.75 line-height.

## A stale rival implementation is still shipped

`public/scripts/booklet-impose.js` is loaded by `index.html` and **never
called** — nothing references `imposeBooklet`. It is a complete, tested,
documented Strategy A module, calibrated by experiment against one specific
printer whose front sides came out "reversed and upside down."

It is worth reading once for the history and then deleting. Its header comment
confidently documents printer behaviour that is a property of *one* device, and
its unit tests all pass, which makes it look authoritative. **A well-tested
module that nothing calls is a trap for the next reader** — and its presence
alongside three stale task-prompt files at the repo root
(`booklet-print-prompt.md`, `booklet-print-calibrated.md`, `fix-booklet-blanks.md`)
means someone brainstorming here will find two contradictory designs and no
marker saying which one won.

## Pagination is hand-rolled, in JavaScript, at print time

This is the most consequential design choice in the current code, and the one
most worth revisiting.

Rather than letting CSS break content across pages, the script measures every
element and packs them:

- flattens the service into items, splitting multi-line blocks at `<br>` so
  pagination can land between lines of a hymn
- measures each item's real rendered height in a hidden container
- greedily fills a page to a fixed content height
- honours a `keepWithNext` chain so a section heading, a stichos label and the
  hymn they introduce cannot be separated
- refuses to leave a sliver shorter than `MIN_SPLIT` at the bottom of a page

The liturgical motivation is sound — a heading stranded at a page foot, or a
troparion split mid-phrase, is a real problem for someone singing. An earlier
version forced a page break after every section and produced a booklet that was
mostly white space, which is what `fix-booklet-blanks.md` was written to correct.

But the cost is high:

- it runs **in a popup**, so it depends on popups being allowed
- it depends on **web fonts having loaded** before measuring, or every height is
  wrong
- it is **untestable** by anything in the project's substantial test apparatus —
  no contract test can assert "this service is 12 pages and page 5 opens with
  the Aposticha," because pagination only exists inside a browser at print time
- it can drift silently with a browser update

For a project whose entire discipline is *assert the structure, then guard it
with a rule*, the booklet is the one significant output with no rule at all.

---

# Part 5 — The design space

Open questions, roughly in order of how much they would improve the object.

### 1. Calibration should be a ritual, not a setting

Today the two booleans are toggles the user flips until the output looks right —
trial and error, several wasted sheets, and no confidence they got it right.

Better: **a one-sheet calibration print.** A single landscape sheet, duplexed,
front marked `FRONT — TOP` and back marked with an orientation arrow. The user
prints it, looks at it, and answers one question with four picture options: *which
of these did your printer give you?* Store the answer per browser. Never ask
again.

This converts the worst part of the experience — an unbounded fiddle — into a
bounded, one-time, sixty-second task. It is probably the single highest-value
item here.

### 2. Move pagination and imposition to the server

Render the booklet server-side and deliver a **PDF**. This would:

- make output deterministic and identical on every machine
- remove the popup, the font-loading race, and the browser dependency
- make the booklet **testable** — page count and page-start assertions become
  ordinary contract tests, which is how everything else in this project is
  guarded
- let a parish email the PDF, or print it from a phone

Cost: a rendering dependency the project currently does not have (it runs on two
npm packages), and losing the immediacy of print-from-the-page. Worth weighing
carefully rather than assuming.

### 3. Deliberate page-count control

Since the object must be a multiple of four, and the no-staples ceiling is around
24 pages, page count should be a **target, not an outcome**.

Given a service that lands at 13 pages, the options are: pad to 16 with three
blanks, or tighten leading and margins slightly to fit 12. A "fit to 12 pages"
control — nudging type size and leading within a typographically safe range —
would produce a better object than padding. Choir directors already do this by
hand in word processors.

### 4. The blanks are an opportunity

Padding currently appends blank pages at the end, which puts them on the inside
back and the back cover. For a service booklet those are prime real estate:

- **back cover**: parish name, next Sunday's service and tone, the week's
  commemorations
- **inside back**: a notes page choirs will actually use, or the week's announcements
- **front cover**: a real cover — feast, date, tone, principal commemoration —
  rather than the text starting immediately

A booklet with a designed cover and back is a different object from a folded
printout, at nearly zero cost.

### 5. Creep

On a folded stack, inner sheets protrude slightly past outer ones, so the outer
margins drift inward as you go in. At 4–6 sheets of ordinary paper this is a
millimetre or two — probably below the threshold that matters for something
disposable. Worth naming so it is a decision rather than an oversight, and worth
revisiting only if longer booklets (Holy Week) come into scope.

### 6. Editions from one engine

The imposition engine is content-agnostic. Once it is solid, the same machinery
prints a **choir edition** (full text, all hymns), a **clergy edition** (rubrics
and priest's parts emphasised), a **faithful edition** (responses and hymns sung
by all, much shorter — likely a single sheet), and a **large-print edition** for
older singers, which changes pagination but nothing else.

This is where the feature earns its keep: the hard part is the assembly and the
imposition, and both are already shared.

### 7. Page-turn awareness — the liturgically-informed idea

A purely typographic paginator breaks pages wherever content runs out. A
*liturgically* aware one knows that some moments are bad places to turn a page:
mid-troparion, between a stichos verse and the hymn it introduces, or in the
middle of a litany's call-and-response.

The current `keepWithNext` chain is a first approximation of this. A fuller
version would use what the assembler already knows — every block carries a type
(`rubric`, `prayer`, `hymn`, `verse`, `response`, `doxology`), a speaker, and a
section — to weight break candidates: never between `verse` and the `hymn` that
follows it; prefer a break at a section boundary; never strand a `doxology` from
its hymn.

**This is the one idea on this list that no general-purpose tool could offer**,
because it requires knowing what the text *is*. It is the strongest argument for
the booklet living inside this application rather than being handed to a print
utility.
