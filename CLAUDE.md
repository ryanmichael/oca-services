# Orthodox Daily Services — Claude Code Instructions

## Project Goal

Web application that generates daily Orthodox Christian service texts
(Vespers, Matins, Divine Liturgy, and special services) for any date,
served via an HTTP API with HTML rendering.

Production: `https://oca-services-production.up.railway.app/`

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

## Key Commands

```bash
node server.js                    # HTTP server (port 3000)
node test-assembly.js             # assemble Mar 7, 2026 (Soul Saturday II)
node render.js                    # render static HTML files
```

---

## Key Architecture Rules

- **Vespers date-shift:** API date = civil evening; content from next day's
  calendar entry. Matins and Liturgy are unshifted.
- **Translation:** Use OCA (thee/thy) sources for variable texts. Don't mix
  translations within a service. Some Matins content is tagged with non-OCA
  `_source` fields for future replacement.
- **Tone calculation:** Saturday Great Vespers uses the tone of the week that
  is ending (the preceding Sunday's tone), NOT the upcoming Sunday's tone.
- **Menaion injection:** `getSticheraDay()` splits Lord I Call stichera between
  Octoechos and Menaion; `getMenaionPrimary()` injects at glory slot in troparia.
- **General Menaion fallback:** when no day-specific stichera exist, falls back
  to generic texts by saint category with `(name)` substitution.

---

## Reference Documents

- `office-vespers.pdf` — OCA rubrics, primary source for service structure logic
- `vespers-service-sheet.html` — target rendering style for HTML output
- `2026-0307-texts-vespers.pdf` — real service texts for March 7, 2026 (worked example)

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
