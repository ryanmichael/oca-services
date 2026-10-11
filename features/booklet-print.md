# Booklet printing

**Status:** shipped 2026-10-10 (round 4, `mobile-experience`)
**Contract test:** `test/contracts/booklet-print.test.js`
**Module:** `public/scripts/booklet.js` · styles scoped under `#bk-root` in `main.css`
**Background:** `docs/BOOKLET-CONTEXT.md` — why the object matters and what the
imposition is doing

## What changed

The booklet used to be built in a **popup** (`window.open` + `document.write`).
Phones block popups by default, and the print button was `display: none` below
768px anyway — so printing from a phone was not degraded, it was **absent**, and
the hidden button hid the fact.

It now renders into the live document. Three consequences:

- it works on a phone;
- the desktop popup-blocker failure goes away;
- pagination and imposition become **testable**. `BOOKLET-CONTEXT.md` called the
  booklet "the one significant output in this project with no rule at all",
  because nothing could reach inside a popup at print time. The invariants below
  are the first it has ever had.

`public/scripts/booklet-impose.js` — a complete, tested, never-called rival
implementation — was deleted in the same change. Two contradictory designs with
no marker saying which won is worse than either.

## Invariants

- **INV-1** — duplex imposition of 8 pages is `[8|1] [2|7*] [6|3] [4|5*]`; the
  starred spreads are the backs, rotated for a long-edge flip. Folded, it reads
  1→8.
- **INV-2** — a page count that is not a multiple of four is **padded**, never
  truncated. Every content page survives imposition.
- **INV-3** — single-sided emits every front, then every back, so the stack is
  re-fed once.
- **INV-4** — the booklet builds in this document. **No popup is opened**, every
  spread reaches the DOM, and each spread is exactly two half-pages.
- **INV-5** — the booklet stylesheet does not restyle the live service panel.
- **INV-6** — a phone has a print control, ≥44px, anchored bottom-right, with an
  accessible name.
- **INV-7** — Booklet is the first and primary option; Standard is subordinated,
  never hidden.
- **INV-8** — duplex defaults **off** on a phone and **on** at a desk.

## The three things that bite

**The stylesheet is scoped on purpose.** It redefines global selectors —
`.svc-head`, `.rubric`, `.svc-rule`, even `*`. Harmless in a popup; in-document
those rules would repaint the panel the user is reading the moment the file
loads. Everything lives under `#bk-root`. The corollary is that the hidden
**measuring probe must be appended inside `#bk-root`**, not to `document.body`
as the popup did, or it measures with the app's fonts and every height — and so
every page break — is wrong. INV-5 guards the first half of this; the second
half shows up as a silently wrong page count, so change it carefully.

**`#bk-root` is parked off-screen, not hidden.** `display: none` would zero
every measured height. It is `position: fixed; left: -10000px` on screen, and
switched to static while printing.

**`@page` is document-global and cannot be scoped.** The document declares
`size: letter; margin: 1in` for Standard print; the booklet needs
`size: 11in 8.5in; margin: 0`. The booklet rule is injected into `<head>` just
before printing and removed on `afterprint` (with a timeout fallback, because
Safari does not always fire it).

## Mobile

Measured on iOS Chrome, 2026-10-10:

**iOS ignores `@page { size }`** and starts the dialog in **portrait**. Choose
Landscape by hand and the spread prints correctly. Nothing in CSS fixes this —
WebKit has never really supported `@page size` — so the print screen shows a
landscape hint, gated on `isIOS()` rather than on "is mobile", because desktop
Chromium honours the rule unaided and the hint would be noise there. **Android
is unverified**; being Chromium it is expected to honour `@page`, so it
currently gets no hint.

**Duplex defaults off on phones.** A phone user is often not at a duplexing
copier. Guessing wrong in that direction wastes a stack of paper and folds into
nonsense; guessing wrong the other way costs one toggle. The choice persists per
device in `localStorage`, so it is a one-time decision either way.

Duplex was observed failing on one printer even when selected — cause not
established. The leading theory is that the full-bleed `margin: 0` test page put
the driver into a borderless mode, which commonly disables duplex; the real
booklet has white margins inside each half-page. Worth revisiting with real
printers rather than more spiking.

## Still open

- **Pagination is still measured in JavaScript at print time** and depends on
  web fonts having loaded (`document.fonts.ready` is awaited before measuring).
  `BOOKLET-CONTEXT.md` §5.2 proposes moving it server-side for determinism.
  The mobile spike showed a PDF is *not* required to print from a phone, so that
  trade is now about determinism and testability alone, not reach.
- **A real duplex print has not been checked for fold centring.** A uniform
  scale keeps the fold centred; a non-uniform one does not, and a print preview
  cannot tell them apart.
- `BOOKLET-CONTEXT.md` §5.1 proposes replacing the two calibration toggles with
  a one-sheet calibration print. `printTest()` and the "Print a test sheet" link
  are the seed of that, but it is still a toggle, not a ritual.
