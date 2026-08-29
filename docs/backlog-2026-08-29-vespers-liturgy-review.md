# Service-review backlog — opened 2026-08-29

From an audit of **Great Vespers for Saturday 8-29 evening** (date-shifted to
8-30 content) and the **Divine Liturgy for Sunday 8-30**, against
`reference/orders/2026-0830-order-services.txt` and `oca.db`.

Both services returned **0 high / 0 medium / 0 low** from `npm run audit:date`,
and `npm run drift:check` returned `OK`. Ten defects below. That is item 9 of the
[8-22 backlog](backlog-august-2026-service-review.md) recurring — but sharper,
and see item **N4** for why.

8-30 is the **13th Sunday after Pentecost + Afterfeast of the Beheading of the
Forerunner** + Sts. Alexander, John and Paul, Patriarchs of Constantinople. The
word "Forerunner" does not appear anywhere in our commemoration list for the date.

Legend: **↻ annual** = recurs every year · **⇢ N dates** = blast radius ·
**NEW** = not in the 8-22 backlog · **CONFIRMS** = 8-22 item, re-verified live
with row-level evidence.

**What is already correct** — and should not be touched: Lord, I Call is right
end to end (4 Resurrection T4 + 3 Forerunner T4 + 3 Saints T1, Glory T6
Forerunner, Now-and-ever Dogmatikon T4). At the Liturgy: Beatitudes (8
Resurrection T4), Epistle 1 Cor 16:13-24, Gospel Mt 21:33-42, the Resurrection
prokeimenon and alleluia, and the kontakia chain ending in "Steadfast
Protectress" T6.

---

## P0 — N1. Troparia parsed into the stichera table, evicting real Glory hymns

**NEW · ⇢ 17 rows, 13 of them in Glory slots · ↻ annual · DONE for 8-30, sweep OPEN**

At 8-30 Great Vespers the Aposticha Glory rendered:

> "Troparion of the holy hierarchs O God of our fathers, * ever deal with us
> according to Thy meekness…"
> — `stichera` id 9043

Three things wrong in one row: it is a **troparion**, not a sticheron; it is the
**hierarchs'**, where the order appoints **Forerunner, Tone 4**; and its own
rubric heading is **glued into the sung line**.

**The mechanism** (confirmed against the St Sergius source PDF, not inferred):
the parser runs past the end of the `AT VESPERS` aposticha block and swallows the
two concluding troparia. Because `insertStichera` writes Glory to `order=0`, the
**last** `Glory ...` line it sees wins — so the hierarchs' dismissal troparion
took `order=0` and pushed the real Aposticha Glory down to `order=1`, out of the
slot the assembler reads.

The source reads:

> "On the Aposticha, the Stichera from the Oktoechos; and **Glory ..., in Tone IV:**
> Herod celebrated an unseemly birthday…"

So the correct Glory was `stichera` id **9041**, and row 9042 ("The memory of the
just…") was never a sticheron either — it is the **Forerunner's Troparion, Tone II**,
already held correctly in `troparia` as ids 39535 / 2849.

**A trap worth recording:** the first draft of this plan named 9042 as the Glory,
reasoning from the text alone — "The memory of the just" is the famous Beheading
doxastikon. It is the *troparion*. Reading the source PDF is what caught it. Do
not re-key a Glory slot from the text's reputation.

**Fixed for 8-30** (2026-08-29, `/tmp/fix-8-30-aposticha.sql`): deleted 9042 and
9043, promoted 9041 to `order=0`, relabelled it and 9039 to `the holy forerunner`.

**Still open — the sweep.** 17 rows corpus-wide open with a genre heading, **13 of
them at `order=0` or `-1`**, i.e. sitting in Glory slots on other dates:

```
ids 6971 8205 8275 8276 8320 8564 8738 8852 8950 8951 9067 9253 9274 9305 9352 9377
```

Each needs the same per-row source check — several are on **feast** dates
(8276 "Troparion of the feast", 8951 Transfiguration), where the eviction is
likelier to matter. **Do not bulk-delete on the pattern.**

**Rule that closes it:** no row in `stichera` may begin with a rubric genre
heading. See N4 — `drift:check` has a rule named for exactly this and it did not
fire, before or after the fix.

---

## P0 — N2. Vespers Troparia drop the Forerunner too

**NEW · ⇢ same ~20 afterfeast dates · ↻ annual**

The [8-22 item 1](backlog-august-2026-service-review.md) recorded that 8-30's
**Liturgy** loses the Forerunner. It also loses him at **Vespers**, which that
review did not reach:

| Slot | Order appoints | We render |
|---|---|---|
| Glory | Troparion of the Forerunner, **Tone 2** | Troparion of St Alexander, Tone 4 |
| Now and ever | Resurrectional Dismissal Theotokion, **Tone 2** | same hymn, Tone 4 |

The Theotokion is downstream — it keys off the preceding Glory's tone (the
recorded `dismissal-theotokion-keyed-by-troparion-tone` divergence). Fix the
Glory and the tone follows. **One root cause, not two.**

Same root cause as the Liturgy gap: **no afterfeast layer**. Every missing text
already exists in `oca.db` under 8-29, commemoration id 1756:

| Needed | Row |
|---|---|
| Vespers Troparia Glory · Liturgy Troparion, T2 | `troparia` id 39535 |
| Liturgy Kontakion, T5 | `troparia` id 39534 |

**This is the same `afterfeastOf` work as 8-22 item 1** — do not open a second
track. This entry only widens its acceptance criteria.

**Verify:** 8-30 Vespers Troparia read Resurrection T4 / Glory Forerunner T2 /
Now-and-ever Theotokion T2; Liturgy troparia include the Forerunner T2 and
kontakia the Forerunner T5.

---

## P1 — N3. The assembler overwrites row labels with the principal saint's name

**NEW · ⇢ every date with a multi-commemoration menaion block · systemic**

All seven menaion hymns at 8-30 Lord, I Call — plus the Glory — are labeled
**"Saint Alexander, Patriarch of Constantinople"**, including the three that are
about the Forerunner. The hymns are right; the booklet announces the wrong saint
over them.

The DB is correct. Rows 9033-9035 carry `label = 'the holy forerunner'`,
9036-9038 carry `'the holy hierarchs'`. `server-lib/assemble/for-date.js` throws
them away at five sites (lines ~309, 321, 344, 357, 391, 445, 465) with a bare
`label: primary.title`.

Two paths, two conventions: lines 153 and 158 in the same file already do the
right thing with `s.label || c.title`.

**Fix:** `s.label || primary.title` at every site. Mechanical.

**Also, data-side:** row **9039** — the Lord, I Call Glory, whose text is
plainly the Forerunner's ("Again Herodias rageth insanely…") and which the order
assigns to the Forerunner — is labeled `the holy hierarchs` in the DB. Mis-keyed
at ingest. Fix with N1's transaction.

**Rule that closes it:** a rendered block's label must not name a commemoration
whose subject the block's text contradicts. This is the `Stichera
label↔commemoration subject match` rule that already exists and passed clean —
see N4.

---

## P1 — N4. Two drift rules that exist for exactly these bugs did not fire

**NEW · meta · sharper than 8-22 item 9**

The 8-22 review concluded "nothing checks that the right hymn is in a slot."
That is too generous. `npm run drift:check` on this data printed:

```
Stichera↔commemoration subject match: clean
Stichera label↔commemoration subject match: clean
Rubric bleed in sung text: clean
```

while row 9043 begins with a literal rubric heading, and three Forerunner hymns
sit under a hierarch commemoration with a hierarch label. **The rules are not
missing. They have escape hatches wide enough to pass their own headline case.**

This matches the standing lesson recorded in memory as
`feedback_assert_structure_not_labels`, and the 08-08 handoff note that audit
rules have escape hatches masking whole classes.

**Fix:** before writing any new rule for N1 or N3, read the three existing rules
in `scripts/drift-check.js` and establish **why** each passed. Then falsify the
repaired rule against row 9043 and row 9039 — prove it fails on today's data
before trusting a green.

Do not add a fourth rule next to three that do not work.

---

## P1 — N5. CONFIRMS 8-22 item 5 — propers we add that the order does not appoint

**⇢ likely many ordinary Sundays with a ranked saint**

Re-verified live at the 8-30 Liturgy. The order gives the Resurrection set alone;
we add all three:

| We add | Order |
|---|---|
| Prokeimenon Tone 1 (St Alexander) | Resurrection T4 only |
| Alleluia Tone 2 (St Alexander) | Resurrection T4 only |
| Koinonikon "The righteous shall be in everlasting remembrance" | "Praise the Lord from the heavens" only |

Note the shape this makes with N2: on the same service we **over-serve a
simple-rank saint** with full second propers while **dropping the afterfeast
entirely**. Worth deciding together — they are the same resolver making opposite
errors about who ranks.

Still a decision, not yet a bug. 8-22's framing holds: scope the `gmp` fallback,
or record it in `audit/judge-known-divergences.json` with a reason. **A gap we
have not got around to is not a divergence.**

---

## P2 — N6. CONFIRMS 8-22 item 4 — glued footnote digit, now in tomorrow's text

**⇢ 174 rows**

Confirmed live in a hymn sung tomorrow at both Vespers and Liturgy:

> "Christ, the God over all,**1** has appointed thee as a venerable shepherd…"
> — `troparia` id 39538 (and its `yy` twin, id 2854)

Same rows also carry a podoben rubric inside the sung text:
`(Podoben: "Go quickly before us...")`. That is the **N1 artifact** in the
`troparia` table — the corpus sweep should cover both tables and both artifacts,
not just digits.

---

## P2 — N7. Small residue from the Step 1 repair

**NEW · each one row · none affect 8-30, all recorded so they are not lost**

- **The 8-30 Aposticha Stavrotheotokion was never scraped.** The source prints
  "Both now ..., Theotokion, or this Stavrotheotokion, in Tone IV: Upon beholding
  Thee, * the Lamb and Shepherd…" and we have no row for it. Harmless on a Sunday
  (the Resurrectional Theotokion wins) but wrong on a weekday occurrence. Same
  parser truncation as N1 — likely a class, not one row.
- **CORRECTION (same day).** This entry originally read: *"a second Saints'
  troparion exists that we now discard… we render the OCA text (39538) instead,
  which is correct per project convention."* **That was wrong**, and the choir
  director's own book disproves it — see N8. Row 9043's text is not a St-Sergius
  variant to be discarded; it is the OCA text for these saints. The deletion from
  `stichera` was still correct (a troparion at `order=0` was being sung as the
  Aposticha Glory), but the text needs to be **added to `troparia` for comm 1760**,
  not dropped.
- **The podoben was stripped, not relocated.** `(Podoben: "Go quickly before
  us...")` is real and useful to a choir; it belongs in a rubric field, not in the
  sung line. `troparia` has no `label` column, so there was nowhere to put it.
  Worth a column before the N6 corpus sweep strips ~174 more.
- **Row 9040** (8-30 LIC Stavrotheotokion) is still labelled `the holy hierarchs`;
  it belongs to neither saint. Does not render on a Sunday.

---

## P0 — N8. We render the wrong Saints' troparion, and omit the parish patron

**NEW · found by reading the choir director's books, not the audit · ⇢ 8-30 + the
patron case is every parish, every Sunday**

The director's 8-30 Divine Liturgy book settles two things the order file left
open, and corrects one of my own conclusions.

**(a) The Saints' troparion.** The parish sings, from OCA-published music
(© 2008 OCA, Russian Imperial Court Chant):

> "O God of our Fathers, always act with kindness towards us; take not Your mercy
> from us, but guide our lives in peace **through the prayers of the Patriarchs
> Alexander, John, and Paul.**"

That is the text of deleted row **9043** — the row I characterised this morning as
a St-Sergius variant safely discarded in favour of `troparia` 39538. It is not.
39538 ("Christ, the God over all… O Godly-wise **Alexander**") is a **single-saint**
troparion naming Alexander alone; 8-30 is a **joint** commemoration of three
patriarchs, and the OCA text names all three. We render the single-saint text at
both Vespers and the Liturgy.

**Fix:** add "O God of our Fathers…" to `troparia` for comm 1760 and prefer it on
the joint commemoration. **Decide which is canonical before writing** — do not
repeat this morning's mistake of reasoning from convention instead of the source.

**(b) The parish patron is omitted entirely.** The order appoints "Troparion of
the Church (if of Theotokos or Patron Saint)" and "Kontakion of the Church (if of
Patron Saint)". Tyler's patron is St John of Damascus
(`parish_settings.patron_natural_key = 12-04/john-of-damascus`), and their book
carries his Kontakion, Tone 4 ("Let us praise the illustrious hymnographer
John…"). We emit no patron troparion or kontakion at all. See
`[[project_patron_of_temple]]` — the `features/` spec exists; it is not wired into
the Liturgy troparia/kontakia chain.

This is not 8-30-specific. **Every parish named for a saint is missing its own
patron from every Sunday Liturgy.**

**Rule that closes it:** for a parish with a `patron_natural_key`, the Liturgy
troparia and kontakia must contain the patron's hymns, or explicitly record why
not (the order brackets them only for a church named for the Theotokos).

---

## What the director's books confirm, and what they cost us

Read against the four PDFs in `docs/8-29/`:

| Slot | Parish book | Ours | |
|---|---|---|---|
| LIC Baptist ×3, Fathers ×3, Glory T6, Dogmatikon | ✓ | ✓ | match |
| Vespers Aposticha Glory | "Herod celebrated an unfitting birthday…" T4 | **now ✓** | fixed by 8f9785e |
| Vespers Troparia | Resurrection T4 → **Forerunner T2** | Res T4 → St Alexander T4 | **N2** |
| Liturgy Troparia | Res T4 → **Forerunner T2** → Saints T4 | Res T4 → Saints T4 | **N2** |
| Liturgy Kontakia | Res T4 → **Forerunner T5** → … | Res T4 → Saints T8 → Protectress | **N2** |
| Saints' troparion | "O God of our Fathers… Alexander, John, and Paul" | "Christ, the God over all… Alexander" | **N8a** |
| Patron kontakion | St John of Damascus, T4 | absent | **N8b** |

**The Aposticha Glory fix landed on the right hymn** — independently confirmed by
the director's book, which was not consulted when the fix was made.

**Open question for the director, not inferable from the books.** The Resurrection
stichera sheet is a reusable Tone-4 packet printing all 7 (stichoi 10-4); the
8-30 insert supplies 6 menaion hymns. 7 + 6 = 13 into 10 stichoi. Almost certainly
the intended set is the order's **4 + 3 + 3** (which is what we render), with the
packet's numbering vestigial — but that is inference. **Ask.** This is exactly the
practice-layer question in `[[project_practice_layer]]`: which stichoi are sung.

**Register.** The books are modern ("you/your"); we render the DB-sourced hymns
thee/thy even with `?translation=st-john-damascus-tyler`. Known architecture gap,
not a new finding — `[[project_overlay_variable_sources_gap]]`: overlays are scoped
to `fixed-texts/` and cannot reach `variable-sources/` or `oca.db`.

**Also noticed:** `/api/service?service=liturgy` and `?parish=…` are both silently
ignored — unknown params return Vespers/base rather than a 400. Cheap fix, and it
cost time in this session.

---

# The plan

Four steps. Step 1 is tonight; the rest are ordered by blast radius, lowest first.

### Step 1 — ✅ DONE 2026-08-29, before the service
Repaired the bad rows so 8-29 Vespers and 8-30 Liturgy are sung correctly.

- Backup at `storage/oca.db.bak.2026-08-29-step1`; transaction in
  `/tmp/fix-8-30-aposticha.sql` with post-commit verification.
- Deleted mis-typed `stichera` 9042 and 9043 · promoted **9041** to `order=0` as
  the Aposticha Glory · relabelled 9041 and 9039 to `the holy forerunner` ·
  stripped the podoben rubric and glued digit from `troparia` 39538 / 2854.
- Verified by **reading the rendered Aposticha and Troparia**, not by the audit:
  both dates were already 0/0/0 before the fix and stayed 0/0/0 after, so the
  green proves nothing. 153/153 tests pass; `drift:check` OK.

Closed **N1 for 8-30** and the 8-30 instance of **N6**. **Did not** close N2 —
the Forerunner's troparion and kontakion still do not appear, at Vespers tonight
or the Liturgy tomorrow. **Tell the choir director that**; do not let a clean
audit imply the date is right.

Two things found while doing it, both now folded in above: the rubric-bleed class
is **17 rows**, not one (N1); and the 8-30 Aposticha **Stavrotheotokion**
("Upon beholding Thee, the Lamb and Shepherd…") was never scraped at all — see N7.

### Step 2 — Fix the rules before writing new ones (~1 hr)
**N4 first, and it gates everything after it.** Establish why the three existing
`drift-check` rules pass on rows 9039/9043. Repair them. Prove each one fails on
today's pre-Step-1 data, then passes post-Step-1.

Every rule below lands in the same commit as its fix — standing pattern.

### Step 3 — Two mechanical fixes (~2 hrs)
- **N3**: `s.label || primary.title` at the seven `for-date.js` sites. Sweep the
  year for label changes and eyeball a sample — this touches every multi-saint
  date, so a snapshot diff is the check, not the audit.
- **N6 corpus sweep**: 174 `troparia` rows, digits *and* podoben/genre rubrics,
  both pronoun twins. Triage real digits (verse numbers, "Tone 4") first. Gate in
  `validate-schemas` alongside the existing quote-balance check.

### Step 4 — The afterfeast layer (**N2**, the real work)
Merges into 8-22 item 1, which is still the highest-value item in the repo:
~20 dates a year, annual, and it breaks both weekends of this review.

Acceptance now covers Vespers as well as Liturgy:
- 8-22 Lord I Call = 4 Resurrection + 6 Dormition T1, Glory Feast T1
- 8-30 Vespers Troparia = Resurrection T4 / Forerunner T2 / Theotokion T2
- 8-30 Liturgy troparia include Forerunner T2, kontakia Forerunner T5

Closing rule, unchanged from 8-22: **the General Menaion generic fallback must
never fire on a date whose principal is an afterfeast, leavetaking, or feast
window.** Falsify it against 8-23 and 8-30 before trusting it.

Take **N5** as a decision at the same time — same resolver, same question about
who ranks on the day.

---

## Standing lesson, carried forward from 8-22 item 10

Every "the text does not exist" conclusion drawn in the last three weeks has been
wrong. This review is more evidence: **all four texts missing from 8-30 were
already in `oca.db`**, and the correct Aposticha Glory was two rows from the
wrong one that displaced it.

The new corollary from N4: **"the rule passed" is not evidence the rule works.**
Falsify it on the failing row first.
