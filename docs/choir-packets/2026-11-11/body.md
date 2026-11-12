# Choir blast — 2026-11-11 (and 2026-11-10)

Two emails this cycle, and **neither carried the week's music as an attachment.**

- **#1, 2026-11-10** — "St John Choir Email Blast #1". Two PDFs attached
  (Akathist of Thanksgiving prep; Liturgy 2 Greek Antiphons). Forward-looking
  prep, no weekly service music.
- **#2, 2026-11-11** — "…Upcoming Services/Impt Dates". **No attachments.** The
  week's music is on Google Sites, as Drive links.

> `from:cjruss63@gmail.com has:attachment` MISSES blast #2 entirely. Search by
> sender alone. The three Drive files behind the Sites page download with
> `uc?export=download` and are real PDFs (checked for `%PDF`; a restricted file
> returns a 200 HTML login page instead).

## Email text — #2, 2026-11-11

> Greetings all.
> This week's music can be reviewed online: St John of Damascus Choir - This Week @ St. John's
> Akathist of Thanksgiving text, prep music and link to service can be reviewed here: …
>
> IMPORTANT DATES:
> Nov 20 - GV w/Litya for Feast of Entrance of the Theotokos
> Nov 21 - Festal Liturgy for Feast of Entrance of the Theotokos
> Nov 22 - Full Choir Rehearsal following church school (1 -2 pm)
> Nov 25 - Akathist of Thanksgiving
> Nov 29 - New Liturgy (Greek Antiphons)
> Dec 3 - GV w/Litya for Patronal Feast (St John of Damascus)
> Dec 4 - Festal Liturgy for St John of Damascus
> Music for the two above feasts will be posted soon.
> Nativity schedule will be posted soon.

## Email text — #1, 2026-11-10 (the parts that bind)

> The *first* is the prep page for the **Akathist of Thanksgiving that we will
> sing in place of daily vespers on the Wednesday night before Thanksgiving**.
> … The music follows the melody of "Having beheld the resurrection of Christ"
> that we sing during a vigil/matins service. It is … only one tone with four
> phrases - repeated throughout the entire service.

> The *second* is a packet of music that we will **begin using for liturgy on
> November 29 and continue to sing until the beginning of great lent**. This set
> of antiphons and related pieces is **set in the Greek chant tradition** …

## Directives

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| **Akathist of Thanksgiving replaces Daily Vespers, Wed 2026-11-25** ("in place of daily vespers on the Wednesday night before Thanksgiving") | new service — no `akathist` key exists in service-catalog.js (17 services, none of them this) | Tyler now; any parish later | high | proposed |
| **Greek-chant antiphon set for Liturgy, 2026-11-29 → start of Great Lent** ("begin using for liturgy on November 29 and continue to sing until the beginning of great lent") | antiphon set on a **DATE-RANGE/seasonal** axis; today `rubrics_extra_json.antiphonSet` is keyed by great-feast name (`transfiguration`, `elevation`) only | Tyler | high | proposed |
| **Dec 3 — Great Vespers w/ Litya for the PATRONAL feast** (St John of Damascus, 12-04) | we render **Daily Vespers, 0 Litya blocks** for 12-03; the 12-04 commemorations carry **no rank**, so the day never elevates | Tyler (patron is parish-scoped) | high | **confirmed defect** |
| Nov 20 — GV w/ Litya for the Entrance | **already correct** — verified 25 Litya blocks, Kathisma + Entrance present | — | high | no action |
| Nov 21 / Dec 4 — Festal Liturgies | Liturgy is served on both; propers not yet compared | Tyler | — | open |
| Weekly music now lives on Google Sites, not as attachments | intake: `choir:fetch --source manual` after downloading the Drive links | pipeline | high | applied this cycle |

## Mapping note

`Daily Vespers 11.19.26.pdf` was **remapped** 11-19 → **11-18** (content 11-20 →
11-19). The sheet's own page 3 reads "November 19: Commemoration of the Holy
Prophet Obadiah", so 11-19 is the CONTENT date; 11-19 is a Thursday and the
parish's standing Daily Vespers is Wednesday. Recorded in `manifest.json`.

## Verify

0 high / 1 medium / 0 low — `missing-weekly`: no sheet for the Sunday Liturgy
2026-11-15. The Sites page carried three files; the Sunday Liturgy was not among
them.
