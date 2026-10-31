# Choir blast — 2026-10-30

**Subject:** ATTN: This week's music posted 10/31, 11/1, 11/5

## Email text

Subject: ATTN: This week's music posted 10/31, 11/1, 11/5
Sent: 2026-10-30 (Friday) 22:05 UTC
From: Connie Russell <cjruss63@gmail.com>

--- email text, verbatim ---
St John of Damascus Choir - Google Sites
<https://sites.google.com/d/1QVRjt53tqltTIbZxXrNmaGhCevDhyeD0/p/1XNu-FN69TctnzhgqDZryp-CPhPKOG6Nb/edit>

PRACTICE SUNDAY FOLLOWING COFFEE HOUR.
SEE PREVIOUS EMAIL for IMPT announcements.
--
Blessings,
J & C

--- Google Site page text (st-john-of-damascus-choir / this-week-st-johns) ---
Links published on the page:
  Great Vespers 10/31   -> drive id 1hJ-rI9-QsF-O_o_M-92LUUl0u2DrN3X5   [RESTRICTED - sign-in required]
  Divine Liturgy 11/1   -> drive id 1VrCp9h3ugZXzJtufDENE7BrhorWak4xS   [RESTRICTED - sign-in required]
  "Outlines of Upcoming Services (OCA) Saturday PM & Sunday AM (does not include music)"
        -> https://www.oca.org/liturgics/rubrics/order-of-upcoming-services

Page notes, verbatim:
  "NO DAILY VESPERS 11/4"
  "FULL CHOIR REHEARSAL SUN, NOV 1"
  "Warm-up begins 30 minutes prior to each service. We will briefly rehearse the
   changeable music and provide any special instructions about the service."
  "If you are unable to make it to warm-up, Fr. Joshua prefers you not sing that service."

Page header still shows a stale feature banner: "Feast of the Exaltation of the
Cross / September 14" — cosmetic, not a directive.

--- Rector's schedule (stjohnoftyler@gmail.com, "This Week at St. John's - October 25") ---
  Wednesday  - Daily Vespers 6:00 PM followed by Confession   [Oct 28]
  Saturday   - Akathist to the Four Holy Evangelists 9:00 AM  [Oct 31]
             - Great Vespers 6:00 PM followed by Confession
  Sunday     - Divine Liturgy 10:00 AM, Coffee Hour, Catechism 1:00 PM  [Nov 1]
  "DAYLIGHT SAVING TIME ENDS THIS WEEKEND"
  Ladies Craft Night postponed to Thursday, November 5, 5:00 PM (not a service).
  Nov 8 = parish 20th Anniversary celebration (Hierarchical Liturgy music on a
  separate site page). Nov 14 = Enthronement of Bishop Gerasim.

## Directives

<!-- One row per instruction in the body that affects what we render.
     PROPOSED only — nothing here is applied. Route via /choir-correction. -->

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| Sheet p5 + p9: the Menaion's own "Now and ever…" is **struck through by hand** in both places (LIC and Aposticha), so the Octoechos Dogmatikon (Tone 5) and Aposticha Theotokion (Tone 6) are sung instead. | none — we already render exactly this | n/a | high | confirms current behaviour |
| Sheet p3: a **7th** Resurrection sticheron is printed at stichos 4 (`O Lord, Thou hast captured hell`) with a marker stroke over it. | none — the booklet prints the full Octoechos block; the order appoints 6+4 | n/a | high | checked, not a defect — see below |
| Sheet p5/p9 Glory texts are the OCA *you/your* wording; we hold a *thee/thou* variant. | calendar-data (stichera 9705, 9708) | 11-01, all parishes | high | **applied 2026-10-31** |
| "NO DAILY VESPERS 11/4" | none — explains the verifier's `missing-weekly` medium | n/a | high | no render impact |
| "PRACTICE SUNDAY FOLLOWING COFFEE HOUR" / "FULL CHOIR REHEARSAL SUN, NOV 1" / warm-up 30 min prior | none — rehearsal logistics | n/a | high | no render impact |

## Signals (not directives)

- **Subject says music was posted for `11/5`, but the page lists no such service**
  and says "NO DAILY VESPERS 11/4". 11-05 is a Thursday carrying only Ladies
  Craft Night. Unresolved — ask the director; do not infer a service.
- **Both Drive files were initially restricted** (HTTP 401; `curl` returned a
  927 KB HTML sign-in page with exit 0). They were opened later the same day.
  Check for `%PDF` before trusting a download.
- The page's feature banner still reads "Feast of the Exaltation of the Cross /
  September 14" — stale decoration, not a rubric.

## The 7th Resurrection sticheron — checked, NOT a gap

Her sheet numbers the Resurrection block **10-4**, i.e. seven stichera, where we
render six. That is not evidence of a defect:
`project_lic_seventh_resurrection_sticheron` already records the rule — **the
sheets print the Octoechos block in full regardless of the day's appointed
count, so the count must come from the order file, never from the booklet's
numbering.** `reference/orders/2026-1101` appoints 6 Resurrection + 4
Unmercenaries, and 7 + 4 would be 11 stichera for 10 stichoi.

Verified positively rather than assumed: `2026-0517` is a Tone 5 Sunday whose
order appoints **7**, and rendering 05-16 emits
`O Lord, Thou hast captured hell` as sticheron 7. So Tone 5's seventh is
reachable and the count rule works; it is correctly withheld on 11-01.

(Unrelated observation from that probe, not chased: 05-17 renders stichera 8 and
9 as the same text, `The man blind from birth asked himself`, giving 11 stichera
before the Theotokion. Possibly a real duplication defect on that date.)
