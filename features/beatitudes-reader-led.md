# Feature: beatitudesTropariaReaderLed (Third Antiphon speaker)

**Status:** shipped (this commit)
**Contract test:** `test/contracts/beatitudes-reader-led.test.js`
**DB column:** `parish_settings.rubric_beatitudes_reader_led` (INTEGER 0/1, default 0)

## Purpose

At the Third Antiphon (Beatitudes) of the Divine Liturgy, the resurrectional canon troparia (Irmos / Troparion / Theotokion of Odes 3, 6, etc.) are interpolated between the Beatitude verses. In some Slavic / OCA Sluzhebnik parishes the Reader recites those canon troparia while the choir sings only the Beatitude verses themselves; in other parishes the choir sings both. This rubric opts the parish into the reader-led variant. The Beatitude verses themselves are always sung by the choir.

## Interface

**DB / admin form:** boolean rubric flag `rubric_beatitudes_reader_led` on `parish_settings`. Surfaced as a checkbox in the parish-admin form ("Reader-led Beatitudes troparia").

**Runtime rubrics object** (built by `server-lib/parishes/index.js > buildRubrics`):

```json
{ "antiphons": { "beatitudesTropariaReaderLed": true } }
```

Default false. No query-param override; this is per-parish, not per-request.

## Behavior table

| Flag | Block type | Speaker |
|---|---|---|
| absent / 0 | Beatitude verse (`beat-v*`, `beat-open`) | `choir` |
| absent / 0 | Interpolated canon troparion (`beat-t*`, `beat-glory-t`, `beat-theos`) | `choir` |
| 1 | Beatitude verse | `choir` (unchanged) |
| 1 | Interpolated canon troparion | `reader` |
| (any) | Glory / Now-and-ever doxology lines (`beat-glory`, `beat-now`) | `null` (unchanged) |

## Code surface

- `assemblers/liturgy.js:82, :90` — passes `opts` into `_litBeatitudes` (both Paschal and ordinary branches).
- `assemblers/liturgy-parts/antiphons.js:78` — `_litBeatitudes(spec, f, opts = {})` derives `const tropSpeaker = opts.rubrics?.antiphons?.beatitudesTropariaReaderLed ? 'reader' : 'choir'`, applied at the three `makeBlock('hymn', …)` sites (lines 137, 148, 158).
- `server-lib/parishes/index.js > buildRubrics` — maps DB column to `rubrics.antiphons.beatitudesTropariaReaderLed`.
- `server-lib/routes/parish-admin.js` — column in `WRITABLE_FIELDS`, `BOOL_FIELDS`, and response projection.
- `public/parish-admin.html` + `public/scripts/parish-admin.js` — checkbox + snapshot/load/save plumbing.
- `storage/migrations/005_parish_rubric_beatitudes_reader.sql` — schema + St John enablement.

## Invariants (tested)

- **INV-1** — Default (no overlay rubric): all Third-Antiphon `hymn`-type blocks have `speaker: 'choir'` on an ordinary-time Sunday with interpolated canon troparia.
- **INV-2** — `beatitudesTropariaReaderLed: true` (Tyler overlay): all Third-Antiphon `hymn`-type blocks have `speaker: 'reader'` on the same day. Beatitude verses (`beat-v*`, `beat-open`) remain `choir`.
- **INV-3** — Doxology lines (`beat-glory`, `beat-now`) keep `speaker: null` regardless of flag.
