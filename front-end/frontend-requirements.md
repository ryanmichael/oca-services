# Frontend Requirements — Orthodox Daily Services

This document is the authoritative **engineering spec** for implementing the frontend. The approved interactive prototype is `front-end/prototype.html` — match it visually and behaviorally exactly.

The canonical **design philosophy** (durable principles, anti-patterns, brand posture) lives at [`../STYLE.md`](../STYLE.md). When the two documents disagree on intent, `STYLE.md` is authoritative; this document captures the implementation that flows from it.

---

## Design Principles

- **Prayer book aesthetic** — not a tech product. No rounded pill buttons, no card shadows, no bright colors.
- **Typography-first** — generous line height, warm parchment tones, Cinzel for headings/labels, EB Garamond for all reading text.
- **Focused and quiet** — every interaction should feel considered. Nothing competes for attention.
- **Full-screen transitions** — Search and Calendar both take over the entire viewport. No modals, no popovers, no overlays.
- **Mobile-first** — all takeover views are thumb-optimized on small screens.

---

## Color Tokens

```css
--bg:      #F5F0E8;  /* warm parchment — page background */
--surface: #FAF7F2;  /* slightly lighter — header, panel */
--text:    #1A1209;  /* near-black warm — body text */
--rubric:  #8B1A1A;  /* liturgical red — accents, active states */
--gold:    #C9A84C;  /* rule dividers, hover borders */
--muted:   #6B6358;  /* metadata, labels, placeholder text */
--border:  #DDD5C4;  /* structural lines */
```

---

## Typography

| Use | Family | Size | Weight | Style | Notes |
|-----|--------|------|--------|-------|-------|
| Section headings, UI labels | Cinzel | 9–13px | 400 | normal | All-caps, letter-spacing .1–.2em |
| Day-of-week, date | Cinzel | 12px | 400 | normal | |
| Service names in list | EB Garamond | 16px | 400 | normal | |
| Prayer text | EB Garamond | 16–17px desktop / 19px mobile | 400 | normal | Line-height 1.88 desktop / 2 mobile |
| Rubrics | EB Garamond | 14px desktop / 17px mobile | 400 | italic | Color: --rubric |
| Feast names | EB Garamond | 15px | 400 | italic | Color: --muted |
| Verses / sticheron labels | EB Garamond | 13–14px desktop / 15–16px mobile | 400 | italic | Color: --muted |
| Search input | EB Garamond | 22px desktop / 19px mobile | 400 | normal | |
| Search results | EB Garamond | 18px | 400 | normal | |
| Calendar grid days | EB Garamond | 16px desktop / 18px mobile | 400 | normal | |
| Calendar feast list | EB Garamond | 17–18px | 400 | normal | |
| Calendar month title | Cinzel | 15px | 400 | normal | Letter-spacing .1em |

Load from Google Fonts:
```
https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap
```

---

## View Architecture

The app has **three full-screen views** that occupy the same fixed viewport. Only one is visible at a time. All transitions are animated consistently.

```
.view-main    — default, always rendered, visible on load
.view-search  — search experience, triggered by SEARCH button
.view-cal     — calendar date picker, triggered by CHANGE button
```

All three are `position: fixed; inset: 0; display: flex; flex-direction: column`.

### Shared transition pattern

**Exiting to background (view-main when overlay opens):**
```css
transform: translateY(20px); opacity: 0; pointer-events: none;
transition: transform .38s cubic-bezier(.4,0,.2,1), opacity .28s ease;
```

**Entering from foreground (search or calendar opening):**
```css
/* Resting: */ transform: translateY(32px); opacity: 0; pointer-events: none;
/* Visible: */ transform: translateY(0);    opacity: 1; pointer-events: all;
transition: transform .38s cubic-bezier(.4,0,.2,1), opacity .28s ease;
```

---

## View: Main

### Header
- Fixed height: 52px
- Background: `--surface`, border-bottom: 1px `--border`
- Contents: ☩ cross (color: `--rubric`, 18px) · App title in Cinzel · "About" link right-aligned

### Sub-bar (sticky)
- Height: 44px, padding: 0 32px; sticky within scrollable center column
- Left: week range label in Cinzel 10px `--muted` — updates via IntersectionObserver as user scrolls
- Right: SEARCH button and DATE button
- Button style: no fill, 1px `--border`, Cinzel 10px, `--muted`; hover/active: border + text → `--rubric`

### Service List
- Padding: 28px 32px 60px
- Date blocks separated by 32px margin
- Date block heading: day-of-week (Cinzel, `--rubric`) · date (Cinzel, `--text`) · feast (EB Garamond italic, `--muted`)
- Gold rule (1px, `--gold`) beneath heading
- Service rows: full-width buttons, 2px left-border indicator
  - Default: transparent border
  - Hover: `--gold` border, faint gold background
  - Active: `--rubric` border, faint rubric background
  - "VIEW →" in Cinzel 9px `--rubric` — hidden by default, visible on hover/active
- Coming-soon rows: opacity 0.35, pointer-events none, "COMING SOON" label

### Right Panel

**Desktop** (>640px):
- Slides in from the right; width 70vw when open, 0 when closed
- Transition: `width .28s cubic-bezier(.4,0,.2,1)`

**Mobile** (≤640px):
- Full-screen takeover: `position: fixed; inset: 0; width: 100%`
- Slides in from the right: `transform: translateX(100%)` → `translateX(0)`
- Transition: `transform .32s cubic-bezier(.4,0,.2,1)`
- No left border

**Both:**
- Panel header: ✕ close (left), PRINT (right), service name, date + tone string
- Below the date, a thin `--border` rule followed by an expandable detail row (see below)
- Panel body: scrollable, 24px 22px 48px padding (desktop) / 20px 20px 56px (mobile)
- Clicking a different service row updates panel content in place; detail section collapses on each new open

### Panel Detail Toggle

The panel header has a collapsible section for commemorations and pronoun selection. It is **closed by default** every time a service is opened.

**Toggle button** (`.panel-detail-toggle`):
- Full-width, borderless button spanning the panel header width
- Left: text label (`.pdt-label`) in Cinzel 9px `--muted`, letter-spacing .16em
- Right: small square icon (`.pdt-icon`) — 16×16px, 1px `--border`, centered glyph
- Hover: label and icon border/glyph transition to `--rubric`
- Separated from the date string above by a 1px `--border` top border

**Icon states:**
- **Closed**: [+] plus sign SVG (two perpendicular lines)
- **Open**: [−] minus sign SVG (single horizontal line)
- No rotation — the plus and minus are separate SVG elements toggled with `display: none/block`
- When open: icon border and glyph become `--rubric`, label becomes `--rubric`

**Label text** is dynamic and updates in two situations:
1. When a new service is opened — reflects the count of commemorations for that date
2. When the user changes the pronoun selection — reflects the active pronoun

Label format:
```
// No commemorations:
"YOU / YOUR"   or   "THEE / THY"

// With commemorations:
"1 COMMEMORATION · YOU / YOUR"
"3 COMMEMORATIONS · THEE / THY"
```

**Collapsible body** (`.panel-detail-body`):
- Animates with `max-height` transition: `0 → 320px`, `.28s cubic-bezier(.4,0,.2,1)`
- Opacity: `0 → 1`, `.22s ease`
- Contains two things, in order:
  1. **Commemorations list** (`.p-saints`) — one `.p-saint` div per saint/feast; major feasts get `font-weight: 500`; hidden entirely if no saints for this date
  2. **Pronoun toggle** — "PRONOUNS:" label + two radio inputs (Thee / Thy · You / Your); changing selection re-renders panel text live and updates the toggle label above

**Saints data** is keyed by date ID and passed into `openPanel()`. Each entry:
```js
{ name: string, major: boolean }
```

### Service Text Elements
```
.svc-head    — Cinzel 10px all-caps, centered section title
.svc-rule    — 1px gold horizontal rule
.rubric      — EB Garamond italic 14px --rubric
.prayer      — EB Garamond 16px line-height 1.88
.stich-label — EB Garamond italic 13px --muted
.verse       — EB Garamond italic 14px --muted
```

---

## View: Search

Triggered by the SEARCH button. Shares the same full-screen takeover pattern as the calendar view.

### Structure
```
[search-hdr]          — desktop only: ← BACK button
[search-content]      — flex column, fills remaining height
  [search-input-wrap]   — input field
  [search-hint-area]    — suggestion tags (idle state)
  [search-spinner-wrap] — loading spinner
  [search-results-area] — results list
[search-close-bottom]  — mobile only: centered CLOSE button
```

### Search Header (desktop only)
- 52px, `--surface`, same border as main header
- ← BACK button only (Cinzel 10px `--muted`; hover: `--rubric`)
- Hidden on mobile (`display: none` at ≤640px)

### Search Input (in body, not header)
- `.search-input-wrap`: padding 32px desktop / 20px mobile; border-bottom 1px `--border`
- Input row: search icon + EB Garamond 22px/19px field + ✕ clear button
- ✕ hidden until input has value; hover color: `--rubric`
- Focus-within: border-bottom becomes 1.5px `--rubric`
- Entrance: `opacity 0→1`, `translateY(8px→0)`, `.3s ease`, 100ms after view opens

### Suggestion Tags (idle state)
- Shown when input < 2 characters
- "SUGGESTIONS" eyebrow in Cinzel 9px `--muted`
- Tags: Cinzel 9px, 1px `--border`; hover: `--rubric` border + text
- Clicking a tag fills input and fires search immediately
- **Mobile**: `margin-top: auto` pushes tags to bottom of available space (thumb zone)
- Entrance: `opacity 0→1`, `translateY(8px→0)`, `.3s ease`, 80ms after input

### Loading Spinner
- Shown for ~380ms between query and results
- Ring: 24px diameter, 1.5px stroke, `--border` base, `--rubric` top arc
- `animation: spin 1.1s cubic-bezier(.5,.1,.5,.9) infinite`
- Centered, padding 64px 0 desktop / 80px 0 mobile

### Results
- "SAINTS & FEASTS MATCHING '[QUERY]'" eyebrow, border-bottom
- Rows: date (EB Garamond italic 14px `--muted`) · name (18px) · tag (Cinzel 8px)
- Available: "VIEW →"; unavailable: dimmed, "NO SERVICE"
- Matched text highlighted in `--rubric` via `<em>` (non-italic)
- Row hover: faint rubric background, 3px `--gold` left border
- Entrance: `opacity 0→1`, `translateY(10px→0)`, `.28s ease`

### Transition sequence: idle → loading → results
1. ≥2 chars typed → hint fades out, hides after 280ms
2. Spinner appears immediately
3. ~380ms later: spinner hides, results render, fade+slide in
4. Input cleared → results hide, hint returns via `requestAnimationFrame` double-tick

### Close behavior
- Desktop: ← BACK button or Escape key
- Mobile: centered CLOSE button at bottom
- On close: view-search fades out, view-main returns; input resets after 400ms
- If result picked: `jumpTo(id)` fires 280ms after close begins

---

## View: Calendar

Triggered by the **DATE** button (formerly "CHANGE"). Uses the **identical transition pattern** as the Search view — same enter/exit animations, same header-on-desktop / close-on-mobile structure.

### Structure
```
[cal-hdr]              — desktop only: ← BACK button
[cal-view-body]        — flex column, fills remaining height
  [cal-week-wrap]        — week label + ◀ strip ▶
  [cal-saint-strip]      — feast list for the current week
[cal-close-bottom]     — mobile only: centered CLOSE button
```

### Calendar Header (desktop only)
- Same 52px / `--surface` / border as main and search headers
- ← BACK button only
- Hidden on mobile

### Week Strip (`.cal-week-wrap`)
- Replaces the old monthly grid — shows exactly 7 days at a time (Sun–Sat)
- Structure: week label above, then a row containing ◀ · 7 tiles · ▶
- **Week label** (`.cal-week-label`): Cinzel 9px `--muted`, letter-spacing .18em; shows month name(s) + year (e.g. "MARCH 2026" or "MAR / APR 2026" when the week spans two months)
- **Arrows**: 32px desktop / 36px mobile, 1px `--border`; hover: `--rubric`; disabled (opacity 0.3, pointer-events none) at bounds of available data
- Shifting animation: strip does a brief `opacity 0 + translateX(12px)` fade-slide over 180ms, then re-renders and fades back in

### Day Tiles (`.cal-week-day`)
Each tile is a flex column with four elements in order, top to bottom:
```
.cwd-dow    — day of week: Cinzel 8px --muted (SUN MON ... SAT)
.cwd-num    — date number: EB Garamond 18px
.cwd-month  — month abbreviation: Cinzel 7px --muted (JAN FEB ... DEC)
.cwd-dot    — 4px circle, always present; transparent by default
```

The dot (`.cwd-dot`) is a **normal flex row element**, not a pseudo-element, so it can never overlap the month text. It becomes `background: var(--rubric)` only on `.cal-week-day.has-svc`.

Tile states:
- **Default**: `--muted` number, 1px transparent border, no pointer
- **Has available service** (`.has-svc`): `--text` number, pointer, rubric dot visible; hover: faint rubric background + 1px `--gold` border
- **Today** (`.today`): `--rubric` number + day-of-week, 1px `--rubric` border
- **Today + has service**: both classes apply

Entrance: `opacity 0→1`, `translateY(8px→0)`, `.3s ease`, 100ms after view opens

### Feast List (`.cal-saint-strip`, below strip)
- Eyebrow: "AVAILABLE SERVICES THIS WEEK" in Cinzel 9px `--muted`, border-bottom
- One row per feast in the **current week** (not month), sorted by day
- Row: date abbreviation (EB Garamond italic 14px `--muted`) · feast name (17px) · tag (Cinzel 8px)
- Available rows: "VIEW →", hover: faint rubric background + 3px `--gold` left border
- Unavailable rows: opacity 0.38, pointer-events none, "NO SERVICE"
- Updates in sync with each week shift
- Entrance: `opacity 0→1`, `translateY(8px→0)`, `.25s ease .08s`

### Week navigation logic
- `weekStart` tracks the Sunday of the currently displayed week
- `calShift(±1)` advances or retreats by 7 days; clamps to `WEEK_MIN` / `WEEK_MAX`
- On shift: strip fades out (`.shifting` class adds `opacity:0, translateX(12px)`), re-renders after 180ms, fades back in; feast list also re-renders

### Day / row selection
- Clicking an available tile or feast row closes the calendar and scrolls to that date block
- `jumpTo(id)` fires 280ms after close begins

### Close behavior
- Desktop: ← BACK or Escape
- Mobile: centered CLOSE button at bottom (same style as search close)
- On close: view-cal fades out, view-main returns; entrance animations reset after 400ms

---

## Mobile Breakpoint (≤640px)

```css
@media (max-width: 640px) {
  /* Both takeover views: hide desktop back, show bottom close */
  .search-hdr, .cal-hdr { display: none; }
  .search-close-bottom, .cal-close-bottom { display: flex; }

  /* Search specifics */
  .search-content { display: flex; flex-direction: column; }
  .search-hint-area { margin-top: auto; }
  #search-input { font-size: 19px; }
  .search-input-wrap { padding: 20px; }
  .hint-tag { padding: 10px 16px; }
  .result-row { padding: 16px 20px; }

  /* Calendar specifics */
  .cal-week-wrap { padding: 20px 16px; }
  .cal-arrow { width: 36px; height: 36px; }
  .cwd-num { font-size: 16px; }
  .cwd-dow { font-size: 7px; }
  .cal-week-day { padding: 8px 2px; }
  .cal-saint-strip { padding: 16px 20px 0; }
  .css-row { padding: 14px 0; }
  .css-name { font-size: 18px; }
  .cal-view-body { justify-content: space-between; }

  /* Panel: full-screen takeover */
  .panel {
    position: fixed;
    inset: 0;
    width: 100% !important;
    border-left: none;
    transform: translateX(100%);
    transition: transform .32s cubic-bezier(.4,0,.2,1);
  }
  .panel.open { transform: translateX(0); }
  .panel-inner { width: 100%; }

  /* Larger reading type for service text */
  .prayer      { font-size: 19px; line-height: 2; }
  .rubric      { font-size: 17px; }
  .verse       { font-size: 16px; }
  .stich-label { font-size: 15px; }
  .svc-head    { font-size: 11px; }
  .panel-body  { padding: 20px 20px 56px; }
}
```

---

## Interaction Summary

| Action | Result |
|--------|--------|
| Click SEARCH | view-main exits; view-search rises in; input focuses |
| Click DATE | view-main exits; view-cal rises in; current week renders |
| Type ≥2 chars in search | Hints fade, spinner, results load ~380ms later |
| Click hint tag | Fills input, fires search |
| Click available search result | Closes search, scrolls to date block |
| Click available calendar day | Closes calendar, scrolls to date block |
| Click available feast list row | Same as above |
| Click ◀ ▶ in calendar | Week strip slides, feast list updates to show the new week |
| Press Escape | Closes whichever takeover view is open |
| Click BACK (desktop) | Same as Escape |
| Click CLOSE (mobile) | Same as Escape |
| Click service row | Desktop: opens right panel (70vw). Mobile: full-screen takeover slides in from right |
| Click different service row | Updates panel content in place |
| Click ✕ in panel | Closes panel |
| Toggle Thee/You (inside detail section) | Re-renders panel text live; updates toggle label to reflect selection |
| Click PRINT | `window.print()` |
| Scroll service list | Week label in sub-bar updates to visible week |

---

## Data Shape (for integration)

Calendar entries:
```js
{
  id:    string | null,  // DOM id of date block to scroll to; null = no service
  feast: string,         // feast or saint name
  avail: boolean         // whether a service is assembled and viewable
}
```

Search index entries:
```js
{ date: string, id: string | null, name: string, avail: boolean }
```

---

## Print Styles

```css
@media print {
  .view-search, .view-cal, header, .center-bar,
  .svc-list-body, .panel-head { display: none; }
  .panel { width: 100%; border: none; }
  .panel-body { overflow: visible; }
  body { background: white; }
  .prayer, .rubric { page-break-inside: avoid; }
}
```

---

## File Conventions

- Prototype: `front-end/prototype.html`
- This spec: `front-end/frontend-requirements.md`
- All CSS variables in `:root`
- No external CSS frameworks — plain CSS only
- Fonts from Google Fonts CDN

---

## Out of Scope (This Sprint)

- User accounts or saved preferences
- Permalink / shareable URLs
- Search backed by real API (prototype uses static sample data)
- Responsive layout for the main service list itself (date blocks, sub-bar) on very small screens
