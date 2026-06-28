# Feature: hoursPrecedeService (skip reader's opening prayers)

**Status:** shipped (this commit)
**Contract test:** `test/contracts/hours-precede-service.test.js`
**Registry entry:** `data/rubric-registry.json > rubrics.hoursPrecedeService`
**Storage:** `parish_rubrics` (registry KV table) — no typed column.

## Purpose

When the Ninth Hour (before Vespers) or Midnight Office (before Matins) is read immediately preceding the service, the reader's opening prayers — *O Heavenly King → Trisagion → Glory → O Most Holy Trinity → 12× Lord have mercy → Glory* — were already said at the end of the preceding Hour. Per OCA/Slavic parish rubric the service then goes from the priest's exclamation + "Amen" directly to *"Come, let us worship…"* (Psalm 103) at Vespers, or to the royal opening at Matins.

This rubric opts a parish into that skip. Default behavior (full reader's opening) is preserved for parishes that do not read the preceding Hour as a separate office.

## Interface

**Registry entry:**

```json
{
  "label": "Hours read before service (skip reader's opening prayers)",
  "namespace": "opening.hoursPrecede",
  "type": "boolean",
  "default": false,
  "appliesTo": ["greatVespers", "dailyVespers", "matins"]
}
```

**Runtime rubrics object:**

```json
{ "opening": { "hoursPrecede": true } }
```

Default false. No query-param override; per-parish.

## Behavior table

| Flag | Service | Opening blocks emitted |
|---|---|---|
| absent / 0 | Great / Daily Vespers | exclamation, amen, **heavenly-king, trisagion, glory-now-1, most-holy-trinity, lhm-3, glory-now-2, our-father, kingdom-doxology, lhm-12, glory-now-3** (12) |
| absent / 0 | Matins (non-vigil) | same 12 |
| 1 | Great / Daily Vespers | exclamation, amen (2); then directly Psalm 103 |
| 1 | Matins (non-vigil) | exclamation, amen (2); then royal opening / Psalter |
| (any) | Vigil-rank service | opening is skipped entirely (existing behavior, flag does not apply) |

## Code surface

- `assemblers/vespers-parts/opening.js > assembleOpening(fixedTexts, isGreatVespers, rubrics)` — returns 2-block opening when `rubrics?.opening?.hoursPrecede` is true; otherwise the full 12-block opening.
- `assemblers/vespers.js > assembleVespers(calendarDay, fixedTexts, sources, opts)` — accepts `opts.rubrics`, threads to `assembleOpening`.
- `assemblers/matins.js > assembleMatins(calendarDay, matinsFixed, vespersFixed, sources, opts)` — accepts `opts.rubrics`, threads to `assembleOpening` (matins reuses the vespers opening).
- `server-lib/assemble/for-date.js > assembleForDate(... , opts)` — accepts and forwards `opts.rubrics`.
- `server-lib/routes/api-service.js` — resolves `getOverlayRubrics(translation)`, passes `{ rubrics }`.
- `server-lib/routes/api-matins.js` — same.

## Invariants (tested)

- **INV-1** — Default (no overlay rubric): Great Vespers opening contains all 12 expected block ids in order.
- **INV-2** — Tyler overlay (`hoursPrecedeService=1`): Great Vespers opening contains exactly `opening-exclamation` + `opening-amen`, then `ps103-intro` follows directly.
- **INV-3** — Tyler overlay: Daily Vespers opening is the same 2-block form.
- **INV-4** — Tyler overlay: Matins opening (non-vigil Sunday) is the same 2-block form.
- **INV-5** — Vigil-rank Matins is unchanged regardless of flag (opening is suppressed by `isVigil` check, which fires before the rubric check).
