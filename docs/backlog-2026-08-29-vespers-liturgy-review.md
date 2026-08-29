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

## P0 — N2. A leavetaking inherits nothing — ATTEMPTED, REVERTED, now specced

**⇢ ~20 dates · ↻ annual · attempt reverted 2026-08-29, findings below**

The parish sings the Forerunner's Troparion T2 at Vespers **and** the Liturgy, and
his Kontakion T5 at the Liturgy (director's books, 8-29 pp.11-12 and 8-30 pp.3-4,
p.8). We emit none of the three. Confirmed against
`reference/orders/2026-0830-order-services.txt`.

### What the attempt established

**The machinery already exists and was simply inert.** `liturgy-from-orthocal.js`
resolves a `feastCycleComm` by matching `FEAST_CYCLE_TITLE` —
`/^(?:Afterfeast|Forefeast|Leavetaking|Midfeast|Postfeast) /` — against the day's
commemorations, and sings its troparion and kontakion. There are **65 such rows**
in `commemorations`, but only for Great Feasts. **8-30 has none**, so nothing
fired. This was never a missing-hymn problem: the Forerunner's troparion and
kontakion sit on comm 1756 in both registers (39535/2849, 39534/2850).

**Adding the row is necessary and not sufficient.** With an
`Afterfeast of the Beheading…` commemoration inserted and the hymns copied onto
it, both hymns appeared — and two things broke:

| | Order appoints | We produced |
|---|---|---|
| Vespers Troparia | Res T4 · **Glory Forerunner T2** · Now Theotokion T2 | Res T4 · Glory Saints T4 · **Now Forerunner T2**, Theotokion GONE |
| Liturgy Kontakia | … Forerunner T5 · Glory Saints T8 · **Now "Steadfast Protectress"** | … Glory Patron · **Now Forerunner T5**, Protectress GONE |

**Root cause of the mismatch — the real finding.** The window mechanism assumes
the **Great Feast** pattern, where the feast's kontakion claims "Now and ever…"
and displaces the Kontakion-Theotokion (correct for 8-16 Dormition, 8-09 Herman
inside the Transfiguration afterfeast). The Beheading is **not** one of the Twelve
Great Feasts, and its order keeps the Theotokion at "Now and ever…" with the
Forerunner sitting *ahead of* the Glory.

A `windowClaimsNowAndEver()` predicate — a Great-Feast allowlist gating the
`feastCycle: true` flag — was written and unit-checked against all 14 window
titles in the DB. It is correct, and it is **not enough**.

### Why it was reverted, and what N2 actually needs

`api-liturgy.js` emits the Sunday kontakia as exactly:

```js
lit.kontakia = [ resK?, extraK?, gloryK, theoK? ];   // ONE extra
```

8-30 needs **four** kontakia — Resurrection, Patron of the Temple, Forerunner,
Saints — plus the Theotokion. One would be silently dropped. Making N2 correct
therefore means **reworking the Sunday-kontakia restructure to carry N extras in
rank order**, which touches every Sunday in the calendar.

That is the real shape of this item, and it is larger than the backlog's original
"resolve proper hymns from the feast day before any generic fallback".

**Scoped work, in order:**
1. Rework the restructure to emit an ordered list of N kontakia, not a fixed
   4-slot template. Snapshot-diff the year — this is the risky step.
2. Land `windowClaimsNowAndEver()` (written, verified, reverted with the rest —
   recover it from this session's diff) and gate `feastCycle` on it.
3. Add the `Afterfeast of the Beheading…` commemoration + hymns (one INSERT,
   template: comm 1573, Afterfeast of the Transfiguration).
4. The Vespers troparia path needs the same Glory-vs-Now distinction; it is a
   separate code path from the Liturgy restructure.

**Verify:** 8-30 Vespers = Res T4 / Glory Forerunner T2 / Now Theotokion T2.
8-30 Liturgy kontakia = Res / Patron / Forerunner T5 / Glory Saints T8 /
Now "Steadfast Protectress" T6. And 8-16, 8-09, 8-23 must not move.

**Rule that closes it:** unchanged — the General Menaion generic fallback must
never fire on a date whose principal is an afterfeast, leavetaking or feast
window. Add: a feast window must never displace the Kontakion-Theotokion unless
its feast is a Great Feast.

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

## ✅ P0 — N5. A parish's explicit rubric opt-out was silently inverted — FIXED

**FIXED 2026-08-29. ⇢ every parish that sets a tristate rubric**

Tyler had **explicitly opted out** — `parish_rubrics` row
`includeSecondKoinonikon = 0` — and got a second koinonikon anyway.

**Correct root cause** (the first write-up of this item named
`capture-rubrics-snapshot.js`; that script is only the reference snapshot for
contract INV-D, not the production path). Production is
`buildRubrics` in `server-lib/parishes/index.js`:

```js
const value = coerce(raw, def.type);
if (isDefault(value, def.default)) continue;   // ← drops the explicit pick
```

Values equal to the registry default are omitted to keep overlays sparse. Safe
for a boolean read with `!!`. **Not** safe when the consumer is tri-state —
`liturgy-from-orthocal.js:189-191`:

```js
const overlayKoinonikonOptIn  = opts.includeSecondKoinonikon === true;   // opt in
const secondKoinonikonAllowed = opts.includeSecondKoinonikon !== false;  // opt out
```

`undefined !== false` is `true`, so absent means **allowed**. Compacting an
explicit `false` therefore *inverts* it.

**Fix:** rubrics whose consumer is tri-state carry `"tristate": true` in
`data/rubric-registry.json` (with a `tristateReason` naming the consumer), and
`buildRubrics` skips compaction for them **when the value came from an explicit
`parish_rubrics` pick**. Scoped that way because a row in `parish_rubrics` exists
only if the parish set it, whereas the typed-column fallback is
`NOT NULL DEFAULT 0` and cannot distinguish a deliberate 0 from "never touched".

**Closing rule: INV-E** in `test/contracts/rubric-registry.test.js` — for every
tristate rubric, an explicit pick of `false` *and* of `true` must reach the
consumer with the value the parish chose. **Asserts the value, not the presence
of a key** (`[[feedback_assert_structure_not_labels]]`), and **falsified**: with
the fix reverted it fails with *"parish picked false, consumer would see
undefined"*; restored, it passes.

Verified: 153 unit + 183 contract tests, `drift:check` OK, `validate` exit 0, and
the behavioural matrix — parish opted out → absent; OCA base → present;
`?secondKoinonikon=show` → present.

**Still open, unchanged:** whether the second *prokeimenon* and *alleluia* should
render at all on 8-30 (the order gives the Resurrection set alone). Not gated by
this rubric; still the policy question originally filed here.

---

## P1 — N9. The rubrics snapshot generator is stale and silently weakens INV-D

**NEW, found while fixing N5 · pre-existing · guard landed, root cause OPEN**

`scripts/capture-rubrics-snapshot.js` reproduces **typed-column** logic only, but
three rubrics are now **registry-only**, with no `dbColumn`:
`gloryAfterLittleLitany`, `hoursPrecedeService`, `licNoLeadingRepeat`.

They can only come from `parish_rubrics`, so a plain re-run **drops them from the
snapshot** — and INV-D then passes against the weakened expectation. Nothing
fails. The committed snapshot has evidently been hand-maintained for those keys.

**Landed now:** a guard that diffs against the existing snapshot and refuses to
write when any parish would lose a key, listing them, unless `--force`. Verified
firing on all three.

**Still open:** teach `legacyBuildRubrics` the registry-only rubrics so the
snapshot is reproducible again. Until then the guard is the only thing standing
between a routine regeneration and a quietly weaker contract.

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

## ✅ P0 — N8a. We rendered a single-saint troparion on a joint feast — FIXED

**FIXED 2026-08-29 · ⇢ 1 date · ↻ annual**

8-30 jointly commemorates **three** patriarchs, and the troparion OCA appoints
names all three. We rendered a troparion for Alexander alone.

Three sources agree on the joint text — including our own database:

- the director's book, `08.30.26 Divine Liturgy` p.5, OCA-published music
  (© 2008 OCA), headed *"Saints Alexander (340), John (595), and Paul the New
  (784), Patriarchs of Constantinople — Troparion, Tone 4"*
- `reference/orders/2026-0830-order-services.txt`: "Troparion of the **Saints**"
- `oca.db`: comms **1761** (John) and **1762** (Paul) already carried it in both
  registers — byte-identical to the book.

**So this was never a missing-text problem.** It is a *selection* problem: the
picker takes the principal commemoration (1760, Alexander) and uses its
troparion, and 1760 alone carried the single-saint text.

**Fix:** point 1760's troparion at the joint text in both registers
(`/tmp/fix-8-30-saints-troparion.sql`). All three patriarchs now agree —
1 distinct text per register. The replaced text is preserved in the SQL header,
in `storage/oca.db.bak.2026-08-29-step2`, and in git history. It also carried a
glued footnote digit (`lampstand,2`, the N6 class), which the replacement removes.

**A general rule was considered and REJECTED.** The tempting structural fix — "when
several commemorations on a date share identical troparion text, that is the
day's joint troparion and it wins" — is wrong, and measuring first is what caught
it. 70 date/text groups match that shape, and **most are generic category
fallbacks**, not joint troparia: *"By a flood of tears thou didst make the desert
fertile"* (monastic) and *"Thy holy martyrs, O Lord"* recur across unrelated
saints on the same day. That rule would let a generic fallback beat a specific
troparion across the calendar. **Share-count is not a signal for jointness.**

The real signal here is that the text *names the commemorated saints*, which is
far narrower — and not worth generalising from one date under time pressure.
Filed as N10.

**Note:** this makes **N3** more visible, not less. The block is still labelled
"Troparion of **Saint Alexander**, Patriarch of Constantinople" while its text now
names all three — label and text openly disagree. N3 remains the fix.

---

## P2 — N10. No way to express a joint troparion

**NEW, deferred deliberately**

8-30 needed the troparion of a *group* of saints, and our model attaches
troparia to individual commemorations. The workaround (copy the joint text onto
each member) works and is what the data already did for 1761/1762 — but nothing
records that the three are one commemoration, so a picker choosing any single
member can land on a single-saint text, which is exactly how N8a happened.

`stichera` has `group_role`; `troparia` has no equivalent. Related: the 08-06
landmine that `group_role` is selected by no query.

**Do not** infer jointness from shared text — see the measurement under N8a.

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
| Patron troparion + kontakion | St John of Damascus | ✓ (with `translation=`) | correct — N8b retracted |
| Liturgy 2nd koinonikon | parish opted out | rendered anyway | **N5** |

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

---

# Added 2026-08-29 (later session) — N2 step 1 landed, two new items

## ✅ N2 — DONE end to end (`d0be409`, `c784acf`)

The Sunday-kontakia restructure now carries **N** extras in rank order instead
of a fixed one-slot template, and the day's own kontakion takes the Glory with
the patron read above it. The blocker on N2 was cleared by step 1; steps 2-4 landed in `c784acf`.

Measured blast radius: **0** dates change with no parish overlay; **34** Sundays
change for Tyler, all the patron moving off the Glory onto the line above it.

**Method note worth keeping.** Every policy call in that commit was settled by
counting `reference/orders/` (473 orders, 131 of them printing a Church
troparion), not by reasoning from convention. Two of the three calls came out
against what the code already did — including one that a green contract had
codified. The archive is a usable oracle for Sunday kontakia shape; use it.

---

## P1 — N11. The patron-drop predicate is a curated allowlist, and rank cannot replace it

**NEW · ⇢ ~10 Sundays/yr per parish · found while landing N2 step 1**

On a high-rank-saint Sunday the patron-saints church yields **both** its
troparion and its kontakion — the archive is unambiguous (12 orders, all reading
"Troparion of the Church (if of Theotokos)", Theotokos only). We gate that drop
on `lit.hasCocelebratedOverlay`, a hand-curated signal in
`liturgy-from-orthocal.js`, and it does not fire on plainly polyeleos Sundays:
**2026-07-05 (Sergius), 2026-07-26 (Jacob Netsvetov), 2026-08-09 (Herman)** all
keep the patron kontakion where their orders drop it. Same under-ranking as the
principal-saint picker gap (memory: `project_principal_saint_picker_2026_06_20`).

**`getFeastRank` is not the fix.** Measured over all 131 archive orders that
print a Church troparion: rank ∈ {polyeleos, vigil} agrees with the order's
drop/keep decision **116 / 131 (88.5%)**, and errs in *both* directions — 10
dates where we say polyeleos and the order keeps the Church kontakion (incl.
**2026-08-30** itself), 5 where we say sixStichera and the order drops it.
Swapping the predicate would trade one wrong set for another.

The 15 disagreements are the actual work list:
```
2022-0123 2022-0703 2022-0710 2022-0724 2022-0828 2022-0925 2023-0108
2023-0212 2023-0625 2023-0924 2024-1006 2025-0928 2025-1019 2025-1026 2026-0830
```

**Also unfixed, and asymmetric:** the patron *troparion* is inserted with no
rank check at all, so on a drop date it survives even when the kontakion goes.
Making it symmetric needs a Theotokos-vs-saint distinction the temple rubric
does not currently carry — a Theotokos temple keeps both.

**Rule that closes it:** for every date in `reference/orders/` that prints a
Church troparion, our drop decision must match the order's. That check is ~30
lines and runs offline against the archive; it is the oracle, not a new
heuristic.

---

## P1 — N12. Lenten Sundays use a combined Glory/Now connector the orders do not

**NEW · ⇢ 5-7 Sundays/yr · found while landing N2 step 1**

`isLentenCommemorationSunday` (weeks 1-5) forces the day's kontakion under a
single "Glory… now and ever…" connector with no Theotokion. The 2026 orders
disagree for three of the five:

| Date | Order says | We emit |
|---|---|---|
| 03-01 Orthodoxy | `Glory… now and ever… Kontakion of the Triodion` — **no Church kontakion at all** | Patron, then Triodion combined |
| 03-15 Cross | `Glory… now and ever… Kontakion of the Cross` — no Church kontakion | Patron, then Cross combined |
| 03-08 Palamas | patron-saints church: `Kontakion of the Church / Glory… St Gregory / Now… Triodion` — **split, not combined** | Patron, then Palamas combined |
| 03-22 Climacus | `Kontakion of the Church / Glory… St John / Now… "Steadfast Protectress"` — **standard shape** | Patron, then Climacus combined |
| 03-29 Mary of Egypt | `Kontakion of the Church / Glory… St Mary / Now… "Steadfast Protectress"` — **standard shape** | Patron, then Mary combined |

So the combined connector is right only for weeks 1 and 3 (and only when no
patron is set), and weeks 2/4/5 want the ordinary Sunday shape. Note also
2026-02-15: `Glory… Kontakion of the Church (only if of Patron Saint), or else
Kontakion from the Triodion` — the pre-Lenten Sundays are a third shape again.

N2 step 1 left every one of these strictly closer to the order than before
(the connector now lands on the day's kontakion rather than the patron's), so
this is a correctness gap, not a regression.

**Rule that closes it:** same oracle as N11 — diff our connector placement
against the archive order for every date that has one.

---

## ✅ N2 steps 2-4 — DONE (`c784acf`)

`windowClaimsNowAndEver()` gates the "Now and ever…" claim on the feast being
one of the Twelve; the Afterfeast of the Beheading commemoration and its two
hymns are in `oca.db` (migration
`storage/migrations/2026-08-29-afterfeast-beheading.sql`); and the Vespers
troparia path — a separate code path from the Liturgy restructure, as the spec
predicted — now distinguishes Glory from Now.

**8-30 matches the order end to end**: Vespers Res T4 / Glory Forerunner T2 /
Now Theotokion T2; Liturgy troparia Res / Church / Forerunner / Saints; Liturgy
kontakia Res / Church / Forerunner T5 / Glory Saints T8 / Now "Steadfast
Protectress" T6.

**Blast radius:** exactly one day moves in Vespers and one in the Liturgy, with
and without a parish overlay. 8-16, 8-09 and 8-23 do not move.

Closing rule shipped as the `lesser-feast-window` contract (7 INVs, spec in
`features/lesser-feast-window.md`), asserted by position and **falsified**
before being trusted: reverting the predicate fails INV-1/2/4/7 and leaves the
two over-fire guards green.

One correction to the original spec, worth recording: the lesser window does not
simply "not claim Now and ever". It takes a **different slot in each service** —
the Glory at Great Vespers (one saint hymn printed), an unconnected line ahead
of the Glory at the Liturgy (several printed). Reading only the Liturgy half of
the order would have produced a wrong Vespers.

---

## P1 — N13. Sunday Matins "God is the Lord" troparia carry no saint at all

**NEW · ⇢ every Sunday · found while verifying N2**

8-30 Matins renders the Resurrectional troparion three times — Glory and Now
included — and neither the Forerunner nor the Saints. The order appoints:

```
Resurrectional Troparion, Tone 4
Troparion of the Forerunner, Tone 2
Glory… Troparion of the Saints, Tone 4
Now and ever… Resurrectional Dismissal Theotokion, Tone 4
```

**Not a regression** — verified by rendering against the pre-N2 code with the
new commemoration row removed; the output is byte-identical. The Sunday Matins
troparia path simply never consulted the day's commemorations. `matins-spec.js`
reads `menaionData.feastTroparion` for the afterfeast case only.

Sibling of the Vespers path fixed in `c784acf`, and the third service in the same
family, so the same Glory-vs-Now distinction applies: at Matins the order prints
several saint hymns, so a lesser window sits ahead of the Glory and the day's
saints keep it — the Liturgy shape, not the Vespers shape.

**Rule that closes it:** the `lesser-feast-window` contract should grow a Matins
INV once the path carries saints at all.

---

## ✅ N4 — DONE: why each of the three rules passed

**The item's premise was half right.** The instruction was "establish WHY each
passed before writing a fourth", and doing that changed the finding for two of
the three. They were not all "escape hatches wide enough to pass their own
headline case." Measured, one by one:

### Rule 1 — `Rubric bleed in sung text` — genuinely blind. FIXED.

Not an escape hatch: `KNOWN_RUBRIC_BLEED` is **empty**, exactly as its policy
comment demands. The rule simply had five patterns — composer attributions,
sticheron-count headers, Roman-numeral tone headers, Stavrotheotokion markers,
typikon tails — and **none for a genre heading glued to the front of the sung
line**, which is the largest surviving class. Ran the five patterns over the 17
open rows: **0 of 17 fire.** The rule's name promised a class far wider than its
patterns covered.

**Fixed** by three added patterns, measured over both tables: they hit exactly
those 17 rows and nothing else — no false positives corpus-wide.

Landing them turns the gate red, and the burn-down is **not** mechanical: of the
14 rows that are whole troparia mis-parsed into `stichera`, only **2** duplicate
a troparion that already exists in the corpus, so 12 cannot be resolved by
deletion. So the 17 went into `RUBRIC_BLEED_BURNDOWN` — itemized, dated, and
**printed on every run**, failing the gate only for new rows. That is
deliberately a different construct from the silent `KNOWN_RUBRIC_BLEED`
suppression set, and the policy comment now distinguishes them. A burn-down
entry whose row no longer trips a pattern is itself reported as stale, so the
list cannot outlive the debt.

Both behaviours were **falsified before being trusted**: inserting a new bleed
row fails the gate (`warnings = 1`), and a synthetic stale entry fails it too.

### Rule 2 — `Stichera↔commemoration subject match` — did NOT miss a bug.

This is a correction to N4 as filed. The claim was that the rule passed "with
three Forerunner hymns under a hierarch commemoration." It did — and it was
**right to**. Comm 1760 legitimately hosts both saints' Lord-I-Call sets,
distinguished by `label`; the review's own "what is already correct" section
says that block renders correctly. The defect at 8-30 was **N3, a rendering
bug** — the assembler overwriting row labels — not a data mis-key. N4 conflated
the two.

The rule does have a real limitation, and it is worth recording because it is
structural rather than incidental: it looks for a **60% majority subject** in a
set of stichera. On a day where one commemoration hosts two saints, the section
is a blend by construction and neither subject can reach the threshold. Probed
comm 1760 directly: whole-comm pass `rows=9 threshold=6`, top subject
`Herod` at 4; lordICall pass `rows=8 threshold=5`, `Herod` at 3. The only word
matching a sibling title is `Baptist` at 2/9. Note also that the hymns name
*narrative characters* (Herod, Herodias), not the saint's title word, so a
Forerunner hymn is invisible to a title-matching rule regardless of threshold.

### Rule 3 — `Stichera label↔commemoration subject match` — could not have caught it.

The rule has a real blind spot: its extractor is `/\b([A-Z][a-zá-ú]{4,})\b/`, so
it reads only **capitalized** words. Measured: **65 of 579 distinct labels —
1,418 of 3,347 labelled rows — contain no such word at all** and are invisible
to it, including the entire `the holy forerunner` / `the holy hierarchs`
descriptive family.

But that is **not** why it missed row 9039. Prototyped a lowercase-tolerant
version against a scratch DB with 9039's bad label restored: **it still does not
fire.** The rule detects "this label names a *sibling* commemoration that has no
stichera of its own." Row 9039's label named the commemoration's **own** subject
("the holy hierarchs") over another saint's text — a failure mode outside the
rule's design space entirely.

Worse, the naive widening is actively harmful: it produces **34 warnings**, and
on this very class it flags **correct data** — comm 1760 `the holy forerunner`
×4, comm 1707 `the holy martyr Agathonicus` ×8, comm 1469 `the hieromartyr` ×9
are all legitimate co-hosting, not mis-keys.

### What this means for the next rule

The catchable class is not "label names a sibling" but "**a row's text subject
disagrees with its own label, where a second label group in the same
commemoration is the better match**". That is a within-commemoration comparison,
and neither existing rule is shaped for it. It is the rule N3 needs — and per
this item, it must be falsified against a restored row 9039 before it ships,
because the obvious widening of rule 3 demonstrably does not work.

Corollary to record: **9039 could not have been caught by any label rule at
review time**, because the rule matches against sibling commemoration titles and
no sibling on 8-30 named the Forerunner. The missing DATA (N2 step 3) was the
precondition for the RULE to have any material to work with. Rules that match
row-against-neighbour are only as good as the neighbour list.

### One correction to N1's row list

Row **8205** is in N1's list of 17 but is **not** rubric bleed. Its text is the
Nativity sticheron "Glory to God in the highest, and on earth peace! Today
Bethlehem receives Him…" at `order=5` with label `(for the Feast)` — a clean,
legitimate hymn that merely begins with the word "Glory". The repaired patterns
correctly do not fire on it. Two rows not in N1's list — **8530** and **8537**,
both `Doxasticon from the Pentecostarion…` at `order=0` — are genuine and have
been added. The corrected list is the 17 ids in `RUBRIC_BLEED_BURNDOWN`.


---

## ✅ N3 — DONE (`de4e6e1`), but not the way it was specced

**The prescribed fix was wrong.** N3 said `s.label || primary.title` at seven
sites in `server-lib/assemble/for-date.js`. **None of those seven lines changed.**
A blanket "row label wins" is a downgrade almost everywhere: most labelled rows
carry a generic category incipit — "the holy martyrs", "the venerable one" —
strictly less informative than the title the slot supplies. `lord-i-call.js` had
already measured this and said so in a comment: 1,451 of 2,390 labelled lordICall
rows are that bare-descriptor family.

The choice is a **rendering** decision and it already had a home — the
`mixedSlots` mechanism added for the 2026-08-16 Dormition/Image case. It did not
fire on 8-30 only because its `labelSubject` understood the `(for X)` form and
returned null for every bare descriptor.

Now `assemblers/_shared/hymn-label.js`, shared by `lord-i-call.js` and
`aposticha.js` so the two partial copies cannot drift apart again. Contract
`hymn-label-choice` (7 INVs) + `features/hymn-label-choice.md`. 45 of 365 days
change, **labels only**.

**Three of the four rules in it came from regressions this change itself caused**,
each caught by diffing every day of 2026 rather than by a test:
1. "Prophet Hosea" → "the holy prophet" (10-16) — a bare descriptor must not
   displace the principal's own title.
2. "24 stichera by Simeon the Translator" → "Stichera" (3-25) — genre words are
   not subjects, and the collapse hit only some rows, so two identical hymns
   printed under different headings.
3. The Aposticha Now-and-ever losing "(for the Dormition…)" (8-15) — a first
   attempt at guarding the Theotokion regressed the documented 8-16 case.

**Method note:** a year-wide before/after diff of every rendered label found all
three; the contract found none of them, because a contract only asks what you
already thought to ask. Pair any label or ordering change with a full-corpus diff.

### New: N14 — bad label data is now visible

Where a row's descriptor wins, whatever is in the DB prints. All pre-existing,
none created by `de4e6e1`, all now on a choir sheet:

- `the holy unmecinaries` (6-27) and `the holy unmercinaries` (10-31) — typos.
- `the holy martyr: 4` (7-29) — glued footnote digit; this is the **N6** class,
  and N6 just acquired a user-visible symptom.
- Row **9466** (11-28) — a Theotokion labelled `the venerable martyr`. INV-4
  guards the rendering; the row is still wrong and belongs in N1's family.

**Rule that closes it:** a `stichera.label` must not contain a trailing footnote
digit, and a row at `order=-1` (the Theotokion slot) must not carry a saint
descriptor. Both are cheap `validate-schemas` gates — but per N4, falsify each
against the rows above before trusting a green.
