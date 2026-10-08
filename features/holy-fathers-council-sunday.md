# Holy Fathers of an Ecumenical Council — Sunday propers

**Status:** shipped 2026-10-08
**Contract test:** `test/contracts/holy-fathers-council-sunday.test.js`
**Audit:** `drift:check` → stichera duplicate-set across commemorations

The commemoration of the Fathers of an Ecumenical Council is **movable** — the
7th Council's falls on the Sunday nearest Oct 11, so it ranges 10-07…10-11 —
but the OCA site publishes texts by calendar date. Scraping it therefore keys
the Fathers' hymns onto whatever fixed date they occupied in the scrape year,
and both the Fathers and the saints of that fixed date end up holding the
wrong set. Surfaced 2026-10-08 reviewing the choir packet for 2026-10-11.

## Invariants

- **INV-1** — Lord I Call on the Fathers' Sunday Great Vespers is 4 stichera of
  the Resurrection in the week's tone, then **6 of the Fathers** in Tone 6.
  No other commemoration contributes a sticheron inside that block.
- **INV-2** — the Lord-I-Call Glory is the Fathers' (*"Today let us praise the
  mystical trumpets of the Spirit…"*), **not** the resurrectional doxastichon;
  Now-and-ever is the Dogmatikon in the week's tone.
- **INV-3** — the Aposticha carries its own Glory of the Fathers in Tone 4
  (*"Come, all Orthodox Churches…"*), and the Now-and-ever Theotokion follows in
  **the Glory's tone**, not the week's.
- **INV-4** — the dismissal troparia are Resurrectional (week's tone), Glory ·
  Troparion of the Fathers (Tone 8), Now-and-ever · Resurrectional Dismissal
  Theotokion (Tone 8).
- **INV-5** — the fixed-date commemorations adjacent to the Fathers do **not**
  carry the Fathers' stichera. They fall back to the General Menaion when we
  hold nothing of their own; that is the honest state.
- **INV-6** — the second communion verse the OCA order *prescribes*
  (*"Rejoice in the Lord, O ye righteous…"*) renders even for a parish that has
  `includeSecondKoinonikon` off, exactly as the second Gospel already does.
  That toggle means "skip the optional saint's verse", not "drop a verse the
  order prints". An ordinary Sunday for the same parish still gets one verse.

## Why INV-6 is not a parish override

`includeSecondKoinonikon: false` governs the **opt-in** polyeleos-saint
koinonikon. The Holy Fathers / Sunday-after-Elevation / Lenten-commemoration
verses are printed in the order itself, and the same file already forces the
second **Gospel** past `includeSecondGospel` for exactly this set of days. The
asymmetry was the bug: on 2026-10-11 Tyler rendered the Fathers' second Gospel
and dropped their second communion verse, while the choir packet for that
Sunday carried the music for it.

## Known gap — Vespers is not yet movable (open, 2026-10-08)

INV-1…INV-5 are verified on **2026-10-10/11**, the year the Sunday of the
Fathers actually falls on Oct 11. They do not yet hold in other years.

The Liturgy resolves the commemoration from orthocal's feast list, so it is
movable-correct in any year (INV-7 pins 2025-10-12 and 2027-10-17). Vespers
resolves it from the `commemorations` table, where the Fathers is stored as a
**fixed 10-11 row** — so its stichera only reach a Sunday that falls on 10-11.
Measured 2026-10-08: `2025-10-11` and `2027-10-16` Great Vespers each render
**0** stichera of the Fathers.

Closing this means giving a movable commemoration a movable key — the same
layer that would let the Fathers' three Old Testament lessons (Gen. 14:14-20,
Deut. 1:8-11,15-17, Deut. 10:14-21) attach, which `attachPolyeleosParemias`
cannot do today because it reads `variable-sources/menaion/<month>-<day>.json`
by fixed date. Both are queued together.
