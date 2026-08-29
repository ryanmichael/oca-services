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
