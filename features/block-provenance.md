# Feature: block provenance

**Status:** fixed 2026-10-05
**Contract test:** `test/contracts/block-provenance.test.js`
**Last verified:** this commit

## The defect

`block.provenance` is what the UI shows a user asking *whose English is this?*
It answered **"OCA" for most of the corpus regardless of the truth**: all 1,052
Lambertsen rows, all 353 Raphaela rows, and the entire weekday Octoechos.

Found on 2026-10-05 while building the translation-mix detector (chunk 1), which
deliberately does **not** consult this field — INV-3 of `translation-mix.test.js`
pins that — and so stayed honest while the UI did not.

## Three independent defaults, each sufficient on its own

That is why the fix had to reach all three; repairing any one would have left
the wrong answer in place.

**1. The route — a blanket fallback.** `api-service.js`:

```js
if (!b.provenance) b.provenance = 'OCA';
```

Any block without a label became OCA. Now the translation is resolved from the
text through `familyOfText`, with `'OCA'` kept only for text the corpus index
does not hold — the fixed prayers and litanies, which genuinely are the OCA base
(INV-5).

**2. The assembler — first row wins, and a false dichotomy.** `for-date.js`:

```js
const firstDbSrc = sticheraData?.[0]?.stichera?.[0]?.dbSource;
let menaionProvenance = firstDbSrc?.startsWith('stSergius') ? 'St. Sergius' : 'OCA';
```

It read only the **first** row of a slot, and treated "not stSergius" as "OCA".
Now every row is consulted: when they agree the slot carries that label, and
**when they disagree the slot carries `null`** so the per-hymn `provenance` set
on each projected hymn wins. That works because the renderers resolve
`slot.provenance || hymn.provenance` — a null slot label is how a mixed slot
reports each hymn honestly (INV-3). Five hymn projections now carry their row's
own source.

**3. Load-time tagging — ignored `_source`, and barely ran.**
`overlays/provenance.js` tagged a whole source tree with one label and never
consulted a node's own `_source`; `load.js` called it **only for the triodion**,
so Octoechos and Menaion hymns were never tagged at all. `tagProvenance` now
inherits a node's `_source` down the tree.

## Verified

| Date | Before | After |
|---|---|---|
| 2026-10-07 (weekday) | Octoechos ×8 "OCA" | **St. Sergius ×8**, plus a Menaion slot reporting St. Sergius ×3 / Raphaela ×1 / OCA ×1 |
| 2026-10-03 (Sunday) | OCA | OCA (correct — Saturday nodes are the Obikhod, and the Menaion is OCA since corrections_log #12) |

This now agrees with D23's independent measurement, from separate evidence.

## Invariants (tested)

- **INV-1** — the weekday Octoechos reports St. Sergius.
- **INV-2** — a Sunday reports OCA throughout.
- **INV-3** — a mixed slot reports each hymn honestly.
- **INV-4** — Lambertsen and Raphaela are never silently reported as OCA,
  sampled across five dates with a guard against the sample going vacuous.
- **INV-5** — fixed prayers still report OCA.
- **INV-6** — the blanket default cannot return.

Falsified by restoring the route's blanket default: INV-1, INV-4 and INV-6 fail.

## Keep in sync

- `server-lib/routes/api-service.js` — the resolver
- `server-lib/assemble/for-date.js` — `provOf`, and the per-hymn projections
- `server-lib/overlays/provenance.js` — `_source` inheritance
- `server-lib/sources/translation-provenance.js` — the one label table
