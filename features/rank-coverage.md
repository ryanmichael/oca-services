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

## How it separates fixed from moveable

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

Findings are keyed by **month-day**, so the baseline is year-independent.

## The 68 findings, and how to burn them down

| Kind | Count | Meaning |
|---|---|---|
| `missing-rank` | 50 | OCA says polyeleos/vigil; we have no curated rank |
| `rank-mismatch` | 12 | Both have a rank and they disagree |
| `we-over-rank` | 6 | We claim a rank OCA puts below polyeleos |

Triage into three types before touching anything:

- **Type A — rank-only.** The saint is already the principal with stichera; only
  the list entry is missing. St Raphael of Brooklyn (2-27), St Innocent (3-31),
  St George (4-23), Prophet Elijah (7-20), the Forty Martyrs (3-9), John
  Chrysostom (11-13). One entry in `VIGIL_SAINTS` / `POLYELEOS_SAINTS` each.
- **Type B — wrong principal**, the St. Herman class. 4-25 has Apostle Mark
  buried under "Basil of Poiana Marului"; 5-07 has St Alexis Toth buried under
  "Apparition of the Sign of the Cross". Needs `PRINCIPAL_OVERRIDES` and usually
  data work as well.
- **Type C — rank disagreement** where we already have one (5-08, 5-11, 7-20,
  9-25, 11-13). Smallest delta; good for proving the pipeline first.

**`we-over-rank` needs judgement, not a fix.** orthocal's level ≥6 is broader
than the Twelve Great Feasts — 6-24 (Nativity of the Forerunner) and 6-29 (Peter
and Paul) are typikon-great but not among the Twelve, so a mismatch there is
vocabulary, not a defect.

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
