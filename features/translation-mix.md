# Feature: translation-mix detection

**Status:** shipped 2026-10-04 — chunk 1 of the OCA-standardisation plan
**Contract test:** `test/contracts/translation-mix.test.js`
**Audit rule:** `D23-translation-mix-within-service`
**Last verified:** this commit

## Why

`CLAUDE.md` has always said "Don't mix translations within a service". Nothing
enforced it. On 2026-10-03 a parishioner at St John of Damascus heard the
result at Great Vespers: the seven Resurrection stichera in the OCA Obikhod's
English beside St Hierotheus's three in st-sergius.org's. The register shifts
audibly where they meet.

Nothing in the stack could see it:

| Check | Why it is blind |
|---|---|
| `block.source` | names the BOOK (octoechos / menaion), not the translation |
| `block.provenance` | **wrong** — see below |
| `drift:check` source-mixing | compares General-Menaion vs day-specific, not translations |
| D21 / D22 | count stichera, and check which day's hymn; neither sees wording |
| `audit:date` | 0/0/0 on the date |

## `block.provenance` is not a reliable answer

```js
const firstDbSrc = sticheraData?.[0]?.stichera?.[0]?.dbSource;
let menaionProvenance = firstDbSrc?.startsWith('stSergius') ? 'St. Sergius' : 'OCA';
```

It reads only the **first** row of a slot and maps everything that is not
stSergius to `'OCA'`. So all 1,052 Lambertsen rows and 353 Raphaela rows display
as OCA, and the weekday Octoechos (whose day-nodes carry `_source: 'stSergius'`)
does too. **This is a user-visible defect in its own right and is not fixed
here** — D23 deliberately resolves translation from the stored text instead, and
INV-3 pins that it never reads `block.provenance`.

## How it resolves a translation

`server-lib/sources/translation-provenance.js` indexes text → family from both
ground-truth homes:

- `stichera.source` in the DB — the saint texts
- `_source` on a day-node of `variable-sources/octoechos.json` — the weekday
  cycle is st-sergius.org; Saturday/Sunday nodes carry no tag and are the OCA
  Obikhod

Matching is on **text**, because a rendered Menaion block carries
`auto.<date>.lordICall` rather than a row id — the text is the only thing that
survives intact from row to block.

**The four OCA artifacts are one family.** `tyler-booklet` counts as `oca`:
measured 96.6%–100% against files.oca.org across five services, differing only
in typography and one word (`sangest` / `didst sing`). Treating the parish
booklet as a separate translation would flag every corrected date as a mix.

⚠️ The first draft required `better-sqlite3`, which this project does not use
(it opens SQLite through `node:sqlite`). The catch swallowed "Cannot find
module" and the index silently held **only** the Octoechos — 1,587 texts, zero
Lambertsen, zero Raphaela. A detector blind to two of four translations reports
the corpus far cleaner than it is. The index now records `_dbRows` / `_dbError`,
and INV-1 asserts both.

## What it measured

Across all 365 Vespers of 2026:

**225 dates (62%) mix translations.**

| Combination | Dates |
|---|---|
| OCA + St. Sergius | 108 |
| Raphaela + St. Sergius | 54 |
| Raphaela + OCA + St. Sergius | 30 |
| Lambertsen + St. Sergius | 10 |
| Lambertsen + OCA + St. Sergius | 8 |
| Raphaela + OCA | 9 |
| Lambertsen + OCA | 6 |

**St. Sergius is present in 210 of the 225.** Every weekday Octoechos day-node
is `_source: 'stSergius'`, and only 13 Saturday evenings (Sunday Great Vespers)
are flagged.

**This redirects the plan.** The dominant mix is not 380 Menaion commemorations
— it is one file's weekday cycle meeting whatever the Menaion supplies. The
choir director has already named the parish's weekday source (the ponomar Daily
Octoechos), so the weekday cycle is a single decision covering ~210 dates, while
the Menaion conversion addresses the minority.

Note also that "convert the minority translation" is the **wrong** heuristic: on
112 of the 225 dates OCA is itself the minority. The target is the day type's
correct source, not whichever is outnumbered.

## Severity is `low` on purpose

Roughly 55% of stichera rows are not OCA, because OCA publishes propers only for
the ~32% of days that are liturgically significant. At `high` or `medium` this
would turn the pre-push gate red on a known condition no single change can fix.
It is here to measure, and to stop *new* mixes appearing unseen. **Raise it with
the conversion, deliberately** — INV-7 pins the current value so the change has
to be intentional.

`--strict` exits 0 on lows: verified at 130 (13 pre-existing + 117 from D23 on
the representative sample).

## Invariants (tested)

- **INV-1** — the index covers both ground-truth homes and all four families.
- **INV-2** — the OCA artifacts are one family; stSergius/lambertsen are not.
- **INV-3** — the rule never reads `block.provenance`.
- **INV-4** — a genuinely mixed service is flagged, naming both translations.
- **INV-5** — a single-translation service is **not** flagged (over-firing guard;
  2026-10-03 is clean after corrections_log #11 and #12).
- **INV-6** — an unresolvable text is not counted as a second translation.
- **INV-7** — severity stays `low`, and `needsAssembled` stays true.

Falsified by restoring the `better-sqlite3` bug: INV-1 and INV-4 both fail.

## Keep in sync

- `server-lib/sources/translation-provenance.js` — families and the index
- `audit/rules/D-structure/D23-…` — the rule
- Next chunks: expand the OCA archive (`rescrape-fetch.js` probes only known
  dates today), then convert where OCA exists, then decide the weekday cycle
