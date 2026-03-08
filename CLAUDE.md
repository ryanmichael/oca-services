# Orthodox Daily Services — Claude Code Instructions

## Project Goal

Build a web application that generates daily service texts for Orthodox Christian
worship services (Matins, Daily Vespers, Great Vespers, Divine Liturgy) for any
date, and eventually serves this data via an API.

**Current scope:** Great Vespers service assembly, working toward a rendered
HTML service sheet for any given date.

---

## What Has Been Built

The core data architecture and assembler are in place and working. Running
`node test-assembly.js` successfully assembles a complete Great Vespers service
(154 blocks, 16 sections) for March 7, 2026 using real liturgical texts.

### File Map

```
CLAUDE.md                              ← you are here
README.md                              ← architecture overview
assembler.js                           ← core assembly engine
test-assembly.js                       ← test harness (run to verify)

service-structure/
  great-vespers.json                   ← ordered skeleton of the full service

fixed-texts/
  vespers-fixed.json                   ← all invariable texts (psalms, litanies, prayers)

variable-sources/
  prokeimena.json                      ← evening prokeimena, all 7 weekdays + special
  octoechos.json                       ← 8-tone cycle hymns (PARTIAL — Tone 5 only)
  calendar/
    2026-03-07.json                    ← example calendar day entry (March 7, 2026)
  triodion/
    lent-soul-saturday-2.json          ← Soul Saturday 2 texts (full Vespers + Liturgy)
  menaion/
    march-07.json                      ← Hieromartyrs of Cherson (March 7)
```

---

## The Core Data Model

There are three layers:

**1. Service Structure** (`service-structure/great-vespers.json`)
The ordered skeleton of the service. Each block is typed as either:
- `fixed` — points to a key in `fixed-texts/` via `textKey`
- `variable` — describes how to resolve content at runtime via `resolvedBy` + `sources`

**2. Fixed Texts** (`fixed-texts/vespers-fixed.json`)
All invariable content. Accessed via dot-notation keys (e.g. `prayers.ourFather`,
`litanies.great.petitions`).

**3. Variable Sources** (`variable-sources/`)
The "liturgical books." The calendar entry for a given date points into these.

**The Calendar Entry** (`variable-sources/calendar/YYYY-MM-DD.json`) is the
conductor — it specifies:
- The liturgical season and weekly tone
- All commemorations for the day, ranked by priority
- For each service section: which source(s) to draw from, how many stichera,
  in what order, with which tone

**The Assembler** (`assembler.js`) takes `(calendarDay, fixedTexts, sources)` and
returns an ordered array of `ServiceBlock` objects ready for rendering.

---

## ServiceBlock Output Shape

```js
{
  id:       "lic-hymn-v6",           // unique string
  section:  "Lord, I Have Cried",    // display section name
  type:     "hymn",                  // rubric | prayer | hymn | verse | response | doxology
  speaker:  "choir",                 // priest | deacon | reader | choir | all | null
  text:     "The passion-bearers…",  // the rendered text
  tone:     5,                       // optional
  source:   "triodion",              // optional — which book this came from
  label:    "For the Martyrs",       // optional — display label
}
```

---

## Immediate Next Tasks (Priority Order)

### 1. Render the assembled service as HTML

Build `renderer.js` (or a React/HTML frontend) that takes the `ServiceBlock[]`
output of `assembleVespers()` and renders a service sheet matching the style
of the attached `vespers-service-sheet.html` reference.

The HTML reference uses these CSS classes that map to block types:
```
type: "rubric"   → <p class="rubric">
type: "prayer"   → <p class="prayer">
type: "hymn"     → <p class="hymn"> with <div class="source-tag"> for source/tone
type: "verse"    → <p class="verse">
type: "response" → <p class="response">
type: "doxology" → <div class="glory-line">
speaker shown via → <div class="speaker">
sections via     → <div class="section-head">
```

The rendered output should be a self-contained HTML file.

### 2. Populate the Octoechos

`variable-sources/octoechos.json` currently only has the Tone 5 Dogmatikon.
It needs all 8 tones populated for Saturday Vespers at minimum:
- Resurrectional stichera at Lord I Call (typically 6–8 hymns)
- Aposticha stichera (3 hymns + theotokion)
- Resurrectional troparion
- Resurrectional theotokion (after troparion)
- Dogmatikon (already done for Tone 5)

Source: https://www.oca.org/liturgical-texts or the OCA Reader's Service Book.

### 3. Add more calendar entries

Each date needs a `variable-sources/calendar/YYYY-MM-DD.json`. The pattern
is established by `2026-03-07.json`. Add:
- A regular (non-Lenten) Saturday Great Vespers in each tone
- A Sunday Vespers example
- A weekday Vespers with a single prokeimenon (no OT readings)

### 4. Build `calendar-rules.js`

A module that can *generate* calendar entries programmatically rather than
requiring one hand-authored file per day. Key rules to encode:

```js
// Tone cycle: 8-week repeating cycle, anchored to All Saints Sunday
function getToneForDate(date) { ... }

// Day of week → weekday prokeimenon key
function getWeekdayProkeimenon(dayOfWeek) { ... }

// Is this day a Soul Saturday?
function isSoulSaturday(date) { ... }  // 2nd, 3rd, 4th Sat of Great Lent

// Is Blessed Is The Man sung tonight?
function sungBlessedIsTheMan(date, serviceType) { ... }
```

### 5. Daily Vespers structure

`service-structure/` only has `great-vespers.json`. Daily Vespers differs in:
- No entrance
- No OT lessons
- Augmented Litany comes *after* Troparia, not before Vouchsafe
- Kathisma is read (not sung) on most days, omitted on certain days
- No Blessed is the Man

---

## Known Gaps & Design Decisions Needed

### Stichera count varies
The calendar entry for March 7 specifies 3+3 stichera from two sources.
On a regular Sunday this might be 6 resurrectional from Octoechos + 4 from
Menaion, or various other combinations. The `sticheraAssembler` in `assembler.js`
needs to handle flexible slot counts driven by the calendar entry.

### The Kathisma system
The Psalter is divided into 20 kathismata. Which one is read at Vespers is
determined by the day of the week and the liturgical season. This is a separate
lookup table that needs building.

### Lenten vs. non-Lenten prokeimenon
During Great Lent, weekday prokeimena are replaced by pairs from the Triodion.
The `calendar/2026-03-07.json` shows the pattern (`"pattern": "lentenWithReadings"`).
For non-Lenten Saturdays the `prokeimena.json` weekday table is used directly.

### Multiple commemorations
The March 7 example has two commemorations (Soul Saturday + Hieromartyrs).
The ranking system and how they combine (who gets Glory, who gets the Now,
how many stichera each gets) is complex typikon logic. The current calendar
entry encodes the *result* of that logic manually. Eventually `calendar-rules.js`
should derive it automatically from feast ranks.

### Translation variants
The fixed texts use the OCA translation (Slavonic-influenced, "thee/thy" language).
The HTML reference uses a slightly different translation. The architecture supports
multiple translation sets — just swap the `fixed-texts/` file. Don't mix
translations within a service.

---

## Running the Test

```bash
node test-assembly.js
```

Expected output: 154 blocks assembled across 16 sections, ending with a summary
of variable content resolved from triodion, menaion, and octoechos sources.

---

## Long-Term Vision

```
GET /api/service?date=2026-03-07&type=great-vespers
→ ServiceBlock[]

GET /api/service?date=2026-03-07&type=great-vespers&format=html
→ rendered HTML service sheet
```

The assembler becomes the request handler. Calendar entries either pre-authored
or generated by `calendar-rules.js`. Variable sources loaded from JSON files
or a database.

Future services: Matins (Orthros), Divine Liturgy (fixed parts are extensive;
variable parts follow same Octoechos/Menaion/Triodion pattern).

---

## Reference Documents

- `office-vespers.pdf` — OCA rubrics document, primary source for service structure logic
- `vespers-service-sheet.html` — target rendering style for the HTML output
- `2026-0307-texts-vespers.pdf` — real service texts for March 7, 2026 (the worked example)

All three were used to design the current architecture. If adding new service
types or rubrical edge cases, consult the rubrics PDF first.

---

## Liturgical Glossary

| Term | Meaning |
|------|---------|
| **Sticheron/Stichera** | Hymn(s) sung between psalm verses |
| **Kathisma** | One of 20 sections the Psalter is divided into |
| **Prokeimenon** | Versicle + verse sung before a reading |
| **Aposticha** | Stichera sung at the end of Vespers with specific psalm verses |
| **Troparion** | Short summary hymn for a feast or saint |
| **Theotokion** | Hymn in honor of the Theotokos (Virgin Mary) |
| **Dogmatikon** | Special theotokion for Saturday Vespers from the Octoechos |
| **Octoechos** | The "Eight Tones" book; 8-week cycle of resurrectional hymns |
| **Menaion** | Fixed-calendar saints' book; one volume per month |
| **Triodion** | Lenten/pre-Lenten moveable-feast book |
| **Pentecostarion** | Paschal cycle book (Pascha through All Saints) |
| **Soul Saturday** | Memorial Saturday for all departed; occurs several times/year |
| **Idiomelon** | A sticheron with its own unique melody (not borrowed) |
| **Tone** | One of 8 melodic modes; rotates weekly, governs Octoechos selection |
| **Great Vespers** | Full Vespers with Entrance, sung Kathisma, possibly OT lessons |
| **Daily Vespers** | Shorter Vespers without Entrance or lessons |
