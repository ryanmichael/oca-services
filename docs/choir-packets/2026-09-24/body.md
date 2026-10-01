# Choir blast — 2026-09-24

**Subject:** St John Choir Blast 09.24 LONG EMAIL - PLEASE READ CAREFULLY
**From:** Connie Russell <cjruss63@gmail.com>

## Email text

> Greetings all.
> Attached is the INTRO to TONE 8 packet. PLEASE PRINT for your folder/notebook.
>
> Also attached are the upcoming services for the week - GV (Sat 09.26), Lit
> (Sun 09.27), and DV (Wed 10.01). You DO NOT need to print these as they will be
> in your choir notebooks when you get to warm-up. (Sorry I never got this week's
> DV to you. My Computer had a hiccup and I was on Grandma duty until Wednesday
> afternoon. But my computer has been healed and I am at home again.)
>
> Also attached is the *Byzantine Lord Have Mercy* that we will begin singing
> with the *Troparion to St John of Damascus* at Liturgies following the
> Thanksgiving prayers. (If it is a feast or afterfeast, St John gets trumped by
> the feast.)
>
> HIERARCHICAL DIVINE LITURGY - NOV 8:
> Attached are the two pieces from Wednesday night - *Soul Shall Rejoice/Prophets
> Proclaimed*. […] The songs are all on the website or will be by this afternoon.
> ST JOHN CHOIR WEBSITE
>
> FULL CHOIR REHEARSAL, SUN OCT 4. The other Sunday dates I gave you are probably
> going to change, but KEEP the SAT, NOV 7 date on your calendar!
>
> — Blessings, Jeff & Connie

## Directives

PROPOSED only — nothing here has been applied. Route via `/choir-correction`.

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| "the *Byzantine Lord Have Mercy* that we will begin singing with the *Troparion to St John of Damascus* at Liturgies following the Thanksgiving prayers" — a new standing item at the end of Liturgy | `rubric-flag` if a patron-troparion setting exists, else `text-overlay` + `library-add` for the Byzantine setting | Tyler only | high | **proposed, not applied** |
| "If it is a feast or afterfeast, St John gets trumped by the feast" — precedence condition on the above | same branch; this is the *condition*, not a separate rule | Tyler only | high | **proposed, not applied** |
| "GV (Sat 09.26), Lit (Sun 09.27), and DV (Wed 10.01)" — the director's own service mapping | not a correction; it is the **mapping oracle** | — | high | used in Step 4 |

### Notes that are signals, not directives

- **"Sorry I never got this week's DV to you."** A Daily Vespers sheet was
  dropped from the *previous* blast — consistent with the `missing-weekly`
  findings on the 2026-07-07, 2026-09-10 and 2026-09-16 packets. Dropped DV
  sheets are a recurring event, not an anomaly.
- **"DV (Wed 10.01)"** is the evidence that settled the `eve-misread` finding:
  2026-10-01 is a *Thursday*, so "Wed" plus "10.01" can only mean the service is
  sung Wednesday **09-30** and 10.01 names the liturgical day (the Protection of
  the Theotokos). Recorded via `choir:remap`; see `manifest.json`
  → `remapReason`.
- **Hierarchical Divine Liturgy, Nov 8** — forward-dated prep. Two pieces
  arrived here (`Soul Shall Rejoice`, `Prophets Proclaimed`) and are filed under
  `pdf/_unclassified/` because they carry no date or service. More material sits
  in `docs/11-8 Hierarchical liturgy/`.
- **"Lord Have Mercy (Byzantine)"** is likewise `_unclassified/` — correctly, as
  it is a standing hymn setting rather than a dated service sheet.

## Open question for the director — ASKED

Drafted 2026-10-01 in `docs/choir-director-questions-2026-10-01.md` (ready to
send, not yet sent):

1. **The anchor.** "Following the Thanksgiving prayers" maps to at least three
   positions in our order. The 09-27 booklet does not settle it — it carries
   only the variable propers, and the practice began the following week.
2. **"Trumped by the feast."** Does the feast's troparion replace St John's
   entirely, or is the feast sung first and St John after?

Until both are answered the correction stays blocked: the branch is settled
(`structure`, gated by a new additive rubric) but the insertion point and the
suppression rule would both have to be invented. Note also that "feast **or
afterfeast**" is broader than the `feastOnly` gate the patron feature uses
today, and no afterfeast signal is surfaced to the Liturgy route.
