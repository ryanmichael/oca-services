# Feature: vigil rank, Sundays, and the Litya

## Two facts that were one setting

`getFeastRank(date) === 'vigil'` was doing two jobs:

1. **a statement about the saint** — he ranks for paremias at Vespers, the
   Magnification at Matins, his own propers at Liturgy;
2. **a statement about the service** — an All-Night Vigil is served, with a Litya
   and Blessing of the Loaves.

Only the first is a fact about the calendar. The second is parish practice, and
many OCA parishes never serve a Litya whatever the saint's rank. Fusing them is
what blocked rank corrections for two sessions: **18 of the 34 open
rank-coverage findings are vigil-related**, and applying any of them honestly
started printing a service the parish does not serve.

The OCA order documents draw the distinction themselves. A Great Feast prints
`Litya`. An ordinary vigil-rank saint's day prints `[Litya]` — and those
documents' own header defines a bracketed item as *"commonly omitted in parish
practice"*.

## The Sunday bug this uncovered

`generateVigilFeastVespers` ships `slots: []` with no Octoechos slot, which is
correct on a weekday, where there is no resurrectional set to interleave. It was
dispatched on rank alone, ahead of the Sunday branch — so **on a Sunday it erased
the Resurrection outright**. 2026-11-08 (Synaxis of the Archangels) and
2026-12-06 (St Nicholas) each rendered nine Lord-I-Call hymns, every one the
saint's.

A vigil-rank saint never displaces the Resurrection on a Sunday; he shares the
day with it. Three OCA orders, three saints, three years, one shape:

| Document | |
|---|---|
| `2025-0629` Peter and Paul | 4 of the Resurrection + 6 of the Apostles |
| `2022-1009` St Tikhon | 4 of the Resurrection + 6 of St Tikhon |
| `2023-1001` the Protection | 4 of the Resurrection + 6 of the Protection |

each with *Glory… saint* and *Now and ever… Dogmatic Theotokion*.

The fix is one condition — do not use the vigil generator on a Sunday. Falling
through to the Sunday generator produces exactly that with no further
arithmetic: it sets `totalStichera` 10, and `isSundayGreatVespers` already caps
the Menaion at 6, leaving 4.

**Scope, measured** by running `scripts/snapshot-calendar-rules.js` with and
without the change and diffing the outputs: **9 dates** across 2024–2027 and both
calendar styles, every one a vigil-rank Sunday, all showing the same transition
(`all-night-vigil → greatVespers`, `totalStichera 8 → 10`, Octoechos slots
`0 → 1`).

> Measure this way. A naive re-run of `generateCalendarEntry` reports all 1461
> dates as changed, because `CAL_FREEZE_TIME` must be set before `calendar-rules`
> is required or every entry differs by its `generatedAt`.

## The rubric

`vespers.servesLitya` — `always` (default) | `greatFeastsOnly` | `never`.

Applied by `applyLityaPolicy` in `server-lib/sources/calendar.js`, after the
entry is built and before assembly sees it.

- **Subtractive only.** It removes a Litya the entry already has and never adds
  one.
- **Non-mutating.** Entries are shared; mutating one would leak a parish's
  practice into the next request for a different parish.
- **Default is today's output.** A caller that passes no rubrics renders exactly
  what it rendered before.

## Known gap

**A vigil-rank Sunday has no Litya block at all**, because the Sunday generator
has none — so `servesLitya: 'always'` cannot restore one there. For the bracketed
saint's days that matches practice anyway, but **2025-06-29 (Peter and Paul)
prints `Litya` unbracketed**, so a parish that serves one on a vigil-rank Sunday
is currently short. Closing it means giving the Sunday generator a Litya block
gated on rank plus policy; it was left out deliberately rather than bundled into
a correctness fix.

## Keep in sync

- `calendar/entry.js` — the Sunday guard on the vigil dispatch
- `server-lib/sources/calendar.js` — `applyLityaPolicy`
- `data/rubric-registry.json` — `servesLitya`
- `test/contracts/vigil-rank-sunday.test.js` (6 INVs), `test/contracts/litya-policy.test.js` (7 INVs)
