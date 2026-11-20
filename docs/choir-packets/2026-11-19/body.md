# Choir blast — 2026-11-19

**Subject:** St John Choir Email Blast #2 11/19

## Email text

Greetings all. There are extra services this week. Hope you all can be
there.

GV w/Litya Friday 6 pm, Festal Liturgy Saturday 9 am, GV Saturday evening
6 pm, Divine Liturgy Sunday 10 am, and the Akathist of Thanksgiving
Wednesday 6 pm. Warmup 30 minutes prior to each service. Click the link to
access the music for this coming week: St John of Damascus Choir - This
Week @ St. John's
<https://sites.google.com/view/st-john-of-damascus-choir/this-week-st-johns>

We will have an abbreviated *Full Choir rehearsal* after liturgy and before
coffee hour this Sunday. Please practice the new liturgy music as best you
can to prepare for this rehearsal since we want to make the switch on
November 29. Click this link to find the music and some samples from
YouTube. St John of Damascus Choir - Choir Practice & Prep
<https://sites.google.com/view/st-john-of-damascus-choir/calendarschedule/choir-practice-prep?authuser=0>

Blessed fast...
--
Blessings,
J & C

--- Google Sites "This Week @ St. John's" page (fetched 2026-11-19), verbatim link list ---
Entrance of the Most Holy Theotokos into the Temple — Nov 21
Services This Week
- Great Vespers w/Litya for Feast - Entrance of the Most Holy Theotokos into the Temple 11/20  (drive 1Zm3StfzbF9iNzaAQB8jn7FRY_jFbcqyH)  [saved as "Great Vespers Litya 11.20.26.pdf"]
- Festal Liturgy for Feast - Entrance of the Most Holy Theotokos into the Temple 11/21  (drive 1W8ubW3KX7WIAjzhYXMKeWatT7mX8fX7x)  [saved as "Festal Liturgy 11.21.26.pdf"]
- Great Vespers 11/21  (drive 1QrJdyeYfcH0OY5nrdSOMeddvule0bwiV)
- Divine Liturgy 11/22  (drive 1a-AU4CZuNjeKJTZ1fNc5J4q9hrEyNVzf)
- Akathist of Thanksgiving 11/25  (drive 1SZeaCy08r_EdnmQidY0VlNvmwrSB9BJK)
Short Choir Rehearsal BETWEEN Liturgy & Coffee Hour 11/22
Warm-up begins 30 minutes prior to each service. ... If you are unable to make it to warm-up, Fr. Joshua prefers you not sing that service.

## Directives

<!-- One row per instruction in the body that affects what we render.
     PROPOSED only — nothing here is applied. Route via /choir-correction. -->

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| **Wed 11-25 — "the Akathist of Thanksgiving Wednesday 6 pm"** in place of the standing Daily Vespers (verify: `missing-weekly` for 2026-11-25) | none — schedule fact; the Akathist sheet is byte-identical to the one held in packet 2026-11-10 (`_unclassified/`) | Tyler | high | explains the finding; no render change |
| **Fri 11-20 GV w/Litya and Sat 11-21 Festal Liturgy** — re-linked on the page, **byte-identical** to packet 2026-11-16 sheets (already reviewed, fixed in `b35481a`) | none | — | high | already handled |
| **Sat 11-21 GV + Sun 11-22 DL** — the "regular weekend music" promised in the 11-16 blast; this packet | review via /choir-packet-review | Tyler | high | review |
| **"we want to make the switch on November 29"** — new liturgy music (Zakkak It Is Truly Meet + Greek antiphons) | see packet 2026-11-16 / 2026-11-11 rows | Tyler | high | already proposed |

## Packet-diff triage (2026-11-20)

Baselined into `audit/packet-baseline.json` after review; no existing sheet lowered.

- `great-vespers-2026-11-21` — 7/14 located, 3 verbatim. Every miss is the packet, not us:
  the three Tone 1 Lord-I-Call feast stichera are the **11-20 forefeast** set (OCA order + stSergius +
  Lambertsen give Tone 8 "O most glorious wonder" for 11-22); the Apostles' stichera are another
  translation (best 0.4–0.44); "Let David greatly rejoice" is the second half of the Glory split across
  the page; the "Apostikha Tone 2" page is the weekday afterfeast set the OCA order brackets for the Litya.
- `liturgy-2026-11-22` — 0/3. Music booklet; the only typed pages are misfiled Great Vespers
  Resurrection stichera (scan pp.15-16). Known blind spot (memory: packet-diff music-page blindspot).
  Read visually: Apostles troparion/kontakion, Magnificat prokeimenon, Ode 9 "The angels beheld",
  "I will receive the cup" — all now rendered (commit below).
