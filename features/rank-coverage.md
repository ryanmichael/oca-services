# Feature: rank coverage oracle

## Purpose

Measures our fixed-date feast ranks against the OCA calendar, so the gap between
them is a number that can be burned down instead of a suspicion.

`getFeastRank` feeds `calendar/entry.js` and `liturgy-from-orthocal.js`. A
missing rank silently renders a polyeleos or vigil saint as an ordinary
six-stichera day — no polyeleos, no magnification, no festal propers. That is the
shape of the 2026-08-09 St. Herman bug, and it is not a one-off:

> **Our curated lists hold 25 fixed dates. The OCA calendar marks 65.**

## Usage

```bash
node scripts/rank-coverage.js                                   # report
node scripts/rank-coverage.js --capture-baseline audit/rank-coverage.json
npm run audit:rank-coverage                                     # --check, exit 2 on NEW
```

Same shape as `rescrape-diff` and `audit:parish-baseline`: a checked-in baseline,
`--check` failing only on **new** divergence, and resolved findings reported so a
burn-down is visible.

## How it separates fixed from moveable — on BOTH sides

The rank orthocal prints for a date is the **maximum** of its fixed-date rank and
whatever the moveable cycle contributes that year. `getFeastRank` only knows the
fixed calendar, so comparing on one year produces false mismatches —
2026-04-06 reads "polyeleos" only because it is Great and Holy Monday.

Rather than pattern-matching titles, the script takes the **minimum `feast_level`
per month-day across every cached orthocal year**. A moveable collision can only
raise a date's level, never lower it, so the minimum is the fixed-date floor.

With the 5 years currently cached (2025–2029), **307 of 366 month-days already
have a constant level**; the 59 that vary are Lenten-weekday interference
(level 0 vs 1). No heuristics, and it sharpens as more years are cached.

Titles are chosen by **frequency**, not first-seen: a fixed commemoration recurs
every year while a moveable collision appears once. Without that, the report
labels 3-9 "First Sunday of Lent" instead of the Forty Martyrs and 4-23 "Bright
Wednesday" instead of St George — misleading exactly where a human is triaging.

The same minimum must be taken on **our** side too. `getFeastRank` consults
`getGreatFeastKey`, which knows the *moveable* great feasts — so evaluated on a
single year it reports 5-21 as `greatFeast` because Ascension falls there in
2026, and 4-12 likewise for Pascha. Four findings were pure artifacts of that
asymmetry before it was fixed.

**orthocal level 6 is not one of the Twelve.** Levels 8 (Lord) and 7 (Theotokos)
together are the Twelve plus Pascha; level 6 is Circumcision, Pokrov, Peter and
Paul, the Forerunner's Nativity and Beheading, Apostle Matthew — the "red cross
circle" symbol, which is vigil rank. Mapping 6 → `greatFeast` produced five false
mismatches where our `vigil` was right all along.

Between them these two corrections took the count from 68 to 62.

Findings are keyed by **month-day**, so the baseline is year-independent.

## The 62 findings, and how to burn them down

| Kind | Count | Meaning |
|---|---|---|
| `missing-rank` | 50 | OCA says polyeleos/vigil; we have no curated rank |
| `rank-mismatch` | 9 | Both have a rank and they disagree |
| `we-over-rank` | 3 | We claim a rank OCA puts below polyeleos |

### Before the next batch: separate `vigil` the RANK from the Litya the SERVICE

`calendar/entry.js:135` makes `vigil` swap the entire Vespers generator, so a
rank correction also starts printing a Litya and Blessing of the Loaves. That
single coupling is what has blocked every vigil finding here — 9 `missing-rank`
plus 9 `rank-mismatch`, more than half the open list — because for a parish that
does not serve a Vigil, the honest rank produces the wrong service.

They are separate facts. The saint's rank drives paremias, the Magnification and
festal propers; whether an All-Night Vigil is served is parish practice, and many
OCA parishes never serve one whatever the saint's rank.

**Make the Litya a parish policy** (never / vigil-rank days / Great Feasts only)
read independently of `getFeastRank`. Then ranks can follow the OCA calendar and
the service shape follows the parish. Doing this first turns 18 blocked findings
into ordinary data entries and retires the 8-9 St Herman judgement call
entirely. Doing it later means deciding those 18 one at a time, forever.

Raised with the parish 2026-08-10 (`docs/choir-director-questions-2026-08-10.md`,
question 6) — the one input needed is which days, if any, St John's serves a Litya.

### Order the batches by BLAST RADIUS, not by count

The ranks are not equally risky, and the obvious ordering is wrong.
`calendar/entry.js:135` reads:

```js
if (feastRank === 'vigil') return generateVigilFeastVespers(dateStr, dow, tone);
```

**`vigil` swaps the entire Vespers generator** — Litya, Blessing of Bread, a
different service shape. Everywhere else (`liturgy-from-orthocal.js:370`,
`:586`, `entry.js:50`) treats `vigil` and `polyeleos` identically. So:

| Batch | Count | Delta |
|---|---|---|
| `missing-rank` → **polyeleos** | 41 | adds paremias + festal propers; **same generator** |
| `missing-rank` → **vigil** | 9 | **swaps the Vespers generator** |
| `rank-mismatch` (polyeleos ↔ vigil) | 9 | **swaps the generator**, either direction |
| `we-over-rank` (polyeleos → none) | 3 | removes festal propers |

**Start with the 41 polyeleos additions.** That was not my first instinct — I
assumed the "we already have a rank, just wrong" set would be the gentlest, and
it is in fact the sharpest.

### The report triages for you

Each finding carries a `triage` field, computed against a year in which the
month-day was **not** masked by the moveable cycle:

| Tag | Meaning | Count |
|---|---|---|
| `A` | the OCA-named saint is already our principal — only the rank entry is missing | 23 |
| `B!` | something else is pinned as principal — a picker or override problem | 5 |
| `?` | no moveable-free year in the cache; inconclusive, do not treat as B | 6 |

Plus a `blockers` field naming what stops a rank entry landing: `no saint_type`
(the General-Menaion propers cannot resolve) or `no stichera` (the day would fall
back to generic category texts). 12 findings carry one.

**Why the reference year matters.** Evaluating the principal in a colliding year
invents wrong answers: on 2026-05-07 the picker lands on the Apparition of the
Sign of the Cross and St Alexis Toth looks buried, when in a clean year he is
already the principal. That mistake was made three separate times before it was
encoded here — once in the oracle's own arithmetic, once across the whole Type B
list, once on 5-7 specifically. Where no clean year exists (4-6 and 4-7 are Great
and Holy Monday and Tuesday in every cached year at the floor level) the finding
is reported `?`, never `B`.

### The four feast-window burials

The `B!` set is dominated by one shape — the 2026-08-09 St. Herman pattern, where
`"Afterfeast "` / `"Leavetaking "` matches `MOVEABLE_CYCLE_TITLE` and the picker
pins the window over a ranked saint:

| Date | Window | Buried saint |
|---|---|---|
| 8-13 | Leavetaking of the Transfiguration | St Tikhon of Zadonsk |
| 8-16 | Afterfeast of the Dormition | Image of Christ Not Made by Hands |
| 9-21 | Leavetaking of the Elevation | Apostle Quadratus |
| 1-11 | Afterfeast of Theophany | Ven. Theodosius the Great — **FIXED** `d54a4f3` |

Only 1-11 was fixable with a one-line `PRINCIPAL_OVERRIDES` entry, because
Theodosius has his own stichera. The other three saints do not, so an override
would swap the feast's proper stichera for General-Menaion generics — a downgrade.
They need the feast-plus-saint blend that 8-9 required across four commits.

### Then triage each date by cause

- **Type A — rank-only.** The saint is already the principal with stichera; only
  the list entry is missing. St Raphael of Brooklyn (2-27), St Innocent (3-31),
  St George (4-23), the Forty Martyrs (3-9). One entry each.
- **Type B — wrong principal**, the St. Herman class. 4-25 has Apostle Mark
  buried under "Basil of Poiana Marului"; 5-07 has St Alexis Toth buried under
  "Apparition of the Sign of the Cross". Needs `PRINCIPAL_OVERRIDES` and usually
  data work as well.

### Two findings that are judgement calls, not fixes

**8-9, St Herman — leave it alone for now.** orthocal says vigil; we set
polyeleos during the 2026-08-07 audit. The OCA order document cannot settle it:
`2026-0809-order-services.txt` and `2026-0719-order-services.txt` carry identical
"Vigil / Great Vespers at a Vigil" framing, because both are **Sundays**, where a
Vigil is served whatever the saint's rank. Flipping the one date with the most
human validation behind it on orthocal alone is inference over evidence.

**1-1, Circumcision — we call it a Great Feast; it is not one of the Twelve.
RULED 2026-08-10: keep it.** It has its own antiphons, entrance hymn and
megalynarion already authored and it co-celebrates with St Basil the Great;
treating it as a Great Feast is defensible practice even though it sits outside
the Twelve. orthocal puts it at level 6, which is vigil rank, and matching that
would change the Vespers generator for no liturgical gain. **Do not "fix" this
to match the oracle** — the divergence is intentional and this paragraph is the
record of it.

**`we-over-rank`** (7-11 Euphemia/Olga, 7-22 Mary Magdalene, 12-12 Spyridon) is
the same shape: we rank them polyeleos, OCA puts them at six-stichera. Several
trace to earlier deliberate work — see `memory/project_sergius_rank_survey.md`.
Review, don't bulk-revert.

## Working discipline

Rank changes are the family that, per
`memory/project_principal_saint_picker_2026_06_20`, once "broke 50+ days". So:
small batches, and every batch closes with

```
npm run audit:rank-coverage        # resolved goes up, NEW stays 0
npm run audit:parish-baseline      # sung-propers oracle
npm run snapshot:verify
npm run audit                      # full sample
```

and a rendered before/after diff for each touched date across Vespers, Matins and
Liturgy — actually read, not just counted.

## Evidence limits — read before trusting a fix

Only **22** OCA order documents exist in `reference/orders/`, mostly Feb–Aug
Sundays, so most of these dates have **no per-date OCA order** to verify against.
Verification leans on orthocal plus typikon convention, which is weaker evidence
than 2026-08-09 had. Worth requesting orders for the American saints at least —
St Raphael, St Innocent, St Alexis Toth, the New Martyrs of Alaska — since those
are where being wrong matters most to an OCA parish.

## Keep in sync

- `scripts/rank-coverage.js`
- `audit/rank-coverage.json` — re-capture whenever findings are resolved
- `VIGIL_SAINTS` / `POLYELEOS_SAINTS` / `getFeastRank` in `calendar/fixed-feasts.js`
- The orthocal cache in `data/orthocal/` — adding years sharpens the fixed-date floor
