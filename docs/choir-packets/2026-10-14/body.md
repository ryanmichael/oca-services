# Choir blast — 2026-10-14

**Subject:** St John Choir Email Blast 10/14

## Email text

Greetings all.
Below is the link to the service texts for Oct 14, Oct 17-18, and Oct
24-25. You DO NOT need to print these as they will be in the choir
notebooks when you arrive for warmup.
 St John of Damascus Choir - This Week @ St. John's
<https://sites.google.com/view/st-john-of-damascus-choir/this-week-st-johns?authuser=0>

We will have Wednesday PM rehearsal after Vespers if you are able to stay.
We will also have FULL CHOIR REHEARSAL Sunday, Oct 18 following coffee hour
- as originally planned. Father has given catechumens permission to go to
choir instead of class this week. Below is the link to the Hierarchical
Liturgy music we have been practicing. Please review at your convenience.
St John of Damascus Choir - Hierarchical Liturgy
<https://sites.google.com/view/st-john-of-damascus-choir/special-services/hierarchical-liturgy?authuser=0>

Jeff and I will be out of town from October 19 - 29, but can always be
reached by phone, text, or email. J- 903.258.3016, C- 903.520-0732

Hope to see you at services this evening.

--
Blessings,
Jeff & Connie

=== Google Site page text (site: st-john-of-damascus-choir / this-week-st-johns) ===
Links published on the page:
  Daily Vespers 10/14    -> drive id 1maV5XiG9AYWE18-Y4Gj_ZQnGHWVRofgL
  Great Vespers 10/17    -> drive id 1OwDSyWsTgaabiSrqrbt7Q3qqILF_toUW
  Divine Liturgy 10/18   -> drive id 1RSuqj0z6Ln1P0hqK03Uue18nOXC8DbrA
  Great Vespers 10/24    -> drive id 1HuHDbnvgakHaUYIShs22RLyeuvph4iHO
  Divine Liturgy 10/25   -> drive id 1Y72o04dV9goio0z_IIPhu8a2FRM7CugY
  "Outlines of Upcoming Services (OCA) Saturday PM & Sunday AM (does not include music)"
        -> https://www.oca.org/liturgics/rubrics/order-of-upcoming-services

Page notes, verbatim:
  "FULL CHOIR REHEARSAL SUN, OCT 18"
  "Warm-up begins 30 minutes prior to each service."
  "We will briefly rehearse the changeable music and provide any special instructions about the service."
  "If you are unable to make it to warm-up, Fr. Joshua prefers you not sing that service."

## Directives

<!-- One row per instruction in the body that affects what we render.
     PROPOSED only — nothing here is applied. Route via /choir-correction. -->

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| "Below is the link to the Hierarchical Liturgy music we have been practicing." — the Nov 8 Bishop Gerasim visit is a **Hierarchical** Divine Liturgy, a service shape we do not model. Rector adds the choir sings *"Τόν Δεσπότην καὶ Ἀρχιερέα ἡμῶν, Κύριε φύλαττε· εἰς πολλὰ ἔτη, Δέσποτα"* during the vesting, and *"εἰς πολλὰ ἔτη, Δέσποτα"* / "Many years to you, Master!" **"several times throughout the Liturgy."** | service-catalog entry + new service shape (NOT a text overlay) | Tyler only, 2026-11-08 | high | proposed — forward-dated, out of scope for this packet |
| "Warm-up begins 30 minutes prior to each service." / "If you are unable to make it to warm-up, Fr. Joshua prefers you not sing that service." | none — rehearsal logistics | n/a | high | no render impact |
| "FULL CHOIR REHEARSAL SUN, OCT 18 following coffee hour"; "Wednesday PM rehearsal after Vespers" | none — rehearsal logistics | n/a | high | no render impact |

## Signals (not directives)

- **"Jeff and I will be out of town from October 19 - 29."** This explains the
  verify's one medium finding (`missing-weekly`, no sheet for Wed Daily Vespers
  2026-10-21) and predicts the same for 2026-10-28. The absence is expected, not
  a dropped sheet — do not chase it.
- **The intake shape changed.** This blast carried **no attachments**. The texts
  are published as five Google Drive links on a new Google Site,
  `sites.google.com/view/st-john-of-damascus-choir/this-week-st-johns`, with a
  second page for the Hierarchical Liturgy. Drive ids are recorded above and the
  files were fetched with `curl -L "https://drive.google.com/uc?export=download&id=<id>"`.
  `choir:fetch --source manual` handled them unchanged once downloaded, but the
  skill's Step 2 ("ask the user to drop the attachments") no longer describes the
  source. The site also links the OCA
  `order-of-upcoming-services` rubrics page as the director's own cross-check.
- The site page masthead still reads "September 14 / Exaltation of the Cross" —
  stale banner, unrelated to these five files.
