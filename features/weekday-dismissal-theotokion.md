# Feature: the weekday dismissal Theotokion

**Status:** shipped 2026-10-02
**Contract test:** `test/contracts/weekday-dismissal-theotokion.test.js`
**Audit rule:** `D22-weekday-dismissal-theotokion-not-sunday`
**Last verified:** this commit

## Purpose

A weekday Vespers closes with the **daily** dismissal Theotokion of its own day.
Before this change `dismissalTheotokion` existed only under `saturday`, in all
eight tones, in **both** `octoechos.json` and `octoechos-myrrhbearers.json`, and
`for-date.js` hardcoded `tone${T}.saturday.vespers.dismissalTheotokion`. All five
weekday evenings therefore closed with Sunday's resurrectional hymn.

**203 of 365 dates in 2026 rendered the wrong hymn**, measured before and after.

## Why nothing caught it

The hymn was wrong; the *tone* was right, and so was the slot label
("Dismissal Theotokion") and the slot's presence. So:

- **D4** and **D16** check the Theotokion's tone — both green.
- **D3** checks its presence — green.
- `audit:quick` was green at 0/0/0 over all 365 Vespers.

This is the fourth instance of the pattern in
`feedback_assert_structure_not_labels`. D22 therefore asserts against the
**data**: it collects the eight Saturday Theotokion texts and fails if one of
them is rendered on an evening that has a daily Theotokion of its own.

⚠️ **`audit:quick` does not run `needsAssembled` rules.** It passes no `--http`,
so `ctx.assembled` is empty and such rules silently return `[]`. D22 only fires
under `npm run audit`, `audit:full` or `audit:date`. Falsifying D22 against
`audit:quick` produced a false green; against `npm run audit` it produced 103
high findings, which is the real check.

## The day mapping — the part that is easy to get backwards

`octoechos.json` is keyed by the **civil evening** a service is sung
(`_meta.weekdayVespersConvention`). The source is indexed by **liturgical day**.
They are offset by one, so the source's *Thursday* is our **`wednesday`**.

Verified empirically rather than assumed, against the Octoechos day-themes, which
are fixed and unambiguous for three of the days:

| our key | theme in our data | = liturgical | expected |
|---|---|---|---|
| `sunday` | angels | Monday | Angels |
| `monday` | forerunner | Tuesday | Forerunner |
| `tuesday` | cross | Wednesday | Cross |
| `wednesday` | apostles | Thursday | Apostles |
| `thursday` | cross | Friday | Cross |
| `friday` | martyrs | Saturday | Martyrs |

The source makes this checkable rather than inferred: its appendix labels every
entry with **both** reckonings — "Tuesday & Thursday (Monday & Wednesday
evenings)". Getting it backwards would have put all 40 hymns one day off, with
every tone still correct — i.e. invisible to every existing rule.

`dailyTheotokionKey()` in `for-date.js` maps the liturgical day to its sung
evening through `VESPERS_SUNG_EVE`, and is used by **both** the Daily-Vespers
branch and the Great-Vespers re-key. On a Sunday it resolves to `saturday`,
exactly as the line it replaced hardcoded.

## Source and authorization

The Daily Theotokia appendix (pp. 179–189) of the Daily Octoechos at
`https://www.ponomar.net/data/octoechos_week_days_MtMary.pdf` — 40 slots filled
by 30 distinct hymns, identified by the choir director of St John of Damascus,
Tyler as the parish's own weekday source (2026-10-02).

**The PDF states no translator, copyright or permission** in 189 pages; its
author metadata is the Windows default "Valued Acer Customer". Use was authorized
by the project owner on 2026-10-02. Recorded in `_meta.sources` so the basis is
not lost.

Checked and rejected first: **Holy Myrrh-bearers** (Etna CA), whom we already
have written permission from (2026-07-07). Both `myrrh-bearers.org/octoechos/`
and their newer `octoechos.org` abbreviate the end of Vespers — *"Then, Now
lettest Thou Thy servant depart…; Trisagion through Our Father…; Troparia. Litany,
and Dismissal."* — and never print these texts. The permitted source does not
cover this gap.

**Register divergence.** This text is thou/thy with *modern* verb forms ("thou
conceived", not "thou didst conceive"), so it differs from the `stSergius`
weekday text around it. Authored verbatim and tagged `_source:
'mtMaryDailyOctoechos'` for future replacement, per the CLAUDE.md convention for
non-OCA content. **No verb-form normalization was attempted** — `yy-to-tt.js`
converts pronouns, not verb endings, and inventing `-est`/`-eth` forms would be
authoring liturgical text rather than transcribing it.

Two entries (tone 5 and tone 7, Wed & Fri) carry a single `/` where the source
means its `//` phrase mark; normalized on import. `//` already appears 96 times
in this file, so the mark is kept rather than converted.

## Invariants (tested)

- **INV-1** — 5 evenings × 8 tones present; Friday evening deliberately absent.
- **INV-2** — no weekday hymn equals its tone's Saturday hymn (the bug's shape).
- **INV-3** — 2026-10-07 renders the hymn on the director's sheet.
- **INV-4** — rendered text equals the data for (tone, sung evening), end to end.
- **INV-5** — Saturday evening keeps the resurrectional hymn.
- **INV-6** — Friday evening falls back rather than rendering empty.
- **INV-7** — every authored hymn carries its `_source` tag.

INV-3/4/5 were falsified by removing the `VESPERS_SUNG_EVE` hop; all three fail,
so the day mapping is genuinely load-bearing.

⚠️ INV-4's first draft read `calendarDay.dayOfWeek`, which `/api/service` does
not return — every iteration hit `continue` and it passed while asserting
nothing. It now counts what it checked and fails below 3. Any skip-heavy loop in
this repo should carry that guard.

## Known gap

**Liturgical Saturday (sung Friday evening) — 8 hymns, all tones.** The appendix
covers Monday–Friday only ("From Sunday Vespers to Saturday Matins"). Those 52
dates/year keep the pre-2026-10-02 fallback to the Saturday hymn, which is wrong
there too. Recorded in `octoechos.json` `_meta.knownGaps` and pinned by INV-1,
which fails if a `friday` entry appears without this note being updated.

## Still open with the director

She stated the parish's daily **Lord I Call, Aposticha and Troparion** also come
from this book, while our weekday Octoechos is `_source: 'stSergius'`. If so,
Tyler may sing a different translation from what we render across the whole
weekday cycle — far larger than this one hymn, and unaddressed here.

## Keep in sync

- `server-lib/assemble/for-date.js` — `dailyTheotokionKey()`, both call sites
- `variable-sources/octoechos.json` — the 40 slots, `_meta.sources`, `_meta.knownGaps`
- `audit/rules/D-structure/D22-…` — the closing rule; D16 guards the tone
- `corrections_log` #10
