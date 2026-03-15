# OCA Services — Task Board
_Updated by Orchestrator at the end of each session. Edit priorities directly to guide the next session._

---

## 🔴 In Progress
_Nothing in progress yet._

---

## ✅ Recently Completed (2026-03-11 session)
- **Pentecostarion scraper** — verified all 8 feasts already in DB; added Obikhod troparia/kontakia
- **Menaion aposticha injection** — confirmed already working (server.js lines 806–841)
- **Daily Vespers API** — confirmed already working via `/api/service`
- **Kathisma resolver** — confirmed working; added real psalm text (see below)
- **Kathisma psalm texts** — scraped all 150 psalms from eBible.org Brenton → `fixed-texts/psalter.json`; added `fixed-texts/kathismata.json`; updated assembler
- **Holy Saturday troparia** — added `triodion/holy-saturday.json`; fixed `tropariaEmpty` flag in calendar-rules.js
- **Full-year completeness test** — 365/365 dates assemble, 0 issues

---

## 🟡 Up Next (Prioritized)

### ~~1. Run Pentecostarion scraper~~ ✅ DONE (2026-03-11)
Ran `node scrape-pentecostarion.js` — 31 blocks inserted for all 8 feasts (Obikhod troparia/kontakia). Full service text blocks (56–72 per feast) were already in DB from prior OCA text JSON imports. All Pentecostarion Sundays, Ascension, and Pentecost verified working end-to-end. Pentecost renders 151 blocks correctly.

### ~~2. Implement Menaion aposticha injection~~ ✅ ALREADY DONE
Verified working (2026-03-11). `server.js` lines 806–841 already inject aposticha stichera from the `stichera` table. Tested Jan 17 (Anthony, 1 sticheron with repeatPrevious fill) and Jan 25 (3 stichera, all 3 unique). Glory and Now slots handled correctly.

### ~~3. Daily Vespers API endpoint~~ ✅ ALREADY DONE
Verified working (2026-03-11). `/api/service?date=YYYY-MM-DD` already returns `serviceType: dailyVespers` for weekdays. Assembler handles it correctly: no Entrance, Augmented Litany after Troparia, Kathisma + Little Litany present. Tested Lenten Monday (134 blocks) and ordinary-time Monday Oct 5 (135 blocks with Menaion troparion).

### ~~4. Implement Kathisma resolver~~ ✅ ALREADY DONE (partially)
`kathisma.js` exists and `getVespersKathisma(dayOfWeek, season)` correctly returns the kathisma number for every day/season. Assembler renders the correct number in a rubric. **Remaining data gap**: the 20 kathismata psalm texts are not stored — a placeholder renders instead of actual psalm text. See backlog item below.

---

## 🔵 Backlog

- ~~**Kathisma psalm texts**~~ ✅ DONE (2026-03-11): Scraped all 150 psalms from eBible.org Brenton Septuagint → `fixed-texts/psalter.json`. Added `fixed-texts/kathismata.json` (20 kathismata with stasis structure, Psalm 118 verse ranges). Updated `assembler.js` to render full psalm text. Kathisma IV = 21 blocks (Psalms 24–31, Glory/Alleluia separators). Source: `scrape-psalter.js`.
- **Lenten weekday troparia**: DB has no troparia rows for Lenten weekday keys (`lent.week.N.dow`). At Daily Vespers on weekdays, no Troparia section renders. Source: OCA Lenten Triodion weekday texts.
- **Test suite**: No unit or regression tests exist. Add Jest tests for assembler.js against known-good dates (March 7, Oct 3, a Pentecostarion Sunday, a Lenten Saturday).
- **Pentecostarion troparia/kontakia**: Verify the scraper also inserts troparia for Thomas Sunday, Myrrhbearers, Paralytic, Samaritan Woman, Blind Man, Holy Fathers, Ascension, Pentecost.
- **Front-end enhancements**: Front-end is working. Future improvements (e.g., Daily Vespers view, print layout) can be added incrementally.
- **Lenten weekday coverage**: DB has only select Lenten weekday texts. Expand via `import.js` for full Great Lent weekday coverage.
- **Matins structure**: New service type. `service-structure/matins.json` + assembler support. Large scope.
- **Divine Liturgy structure**: New service type. Even larger scope.
- **Pre-Lenten weekday check**: Verify prokeimenon data covers all pre-Lenten weekdays.
- **Multi-language / pronoun variants**: Code partially supports You/Your vs. Thee/Thy toggle but not fully scraped.
- **Bulk export / print booklet**: Multi-date PDF rendering for printed booklets.
- **CI/CD pipeline**: GitHub Actions for automated deploy to Railway on push to main.
- **API documentation**: OpenAPI/Swagger spec for the service API.

---

## ✅ Completed

### Core Architecture
- Great Vespers JSON structure skeleton (`great-vespers.json`, 16 sections)
- Daily Vespers JSON structure skeleton (`daily-vespers.json`, fully defined)
- Fixed prayers file (`vespers-fixed.json`, all invariable texts)
- Visual design system (Cinzel, EB Garamond, gold rules, red rubrics)
- Front-end design spec and static prototype (`front-end/prototype.html`, `frontend-requirements.md`)

### Assembler & Renderer
- Core assembler (`assembler.js`) — all vespers assembly logic, handles stichera, troparia, aposticha, tone
- HTML renderer (`renderer.js`) — ServiceBlock[] → self-contained HTML
- Render convenience script (`render.js`)

### Octoechos
- All 8 tones fully populated: 6 resurrectional stichera, dogmatikon, aposticha idiomelon + theotokion, troparion, dismissal theotokion
- Source: OCA Obikhod (TT) PDFs scraped via `scrape-octoechos.js`

### Calendar & Rules
- `calendar-rules.js` — programmatic generation for: ordinary time, pre-Lenten, Great Lent, Holy Week, Bright Week, Pentecostarion
- Tone calculation (8-week cycle, verified)
- Soul Saturday detection (Saturdays 2/3/4 of Great Lent)

### Triodion (Lenten Saturdays)
- Soul Saturdays 2, 3, 4 (`lent-soul-saturday-2/3/4.json`) — fully populated
- 1st Lenten Saturday — St. Theodore stichera (`lent-saturday-1.json`)
- 5th Lenten Saturday — Akathist (`lent-saturday-5.json`, all 8 verses, Glory+Now combined)
- Lazarus Saturday (`lent-lazarusSaturday.json`, 6 Lazarus stichera)

### Holy Week & Bright Week
- Holy Friday Vespers — fully working
- Holy Saturday Vespers — fully working
- Bright Week Mon–Sat — fully working
- Thomas Sunday — fully working
- Pentecostarion weeks 1–3 — structurally working (resurrectional stichera from Octoechos)

### Menaion Database
- SQLite DB (`storage/oca.db`): 2,639 commemorations, 4,068 troparia/kontakia, 1,057 stichera rows for all 365 days (Jan–Sep 2024 + selected 2025–2026)
- Menaion troparion injection (ordinary-time Saturdays): fully working in server.js
- Menaion Lord I Call stichera injection: fully working; 157 dates covered

### Server & Deployment
- HTTP API (`server.js`): `/api/service`, `/api/days`, `/api/search`, `/api/menaion`, `/api/stichera`
- Production server live at https://oca-services-production.up.railway.app/
- Project on GitHub (`ryanmichael/oca-services`)

---

## 🚧 Blockers & Open Questions

- **Kathisma table source**: Need to confirm which OCA source defines the weekly kathisma rotation before implementing the resolver.
- **Pentecostarion stichera format**: Confirm `scrape-pentecostarion.js` uses the same DB schema as the Menaion scraper before running.

---

_Last updated: 2026-03-11 — Full project reassessment; board rebuilt from scratch._
