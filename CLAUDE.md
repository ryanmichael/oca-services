# Orthodox Daily Services — Claude Code Instructions

## Project Goal

Build a web application that generates daily service texts for Orthodox Christian
worship services (Matins, Daily Vespers, Great Vespers, Divine Liturgy) for any
date, and eventually serves this data via an API.

**Current scope:** Great Vespers service assembly, rendering to HTML, working
toward a rendered HTML service sheet for any given date.

---

## What Has Been Built

The core data architecture, assembler, and HTML renderer are in place and working.

- `node test-assembly.js` assembles a complete Great Vespers (155 blocks, 16 sections)
  for March 7, 2026 (Soul Saturday II, Lenten).
- `node render.js` generates `vespers-2026-03-07.html` and `vespers-2026-10-03.html`.
- A second calendar entry (Oct 3, 2026 — regular Saturday, Tone 8) assembles and
  renders correctly, with Menaion texts marked TODO.

### File Map

```
CLAUDE.md                              ← you are here
README.md                              ← architecture overview
assembler.js                           ← core assembly engine
renderer.js                            ← renders ServiceBlock[] → self-contained HTML
render.js                              ← convenience script: assemble + write HTML
test-assembly.js                       ← test harness (run to verify Mar 7)

service-structure/
  great-vespers.json                   ← ordered skeleton of the full service

fixed-texts/
  vespers-fixed.json                   ← all invariable texts (psalms, litanies, prayers)

variable-sources/
  prokeimena.json                      ← evening prokeimena (all 7 weekdays, Saturday
                                          Great Prokeimenon, and special)
  octoechos.json                       ← 8-tone cycle hymns:
                                          Tone 3: dogmatikon only
                                          Tone 4: full Saturday Vespers (4 of 6
                                            resurrectional stichera; aposticha; troparion;
                                            dismissal theotokion) — from Forgiveness Sunday
                                          Tone 5: dogmatikon only
                                          Tone 8: dogmatikon + 6 Lord I Call stichera +
                                            aposticha idiomelon — from Bright Saturday
                                          Tones 1, 2, 6, 7: TODO
  calendar/
    2026-03-07.json                    ← Soul Saturday II / Hieromartyrs of Cherson
                                          (Lenten, Tone 5)
    2026-10-03.json                    ← Hieromartyr Dionysius the Areopagite
                                          (ordinary time, Tone 8) — Menaion texts TODO
  triodion/
    lent-soul-saturday-2.json          ← Soul Saturday 2 texts (full Vespers + Liturgy)
  menaion/
    march-07.json                      ← Hieromartyrs of Cherson (March 7)
    october-03.json                    ← Hieromartyr Dionysius the Areopagite (TODO)
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

### 1. ✅ Render the assembled service as HTML — DONE

`renderer.js` renders `ServiceBlock[]` to a self-contained HTML file.
`render.js` is the convenience script. CSS classes match the service sheet
reference. Run `node render.js` to regenerate both HTML files.

### 2. Populate the Octoechos (in progress)

`variable-sources/octoechos.json` has partial data. Still needed:

**Dogmatika** (the single most important piece per tone — always used at
Saturday Great Vespers):
- Tone 1: TODO
- Tone 2: TODO
- Tone 6: TODO
- Tone 7: TODO

**Full Saturday Vespers content** (per tone):
- Resurrectional stichera at Lord I Call — 6 hymns
  - Tone 4: hymns 5–6 (vv. 6 and 5) TODO
  - Tones 1, 2, 5, 6, 7: all TODO
- Aposticha stichera — 3 hymns + theotokion
  - Tone 4: Saturday-specific versions TODO (current data is from Sunday Vigil)
  - Tones 1, 2, 5, 6, 7: all TODO
  - Tone 8: hymns 2–3 + theotokion TODO
- Resurrectional troparion — Tones 1, 2, 5, 6, 7, 8: TODO
- Dismissal theotokion — Tones 1, 2, 5, 6, 7, 8: TODO

**How to source these texts:**
The OCA publishes weekly service texts at `https://www.oca.org/liturgics/service-texts`.
Files follow the pattern `https://files.oca.org/service-texts/YYYY-MMDD-texts-tt.docx`
(tt = Thou/Thy, yy = You/Your). Download and unzip to extract `word/document.xml`,
then strip XML tags. The best sources are Sunday Vigil files (show full 10-stichera
Lord I Call with all resurrectional hymns) or Saturday Vespers files when available.
The Tone for a given Sunday can be computed — see `calendar-rules.js` task below.

**Known limitation:** The OCA does not publish service texts for plain Saturdays
with no notable feast — those days use straight Octoechos from the Reader's Service
Book. To collect plain Saturday data, use Sunday files (which include the same
resurrectional stichera) or source directly from the OCA Reader's Service Book.

### 3. Fill in Menaion entries

`variable-sources/menaion/october-03.json` has placeholder texts for
Hieromartyr Dionysius the Areopagite. Once real texts are obtained from the
OCA October Menaion, replace the `[... — TODO]` strings with actual hymn text.
The calendar entry `2026-10-03.json` is already wired up and ready.

Add more Menaion entries following the same pattern for other dates.

### 4. Build `calendar-rules.js`

A module that can *generate* calendar entries programmatically rather than
requiring one hand-authored file per day. Key rules to encode:

```js
// Tone cycle: 8-week repeating cycle
// Tone 1 starts on the Sunday after All Saints Sunday
// All Saints Sunday = first Sunday after Pentecost
// Pentecost = 50 days after Pascha
function getToneForDate(date) { ... }

// Day of week → weekday prokeimenon key
// Saturday Great Vespers → "saturdayGreatVespers"
function getWeekdayProkeimenon(dayOfWeek, serviceType) { ... }

// Is this day a Soul Saturday?
function isSoulSaturday(date) { ... }  // 2nd, 3rd, 4th Sat of Great Lent

// Is Blessed Is The Man sung tonight?
function sungBlessedIsTheMan(date, serviceType) { ... }
```

**Tone calculation note:** Saturday Great Vespers uses the tone of the week
that is ending (the preceding Sunday's tone), NOT the upcoming Sunday's tone.
The new tone begins at Sunday Matins. Verified: Oct 3, 2026 = Tone 8 (week
of Sep 27 Sunday).

### 5. Add more calendar entries

- Sunday Vespers example (to test the Sunday prokeimenon path)
- A weekday Daily Vespers with a single prokeimenon (no OT readings)
- Regular Saturdays in additional tones as Octoechos data is filled in

### 6. Daily Vespers structure

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
