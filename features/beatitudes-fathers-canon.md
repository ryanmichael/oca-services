# Beatitudes troparia on the Fathers Sundays

**Status:** fixed 2026-10-12
**Contract test:** `test/contracts/beatitudes-fathers-canon.test.js`
**Data:** `variable-sources/feast-canons/holy-fathers-councils.json`

## The three Fathers Sundays do not share a canon

| Sunday | OCA order appoints |
|---|---|
| First Council (Paschal, ~May) | Ode **6** of the Canon of the Fathers, Tone 6 |
| First Six Councils (July) | Ode 3 of the **1st Canon**, Tone **6** |
| **Seventh Council (October)** | Ode 3, Tone **8** |

`holy-fathers-councils.json` is the **July / Six Councils** canon — its own
`_source` cites `lit_hf6councils_pent7`, and its four troparia are Ode 3 of the
First Canon in Tone 6, exactly the 2026-07-19 order.

An earlier version of that file claimed the Six Councils and the Seventh
Council "share the same Liturgy Beatitudes". **They do not** — the orders
disagree on tone, which means different canons. One detector
(`/fathers\b.*\bcouncil/i`) matched both Sundays, so the Seventh Council
Liturgy on **2026-10-11 read July's four hymns aloud**. A reader at St John
Tyler caught it during the service; the first six troparia (Resurrection,
Tone 2) were right and the last four were not.

The Paschal First-Council Sunday never reached this path — it is handled by
`pentOverride`, which the `holyFathersSunday` detector excludes.

## Invariants

- **INV-1** — the Six Councils Sunday renders 6 Resurrection + 4 Fathers, the
  Fathers' set in Tone 6.
- **INV-2** — the Seventh Council Sunday renders the Octoechos Beatitudes only.
  It must **not** borrow the Six Councils troparia.
- **INV-3** — an ordinary Sunday is unaffected.

## Open gap: the Seventh Council's own canon

We do not hold it. The OCA published text for 2026-10-11 carries no Beatitudes
troparia, Connie's 10-11 packet has no Beatitudes pages, and
`reference/raphaela/corpus/txt/October 11-17.txt` covers Vespers, the
troparia/kontakia, the Hymn of Light and the Praises — but no canon odes.

Until it is sourced, that Sunday falls back to the Octoechos Beatitudes. **A
missing commemoration is a smaller fault than four wrong hymns read aloud**,
which is why this is a fallback rather than a borrow. To close it: Ode 3 of the
Canon of the Fathers of the Seventh Council, Tone 8, four troparia, the last
being the Theotokion — archaic register to match the Menaion source.
