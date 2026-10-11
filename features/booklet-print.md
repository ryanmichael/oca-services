# Booklet printing

**Status:** shipped 2026-10-10 (round 4, `mobile-experience`)
**Contract test:** `test/contracts/booklet-print.test.js`
**Module:** `public/scripts/booklet.js` · styles scoped under `#bk-root` in `main.css`
**Background:** `docs/BOOKLET-CONTEXT.md` — why the object matters and what the
imposition is doing

## What changed

The booklet began life in a **popup** (`window.open` + `document.write`), which
phones block by default — and the print button was `display: none` below 768px
anyway, so printing from a phone was absent, not degraded.

Building it inside the app document instead fixed the popup problem and
introduced a worse one: the booklet had to share a page with the app shell, and
lost a different fight every time.

| Symptom on a real iPhone | Cause |
|---|---|
| Whole booklet printed as one blank page | `html, body { height: 100%; overflow: hidden }` — the app shell — clipped print to one viewport-height page |
| Still one blank page | `#bk-root` was `position: fixed`; **WebKit prints an out-of-flow subtree on the first page only and never paginates it** |
| Service text drawn over the date list | `#bk-measure` is `position: absolute`, and an abspos element is not clipped by an ancestor's `overflow` unless that ancestor is its containing block |

Three fixes, three new collisions. That is the signature of a wrong design, not
bad luck. **The booklet is now its own page** — `/booklet`, served by
`server-lib/routes/booklet-page.js`, containing the booklet and nothing else.

What that buys:

- **No shell to collide with.** `@page` can be static, the spreads are simply
  visible, and what shows on screen is what prints.
- **It is a navigation, not a popup**, so phones do not block it.
- **The app carries no booklet DOM and does not load the module**, so the
  bleed class of bug cannot recur there at all.
- **`window.print()` fires synchronously inside the tap.** It used to run after
  a promise chain; iOS is unreliable about a print arriving after the gesture
  has ended.
- **You can see the spreads before printing** — the affordance the popup had
  and the in-document version lost.

`public/scripts/booklet-impose.js` — a complete, tested, never-called rival
implementation — was deleted along the way, as `docs/BOOKLET-CONTEXT.md` asks.

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
- **INV-9** — printing is not clipped to one page by the app shell.
- **INV-10** — the booklet subtree is **in flow** when `print()` is called.
- **INV-11** — the booklet occupies no space on screen, before or after
  visiting the print screen.

## The three things that bite

**The stylesheet is scoped on purpose.** It redefines global selectors —
`.svc-head`, `.rubric`, `.svc-rule`, even `*`. Harmless in a popup; in-document
those rules would repaint the panel the user is reading the moment the file
loads. Everything lives under `#bk-root`. The corollary is that the hidden
**measuring probe must be appended inside `#bk-root`**, not to `document.body`
as the popup did, or it measures with the app's fonts and every height — and so
every page break — is wrong. INV-5 guards the first half of this; the second
half shows up as a silently wrong page count, so change it carefully.

**`#bk-root` is parked with a zero-height clip, NOT out of flow.**
`display: none` would zero every measured height, so it cannot be hidden — but
it must not be `position: fixed` or `absolute` either: **WebKit prints an
out-of-flow subtree on the first page only and does not paginate it.** Parked
at `left: -10000px`, that is exactly one empty page, which is what an iPhone
produced for a 31-sheet booklet. `height: 0; overflow: hidden` keeps the
subtree in normal flow — so it paginates — while taking no space and showing
nothing, and children keep real measurable geometry.

`#bk-root` is also `position: relative`, and that is load-bearing: `#bk-measure`
is `position: absolute`, and **an absolutely positioned element is not clipped
by an ancestor's `overflow` unless that ancestor is its containing block.**
Without it, a 53,000px measure copy escaped the clip and painted across the
page. `#bk-measure` is additionally `display: none` — it only ever supplies
`outerHTML`, never geometry, so it does not need laying out at all.

Every inline style `enterPrintState()` sets **must** be reset in `cleanup()`.
iOS frequently never fires `afterprint`, so anything left behind simply stays
on the page; a leaked `visibility: visible` put a 29,000px booklet over the
service list.

The printing geometry is additionally forced **inline from JS**
(`enterPrintState()`), not left to `@media print` alone. Relying on a media
query to un-hide the only thing being printed is a single point of failure
whose failure mode is a blank page with nothing to debug.

**`@page` is document-global and cannot be scoped.** The document declares
`size: letter; margin: 1in` for Standard print; the booklet needs
`size: 11in 8.5in; margin: 0`. The booklet rule is injected into `<head>` just
before printing and removed on `afterprint` (with a timeout fallback, because
Safari does not always fire it).

## The app shell clips print unless you stop it

`html, body { height: 100%; overflow: hidden }` is what lets the three views
scroll independently. Left in place while printing, **the output is clipped to a
single viewport-height page.** A 31-sheet booklet printed from an iPhone came
out as one empty page.

Chromium tolerates it — `page.pdf()` produced all 18 pages, and the e2e suite
was green — so this was invisible to every automated check and only showed up on
a real phone. INV-9 therefore asserts the *computed* `html`/`body` height and
overflow under print media rather than a rendered page count, so it holds on any
engine. The reset lives in the shared `@media print` block, not the booklet's:
Standard print had the same bug, and nobody could have found it while the print
button was hidden on phones.

## Testing print needs WebKit

Two separate bugs reached a real phone while every local check was green, and
both were WebKit-only:

1. the app shell clipping output to one page (INV-9);
2. the out-of-flow subtree never paginating (INV-10).

Chromium tolerated both. `page.pdf()` is Chromium-only, and
`emulateMedia({ media: 'print' })` swaps media-query evaluation **without
exercising the print layout path**, so neither reproduced either bug. WebKit is
now installed for Playwright (`npx playwright install webkit`) and is the only
local oracle for print behaviour — but note the contract tests assert computed
geometry at `print()` time rather than a rendered page count, precisely so they
fail on any engine rather than depending on which browser runs them.

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
