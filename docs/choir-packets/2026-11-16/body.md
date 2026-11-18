# Choir blast — 2026-11-16

**Subject:** St John Choir Email Blast 11/16

## Email text

=== Email: "St John Choir Email Blast 11/16" — Connie Russell, sent 2026-11-16 17:33 CST ===
Greetings all.

Attached is the new Hymn to the Theotokos (beginning Nov 29) and here is
the link to listen to it. Start trying to learn it so we don't need an
extra rehearsal. It Is Truly Meet - nazo zakkak
<https://www.youtube.com/watch?v=jg-Kb9t1ZMg>

The feast of the Entrance of the Most Holy Theotokos into the Temple is
this coming Saturday. We will have Great Vespers w/Litya Friday at 6:00 pm
and Festal Liturgy Saturday at 9:00 am. Warmups30 minutes prior to each.
The link to these services is here. St John of Damascus Choir - This Week @
St. John's
<https://sites.google.com/view/st-john-of-damascus-choir/this-week-st-johns>

I will send the regular weekend music later in the week.
--
Blessings,
J & C

=== Follow-up: "Re: St John Choir Email Blast 11/16 pg 2 hymn to theotokos" — sent 2026-11-17 ===
(image0.jpeg only — page 2 of It Is Truly Meet, filed as "It is Truly Meet -Zakuk pg2.jpg")

=== Google Site "This Week @ St. John's" (fetched 2026-11-17) ===
Entrance of the Most Holy Theotokos into the Temple Nov 21
Services This Week
- Daily Vespers 11/18 — drive id 1jtwr8foTB4y8RZd-QQJu294K1fwcty_R (byte-identical to the sheet filed in packet 2026-11-11)
- Great Vespers w/Litya for Feast - Entrance of the Most Holy Theotokos into the Temple 11/20 — drive id 1Zm3StfzbF9iNzaAQB8jn7FRY_jFbcqyH
- Festal Liturgy for Feast - Entrance of the Most Holy Theotokos into the Temple 11/21 — drive id 1W8ubW3KX7WIAjzhYXMKeWatT7mX8fX7x
"Warm-up begins 30 minutes prior to each service. We will briefly rehearse the changeable music and provide any special instructions about the service."

=== Rector's schedule "This Week at St. John's - November 15" (2026-11-16) ===
Wed - Daily Vespers 6:00 PM; Fri - Great Vespers w/Litya for Entrance of Theotokos 6:00 PM;
Sat - Festal Liturgy 9:00 AM; Sat - Great Vespers 6:00 PM; Sun - Divine Liturgy 10:00 AM.

=== Also in the drop (user-downloaded, not linked from this email) ===
- Liturgy 2 Greek Antiphons.pdf (21 pp, Greek chant, Dmitri (Royster) translation)
- Akathist of Thanksgiving Prep.pdf (byte-identical to packet 2026-11-10)

## Directives

<!-- One row per instruction in the body that affects what we render.
     PROPOSED only — nothing here is applied. Route via /choir-correction. -->

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| **New "It Is Truly Meet" — Nazo Zakkak setting, from 2026-11-29** ("Attached is the new Hymn to the Theotokos (beginning Nov 29)") | music-setting only if the words match our megalynarion; text-overlay if they differ (sheet reads "…without corruption gavest birth to God the Word. True Theotokos, we magnify thee.") | Tyler | high | proposed — compare words; on 11-29 no feast hirmos displaces it |
| **Fri 11-20 — "Great Vespers w/Litya" for the Entrance, NOT a vigil** (verify flags `vigil-trap`: we model 11-20 as allNightVigil) | none if `/api/service?date=2026-11-20` carries the Litya; parish serves no Matins | Tyler | high | check Litya present |
| **Sat 11-21 — Festal Liturgy 9:00 AM; Sat eve Great Vespers + Sun Liturgy as usual** ("I will send the regular weekend music later in the week") | — expect a follow-up packet for GV 11-21 / DL 11-22 | — | high | watch for late sheet |
| `Liturgy 2 Greek Antiphons.pdf` — the Greek-chant antiphon set from 11-29 (directive already in packet 2026-11-11) | see 2026-11-11 row | Tyler | high | already proposed |

## Verify

1 high / 1 medium / 2 low. `vigil-trap` on 11-20: we model the eve as an
all-night vigil; the parish serves **Great Vespers w/Litya only** (director and
rector both say so). `missing-special` follows from the same modelling.
Daily Vespers 11-18 sheet is byte-identical to the one in packet 2026-11-11
(reviewed and fixed in `3314934`).

## Review (2026-11-17) — oracle: reference/scrape/2025-11-21.docx

| Piece | Packet | Ours | Bucket |
|---|---|---|---|
| GV Aposticha verses | Ps 44: "She is led to the King, with her Virgin companions…", "With joy and gladness they are led…" | ordinary Ps 122 ("To Thee I lift up mine eyes", "Have mercy upon us") | **our-defect** — OCA scrape gives Ps 44:13, 44:14 |
| GV Litya Glory/Now | "Glory… Now and ever… (by Leo the Master) Tone 5" | no Glory/Now block before `litya-hymn-3` | **our-defect** — OCA scrape has it |
| GV ending | GV w/Litya, Many Years (Diocese of the South, "if no Bishop present") | Blessing of Bread then "Matins follows immediately"; no Vespers dismissal, no Many Years | **parish-practice** — no Matins on 11-20 |
| GV Litya Tone 4 stichera ×2 | booklet p.5 absent (pp. 4 → 6) in both PDFs | present (OCA) | **packet-issue** — ask director |
| DL Prokeimenon | "My soul doth magnify… hath rejoiced"; V. "looked down upon the humility of His servant" | "magnifies… rejoices"; "He has regarded" (yy, base and parish) | **our-defect** (register; OCA scrape is "doth/hath") |
| DL Entrance hymn | not in packet | "wondrous in Thy saints" | open gap (`project_great_feast_eisodikon_gap`) |
| DL Beatitudes | not in packet | prints "troparia for this day are not yet in the system" | open gap (`project_beatitudes_oca_gap`) |
| DL Litya pages 4, 6 | filed inside the Liturgy PDF (pp. 7–8) | — | packet-issue (harmless) |
| DL Communion | sheet headed "Dormition — August 15" | text matches | packet-issue (reused header), no-op |

Matched: all 8 LIC stichera + Glory (order, tones 1/4/8), Aposticha stichera +
Glory T6, Litya T1 + T5, troparion ×3; DL troparion, kontakion, Alleluia T8,
megalynarion "The angels beheld…", communion. Packet Menaion register is yy
throughout (ours tt) — translation choice, not a defect.

### Second pass (2026-11-17) — every page read; fixes applied

Pen marks on the skipped pages are starting pitches ("C A F", "G E C"), "3x"
on the troparion, "Gerasim" written into the Many Years, and a struck-through
"Rpt Ode 9 after verses" on the Liturgy megalynarion. No text corrections.

| Finding | Fix |
|---|---|
| Aposticha Ps. 122 verses | `great-feast-variants.json` `entryTheotokos.apostichaVerses` (Ps. 44:13, 44:14, from the OCA scrape) |
| Litya Glory/Now missing | `stichera.id=9662` order 4 → 0; a Great Feast Litya Glory with no Now row prints "Glory… now and ever" (corrections_log) |
| Prokeimenon yy | Magnificat prokeimenon re-authored "doth magnify… hath rejoiced" on Entry, Meeting, Nativity of the Theotokos, Dormition (all four OCA scrapes agree) |
| Ends "Matins follows" | new parish rubric `vespers.greatVespersAloneOn`; Tyler = `11-21` (corrections_log) |

Guarded by `test/contracts/entry-theotokos-vespers-1120.test.js`.
Still open: Litya of 2-2, 8-15, 9-8, 9-14 have no order-0 Glory row (same
mis-key class, unchecked); no Many Years after a Vespers dismissal; Litya
petition names "Bishop Gerasim" though he is now Archbishop.

### Packet-diff triage (2026-11-18)

`great-vespers-2026-11-20` 7/8 located, 0/8 verbatim; `liturgy-2026-11-21` 2/2
located, 0/2 verbatim. The one unlocated piece, "The prophets proclaimed you, O
Virgin Mother of God" (best 0.49), IS printed — LIC (4), "Thou art the
preaching of the prophets…", read visually against the scan. Every gap is
the edition: the packet's Menaion texts are a different OCA translation in yy.
No defect; baseline refreshed with the two sheets added, no existing sheet lowered.
Matching her wording verbatim would be parish variants — a translation decision,
not made here.
