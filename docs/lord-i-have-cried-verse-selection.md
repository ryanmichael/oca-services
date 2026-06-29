# Lord, I Have Cried — Verse Selection

## What we render

Lord-I-Have-Cried is the central hymnographic moment of Vespers. Four psalms get interleaved with **stichera** (short hymns):

| Psalm | Role | What the choir/reader does |
|---|---|---|
| **Psalm 140** *(Lord, I call upon Thee…)* | Opening | Sung/read straight through, no stichera |
| **Psalm 141** *(I cry with my voice…)* | Continuation | Opening lines read straight through; **last 2 verses (10, 9)** get stichera |
| **Psalm 129** *(Out of the depths…)* | Stichera section | **All 6 verses (8 → 3)** get stichera |
| **Psalm 116** *(Praise the Lord, all nations…)* | Final verses | **Both verses (2, 1)** get stichera |

Total verses available for stichera: **10**, numbered 10 down to 1.

## How many stichera get sung (the "on N" count)

The Typikon says "stichera on N" — meaning the highest verse number that gets a sticheron. Lower N = fewer stichera = start later in the psalm sequence.

| Service | Default count | Verses sung |
|---|---|---|
| **Saturday Great Vespers** (Sun-eve) — default | "On 10" | 10 → 1 |
| **Saturday Great Vespers** at Tyler | "On 9" | 9 → 1 *(see note below)* |
| Weekday Daily Vespers | "On 6" | 6 → 1 *(starts at "Out of the depths")* |
| Great Feast Vespers | "On 8" | 8 → 1 |
| All-Night Vigil | "On 8" | 8 → 1 |

When the count is **8 or fewer**, Psalm 141's last two verses (10, 9) are **skipped entirely** — the stichera section opens with *"Out of the depths I cry to Thee, O Lord"* (Ps 129 v.8). When the count is **9 or 10**, Psalm 141 v.10 (and v.9 if "on 10") is included.

## Where the actual hymn texts come from

For each verse-slot, the calendar entry says which book to draw from. A typical Sunday-eve Great Vespers split:

| Verses | Source | Why |
|---|---|---|
| 10, 9, 8, 7, 6, 5, 4 | **Octoechos** — Resurrectional stichera in the week's tone | Sunday is the Lord's resurrection; Tone rotates weekly |
| 3, 2, 1 | **Menaion** — the day's saint(s) | Primary commemoration's stichera |
| Glory… | **Menaion** — Doxastikon | Usually the saint's most important sticheron |
| Now and ever… | **Octoechos** — Dogmatikon | Special Theotokion explaining the Incarnation |

If we asked for 7 octoechos verses but the published source has only 6 stichera (which OCA's Obikhod chant arrangement does), the default behavior is to **double the first sticheron** per Typikon rule. That's what causes the "By Thy Cross, O Christ our Savior…" repeat between verse 10 and verse 9 — it's not a typo, it's the rubrically-permitted way to fill the 7th slot when the Obikhod doesn't supply a 7th unique sticheron.

## Tyler's setting

At your request, Tyler is now set to **"on 9"** at Saturday Great Vespers. This honors strictly what OCA publishes in chant (6 octoechos verse-stichera per tone, no doubling) and removes the duplicate that was being misread as a typo. The trade-off: one less verse (10) and one less sticheron, compared with the canonical 10-count.

If you'd prefer **"on 10"** restored (with the doubled leading sticheron clearly labeled, e.g. *"(repeated)"*) — let us know and we'll switch back and add the label. Or if you'd prefer to wait until we can source the canonical 7th Anatolikon from a text Octoechos and ship the full 10-count without any repeat, that's also queueable.

## What to verify

Please flag any of these that don't match what your choir actually does:

- **Saturday eve**: verses opened with "Out of the depths…" (v.8 first) — should you instead start at "Bring my soul out of prison…" (v.10)?
- **Glory** at the end of the saint stichera — sung as a separate Doxastikon (the saint's chief hymn), not blended with the last numbered sticheron?
- **Now and ever** — the resurrectional Dogmatikon of the week's tone (not the same Theotokion sung at the aposticha)?
- **Weekday Daily Vespers**: opens with "Out of the depths…" (v.8); 6 stichera total — correct for your parish, or do you sing 4 or 8?
- The split-point between Octoechos and Menaion when the day has 3 menaion stichera — correct that the Menaion takes verses 3, 2, 1 (the *last* three) and Octoechos takes the earlier ones?

A one-line note per item is enough — *"yes, that matches"* or *"we sing X instead at slot Y"*. From there we can route each correction to the right layer (parish-specific rubric, text override, calendar data, etc.).

---

*Generated 2026-06-28 from `fixed-texts/vespers-fixed.json > lordICall.psalmVerses`,
`assemblers/vespers-parts/lord-i-call.js`, and the
`st-john-damascus-tyler` parish-settings row (with `licNoLeadingRepeat` enabled).*
