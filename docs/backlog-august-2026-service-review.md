# Service-review backlog — opened 2026-08-22

> **Superseded in part, 2026-08-29.** A follow-up audit of 8-29 Vespers and 8-30
> Liturgy re-verified items **1, 4 and 5** with row-level evidence and widened
> item 1 to cover Vespers as well as the Liturgy. It also found four new defects
> and carries the sequenced plan for all of them. Read
> [`backlog-2026-08-29-vespers-liturgy-review.md`](backlog-2026-08-29-vespers-liturgy-review.md)
> first. Items 2, 3, 6, 7, 8 are open here only.

From a review of Vespers and Divine Liturgy for 8-22/8-23 and 8-28/8-29/8-30,
against the OCA orders in `reference/orders/` and the St Sergius menaion.

**Every one of these five dates passed `npm run audit:date` clean — 0 high, 0
medium, 0 low.** Nothing here was caught by a rule. That is itself item 9.

Items are grouped by ROOT CAUSE, not by date, because four of them each break
several dates at once. Priority is by value × blast radius, not by calendar.

Legend: **↻ annual** = recurs every year on these dates · **⇢ N dates** = how
many other dates share the cause.

---

## P0 — 1. A leavetaking does not inherit the feast's hymns

**⇢ ~20 dates · ↻ annual · breaks BOTH weekends**

The single highest-value item. Two very different-looking symptoms, one cause.

**8-22 Great Vespers (Leavetaking of the Dormition).** At Lord I Call we sing
three Tone-4 hymns from the General Menaion's generic `theotokos` fallback
("In a divine manner thou dost preserve and shelter from all attacks of the
enemy…"). The order appoints **6 stichera of the Feast, Tone 1**. Those hymns
are in the DB — under 8-15 ("Oh, the marvelous wonder! The source of Life is
laid in a grave…"). 8-23 has **zero** rows in `stichera`, so the resolver falls
through to the generic set.

Downstream of the same cause, all on 8-22:
- split is 7 Resurrection + 3 feast; the order says **4 + 6**
- Glory is a generic Tone 6; the order wants the Feast, Tone 1
- Aposticha splits "Glory… now and ever… Feast, Tone 4", which the order joins
  on one hymn, and gives Now-and-ever a generic Octoechos Theotokion
- Closing troparia do the same: the order reads "Glory… now and ever… Troparion
  of the Feast, Tone 1", one hymn for both, and we print the feast troparion at
  Glory then ADD a Resurrectional Dismissal Theotokion at Now-and-ever

  That is **three** places on one sheet where we split a "Glory… now and ever…"
  the order joins. On a leavetaking the feast claims both halves and displaces
  the Theotokion entirely — worth fixing as its own sub-rule, since it is a
  shape, not three separate bugs. NB this is NOT the recorded
  `dismissal-theotokion-keyed-by-troparion-tone` divergence, which is about
  which TONE the Theotokion takes, not whether one appears at all.

**8-30 Liturgy (leavetaking of the Beheading).** The Forerunner's troparion
(Tone 2) and kontakion (Tone 5) are missing; the order appoints both. We render
only Resurrection + St Alexander. The texts exist — we render them correctly on
8-29.

**Fix:** the afterfeast layer, `afterfeastOf` (see `[[project_afterfeast_modeling]]`
in memory — "~20 dates remain"). A leavetaking/afterfeast date must resolve its
proper hymns from the feast day before any generic fallback is considered.

**Verify:** 8-22 Lord I Call shows 4 Resurrection + 6 Dormition Tone 1, Glory =
Feast Tone 1. 8-30 Troparia include the Forerunner Tone 2, Kontakia the
Forerunner Tone 5.

**Rule that closes it:** the General Menaion generic fallback must never fire on
a date whose principal is an afterfeast, leavetaking, or feast window. That is a
structural assertion and it would have caught this the first time.

---

## P0 — 2. Second propers missing on 8-23

**⇢ 1 date · ↻ annual · sources already on disk**

The order appoints two of each; we render the Sunday set alone:

| Appointed | Ours |
|---|---|
| Prokeimenon, Feast Tone 3 — "My soul doth magnify the Lord…" | missing |
| Alleluia, Feast Tone 8 | missing |
| Communion — "I will receive the cup of salvation…" | missing |

**The prokeimenon and the koinonikon are already downloaded** — both are printed
verbatim in the AT LITURGY section of `st-sergius.org/services/Emenaion/08-16.pdf`,
pulled 2026-08-15. The Tone-8 alleluia still needs sourcing; that same book gives
the Dormition alleluia as **Tone II** ("Arise, O Lord, into Thy rest"), which does
NOT match the order's Tone 8 — do not assume they are the same verse.

**Fix:** an `8-23` entry in `variable-sources/cocelebrated-overlays.json`, exactly
the shape of the `8-16` entry shipped in `dbd214e`. No code — `overlay.prokeimenon`
/ `.alleluia` / `.communionHymn` already attach as `.secondary`.

**Rule:** extend the 8-16 contract — a date whose order names two prokeimena must
render two.

---

## P1 — 3. Beatitudes are blocked on every weekday, and say so out loud

**⇢ every weekday feast · ↻ annual**

On 8-29, the Beheading, the Third Antiphon prints this to the choir:

> *"Beatitudes troparia for this day are not yet in the system. Verses continue
> without interspersed troparia."*

**The source exists.** `variable-sources/menaion/august-29.json` carries a full
Tone-8 canon with 8 troparia in both ode 3 and ode 6. The blocker is one line —
`if (!isSunday) return [];` in `server-lib/sources/beatitudes.js`.

Related but separate: an apologetic rubric should never reach a service sheet at
all. Whatever the outcome, that string should go.

**Fix:** allow the blend machinery (`FEAST_BEATITUDES_BLENDS`, shipped `eb2bbb0`)
to run on a weekday feast, sourcing ode 3 + ode 6 from the menaion canon.

**⚠ Do not repeat the 8-16 mistake:** the renderer RIGHT-ALIGNS troparia into the
twelve slots. Decide the appointed count first and reserve any unsourced slots
with `missing: N`, or every troparion lands on the wrong stichos. See
`[[feedback_assert_structure_not_labels]]`.

**Rule:** INV asserting which stichos each troparion falls on — not the count,
not the sequence. Both of those were correct on 8-16 while the render was wrong.

---

## P1 — 4. Footnote digits glued into sung text

**⇢ 174 rows · corpus-wide**

Next Sunday's principal saint carries one:

> "Christ, the God over all,**1** has appointed thee as a venerable shepherd…"
> — `troparia` id 39538, St Alexander of Constantinople, sung 8-30

174 rows in `troparia` match the artifact ("your nous,1", "A great exploit2 of
faith", "water of rest,3"). `stichera` is clean — 0 rows. Scraper residue from
footnoted sources, and it would be read aloud as printed.

**Fix:** a sweep like the unclosed-quote repair in `0dae06a` — locate by path,
surgical `raw.replace` on the JSON/DB text, abort unless exactly one match.
Triage first: some digits may be real (verse numbers, "Tone 4").

**Rule:** extend the `validate-schemas` text-hygiene pass (added `0dae06a`) with
a glued-digit check. Straight-quote balance gates there already; this is the same
family and the same place.

---

## P1 — 5. We add propers on 8-30 the order does not appoint

**⇢ unknown, likely many ordinary Sundays with a ranked saint**

The inverse of item 2. On 8-30 the order gives the Resurrection set **only**, and
we add a Tone-1 second prokeimenon, a Tone-2 second alleluia, and a second
koinonikon for St Alexander. Source is the general-menaion-propers fallback
(`gmp`) attaching a `.secondary` for any ranked saint.

Not obviously a bug — many parishes do sing the hierarch's prokeimenon — but it
diverges from the published order, and we should know which we mean. Decide, then
either scope the `gmp` fallback or record it in `audit/judge-known-divergences.json`
with a reason. **A gap we have not got around to is not a divergence** — that file
has a stated bar.

---

## P2 — 6. No Old Testament lessons at any vigil

**⇢ systemic · every Great Feast**

The Beheading vigil (8-28) has the Litya and the Blessing of Bread but **no
paremias**; Great Vespers of the feast appoints three. Not local to 8-29 —
Transfiguration eve (8-05) and Dormition eve (8-14) have none either.

`otReadings` is supported (`assemblers/vespers.js` consumes it) and populated for
~8 menaion dates (june-19, august-09, september-21, april-30, june-11, july-23,
july-12, july-08). The Great Feasts are simply missing the data.

**Fix:** a data-acquisition track, not a code change. Scope which dates need
lessons, then source them. The St Sergius PDFs print them (the 8-16 pull shows
"READING FROM THE BOOK OF DEUTERONOMY" twice), so the pipeline that closed the
8-16 prokeimenon gap likely closes this too — the scrape took Vespers stichera
and Matins and skipped the lessons.

**Rule:** a Great Feast vigil without an OT-readings section should fail.

---

## P2 — 7. The Beheading has no doxastikon, and a duplicate row

**⇢ 1 date · ↻ annual**

At 8-28 Lord I Call, four idiomela doubled to eight is correct, but the **Glory
re-uses sticheron #1** instead of a proper doxastikon, and Glory and Now-and-ever
are merged onto a single line. The DB has 5 `lordICall` rows for 8-29 where
orders 0 and 1 are **the same text** (ids 7745, 7741).

Check the St Sergius 8-29 PDF for the doxastikon and the Theotokion before
concluding they don't exist — that is exactly how the 8-16 prokeimenon was found
after I had written it off. See item 10.

---

## P2 — 8. Carry-overs still open

- **Dormition Canon I (Cosmas, Tone 1) has no ode troparia anywhere.**
  `menaion/august-15.json` has `irmos` + `irmos2` for every ode and nothing else.
  Blocks the last 2 Beatitude troparia on **8-16** and all 4 on **8-23** (Ode 9).
  Check the St Sergius book before calling it unsourceable.
- **Does the parish sing blended Beatitudes at all**, or the plain Octoechos set?
  Asked 2026-08-15, unanswered. If the plain set, the 8-16 blend should come out.
- **Register on the 8-16 prokeimenon** — Lambertsen "hath wrought" vs OCA "has
  done". One-word swap if the director prefers.
- 8-29 **Matins** has 5 untracked provenance gaps. Outside the Vespers/Liturgy
  scope of this review; not yet looked at.

---

## 9. The meta-item: the audit is blind to all of the above

All five dates returned 0 high / 0 medium / 0 low. The rules check structure that
is present; nothing checks that the RIGHT hymn is in a slot, that a fallback did
not fire where a proper text was appointed, or that sung text is clean.

Each item above names the rule that closes it. **Land the rule with the fix, in
the same commit** — that is the standing pattern here, and items 1, 3 and 4 are
each a regression class rather than a single date.

## 10. Standing lesson for everything on this list

Three separate items above ("no doxastikon", "Canon I unsourceable", "no
paremias") are conclusions of the form *"the text does not exist."* Every such
conclusion drawn in the last two weeks has been **wrong** — the 8-16 prokeimenon
was written off after searching all 469 order files, and was sitting in an
`AT LITURGY` section the scraper had skipped, in a book already cited in the same
file's own `_note`.

**Before recording anything here as unsourceable, check what the SCRAPER skipped,
not just what our data contains.**
