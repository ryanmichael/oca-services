# Choir blast — 2026-11-25

**Subject:** ST John Choir Email Blast 11/25

## Email text

Subject: ST John Choir Email Blast 11/25  (Connie Russell, sent 2026-11-25 16:33Z)

Greetings all.

Here is the Link for this week's music (tonight, Sat, Sun).
St John of Damascus Choir - This Week @ St. John's
<https://sites.google.com/view/st-john-of-damascus-choir/this-week-st-johns>

Here is the link to the Hierarchical Recording. [...] It's a big file.
<https://sites.google.com/view/st-john-of-damascus-choir/special-services/hierarchical-liturgy>

And finally, here is the link to the new liturgy music that we will begin
using this Sunday.
St John of Damascus Choir - Choir Practice & Prep
<https://sites.google.com/view/st-john-of-damascus-choir/calendarschedule/choir-practice-prep>

Hope to see you this evening at the Akathist service.
--
Blessings,
J & C

=== This Week page (verbatim link list) ===
Akathist of Thanksgiving 11/25  -> drive 1SZeaCy08r_EdnmQidY0VlNvmwrSB9BJK
Great Vespers 11/28             -> drive 1cp31NDZNStRga3AFnTCwH5jQHhNJnqhG
Divine Liturgy 11/29            -> drive 13MDfeyTRR1YAU9szTy1V0CSV7wkSEgiZ
"Warm-up begins 30 minutes prior to each service."

=== Choir Practice & Prep page ===
O Heavenly King -> 1qYDpMSuN3nwPCFeY4K7UtuIyAB7RY4B7 (page label order; see manifest)
Liturgical Reading Cadences / Byzantine Lord Have Mercy / Akathist of Thanksgiving Prep Music
Liturgy #2 - Greek Antiphons -> 1MRA8UaIR6aS6lUFaH8QYWBuen6AFDFCd
YouTube: Greek Antiphon 1, Greek Antiphon 2, Greek Antiphon 3 - Beatitudes,
Serbian O Come let us Worship, Anaphora - Feofenofskye (Sop/Alto), It Is Truly Meet - Zakuk

=== Rector's "This Week at St. John's - November 22" (sent 11-24) ===
Wednesday - Akathist of Thanksgiving at 6:00 PM followed by confession
Saturday - Akathist to St. Catherine of Alexandria at 9:00 AM; Great Vespers at 6:00 PM
Sunday - Divine Liturgy at 10:00 AM

## Directives

<!-- One row per instruction in the body that affects what we render.
     PROPOSED only — nothing here is applied. Route via /choir-correction. -->

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| | | | | |

## Directives (choir-week Step 5, 2026-11-25)

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| "Hope to see you this evening at the Akathist service." — Akathist of Thanksgiving Wed 11-25 6 pm replaces Daily Vespers. Sheet byte-identical to packet 2026-11-10 `_unclassified/` (20 pp: Kontakion 1–13 + Ikoi, closing Ikos 1 + Kontakion 1; no Usual Beginning, no closing prayer in the choir copy) | one-off print (no `akathist` service in the catalog) | Tyler | high | proposed |
| "here is the link to the new liturgy music that we will begin using this Sunday" — Liturgy #2: Greek antiphons (Royster translation), Eisodikon 2, Holy God 2, Cherubic 2, Zakkak It Is Truly Meet ("Thee version"), Feofanovsky Anaphora; runs 11-29 → start of Great Lent (per 11-11 blast) | music-setting if words match our render; text-overlay / date-range `antiphonSet` only where words differ | Tyler | high | proposed — compare words first |
| Liturgy 11-29 sheet pp. 9–11: "Stikhera for the Preparation of Nativity" headed "Nativity Fast — Pre-communion Hymns" (Tones 3, 2, 6, 4 …) | new: seasonal pre-communion hymns during the Nativity Fast; not in our render | Tyler | high | proposed |
| Rector: "Saturday - Akathist to St. Catherine of Alexandria at 9:00 AM" | none posted by the choir; no render | Tyler | medium | note only |
| Hierarchical Liturgy recording link | none | — | high | no action |

## Great Vespers 11-28 review (2026-11-25)

Read all 13 pages visually; oracle `reference/orders/2026-1129` ("7 stichera of the
Resurrection, Tone 1 / 3 stichera of St. Paramon, Tone 4 / Glory… now and ever…
Dogmatic Theotokion"). Fixed the same day (corrections_log #24-28):

| # | Piece | Packet | Was | Bucket → fix |
|---|---|---|---|---|
| 1 | LIC Paramon (1) | "The honored choir of athletes" | "Clothed in a character of innocence" (Acacius, mis-keyed) | data: split 9468 → 10844; 9473-9476 → comm 2440 |
| 2 | LIC Glory | none — Glory/Now = Dogmatikon | Menaion Theotokion 9477 at Glory | data: 9477 order 0 → -1 |
| 3 | LIC count | 7 Resurrection (10-4, ends "Let us praise the Word") | base doubled #1; Tyler 6 | structure: tone1 `_alsoNumberedSticheron` + for-date.js promotes with no Menaion Glory; D25 |
| 4 | LIC Paramon (2) | OCA music "Witnessing a great multitude" | St Sergius "Having witnessed" | variant `paramon-lic-v2` / `-v1` (oca-music) |
| 5 | Troparion (also Liturgy p.3) | "Your… Philumenus… You" | "Thy… Philoumenus… Thee" | variant `paramon-troparion` (oca-music) |
| 6 | Aposticha 3, 4 | "tasted death? Thou", "myrrh" | "deathThou", "myrhh" | octoechos.json typo |

Matched: LIC verses + tone, Paramon (3) "Manifestly illumined", Dogmatikon, Aposticha
4 + Theotokion, Resurrection troparion, Tone 4 dismissal Theotokion.
Not changed (user decision pending): Connie's typed Resurrection stichera wording
("Sion", "O heavens: be glad", "lover of mankind", word order in "We stand unworthily").

## Liturgy 11-29 review (2026-11-25)

Read all 11 sheet pages and all 21 pages of the Liturgy #2 set (packet 2026-11-16
`_unclassified/Liturgy 2 Greek Antiphons.pdf`, incl. Zakkak It Is Truly Meet and
"O Lord Born of the Virgin"). Oracle `reference/orders/2026-1129` (Liturgy):
troparia/kontakia order matches ours exactly; 8 Beatitude troparia ✓.

**Fixed 2026-11-25 (this Sunday's items, corrections_log #29-33):**

| # | Piece | Packet | Was | Fix |
|---|---|---|---|---|
| 1 | Paramon kontakion | you/your, "Philumenus", ends "Always fervently intercede…" (p.6 continues p.5) | "thou didst cleanse… didst **renounc**" | variant `paramon-kontakion` (oca-music) |
| 2 | yy→tt stemmer | — | "didst renounc/estrang/urg" in 9 tt troparia | data + `stemRegularPast` -ced/-ged rule + drift soft-stem check |
| 3 | Res. kontakion T1 | "As God, Thou didst rise from the tomb in glory" (© 2020) | "Thou hast risen from the grave as God" | Tyler octoechos overlay |
| 4 | Prokeimenon T1 verse | "Rejoice in the Lord, ye righteous; praise becometh the upright." | "…O you righteous! Praise befits the just!" | Sunday prokeimenon via the variable-source cascade + Tyler overlay |
| 5 | Pre-communion | 7 "Stikhera for the Preparation of Nativity" (T3 x3, T8, T2, T6, T4) | none | `seasonal-communion-hymns.json` (empty base) + Tyler overlay, 11-15..12-24 |

**Open — Liturgy #2 switch (11-29 → start of Great Lent), awaiting the user's decisions
(mechanism = date-range set; Parish Book edition):** Eisodikon "O come… Save us, O Son of
God…"; Beatitudes in Royster wording ("those who mourn… pure in heart… sons of God…
Blessed are you… exceedingly glad"); First Antiphon without the "Through the intercessions"
refrain, ending "…bless His holy name. Blessed art Thou, O Lord"; Second Antiphon opening
with "Glory to the Father…"; Anaphora "We hymn Thee… O our God", "cometh", "Sabaoth";
Zakkak "Who without corruption gavest birth"; Slavonic Trisagion spelling "Svyati Boshe";
"O Lord, born of the Virgin" (tone 6) at communion. Unread pen mark "N+E" on p.3.

**Decided 2026-11-26 (user):**
- Switch = a **dated window**: Liturgy #2 texts render for 2026-11-29 through Forgiveness
  Sunday 2027-03-14 only; earlier dates keep Liturgy #1. Needs a new date-gated "seasonal
  picks" layer — `parish_variant_picks` has no dates today.
- After the window, **Liturgy #1 returns** at Clean Monday 2027-03-15; revisit when Connie
  sends Lenten music.
- **Parish Book prints the Liturgy #1 Beatitudes**; the weekly sheet carries the Royster
  Beatitudes during the window.

**Built 2026-11-26** as the dated seasonal layer `greek-chant-royster-liturgy`
(`fixed-texts/seasonal-layers/`), window in Tyler's `rubrics_extra_json.seasonalLayers`.
Texts read from all 21 pages of `2026-11-16/pdf/_unclassified/Liturgy 2 Greek Antiphons.pdf`.
Beyond the list above, the set also changes: Psalm 145 without "Blessed is he who hath the God
of Jacob" (bars 28-70 skipped); Cherubic Hymn (Royster, with the setting's repetitions);
Greek Trisagion transliteration "Agios o Theos, Agios Iskiros…". The Parish Book does NOT get an
insert in the window: those 15 Sundays print the full booklet (the insert can only carry the
troparia-to-Gospel stretch). Open: order of "O Lord, born of the Virgin" vs the Nativity-Fast
stichera at communion (placed after them); unread pen mark "N+E" on p.3.
