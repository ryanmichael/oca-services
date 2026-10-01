# Feature: Feast-window signal

**Status:** shipped 2026-10-01
**Contract test:** `test/contracts/feast-window-signal.test.js`
**Last verified:** this commit

## Purpose

Answer "is today inside a feast's window, and is that a Great Feast?" once, in
one place, so a consumer does not re-derive it.

Built for the parish rubric the choir director announced on 2026-09-24 — the
patron's troparion is *"trumped by the feast"* on a feast **or afterfeast**.
That rule could not be expressed at all: the only window knowledge reaching a
route was `feastOnly`, which is true only **on** a Great Feast.

## Interface

`/api/liturgy` returns two fields that must be read **as a pair**:

```jsonc
"feastOnly": false,            // true ON a Great Feast
"feastWindow": {               // non-null on the days AROUND one; null on the feast
  "kind": "Afterfeast",        // Afterfeast | Forefeast | Leavetaking | Midfeast | Postfeast
  "title": "Afterfeast of the Dormition of the Mother of God",
  "isGreatFeast": true,        // is this one of the Twelve?
  "isPrincipal": true,         // is the window the day's principal commemoration?
  "source": "commemoration-title"   // or "paschal-offset"
}
```

**"Feast or afterfeast" is `feastOnly || feastWindow`.** Neither alone covers
it, and that is the whole trap: `feastWindow` is `null` on the feast itself.

`kind` and `isGreatFeast` are reported separately on purpose. They are different
questions — 2026-08-30 is an `Afterfeast` with `isGreatFeast: false`, because the
Beheading of the Forerunner is not one of the Twelve. Collapsing them would bake
one caller's policy into a shared signal.

## Derivation

No new date arithmetic. It reuses the predicates the hymn logic already trusts:

| Source | Mechanism | Covers |
|---|---|---|
| `commemoration-title` | `FEAST_CYCLE_TITLE` against the commemoration title, narrowed by `windowClaimsNowAndEver()` (`menaion-principal.js`) | the fixed-date feasts — 69 window rows in `commemorations` |
| `paschal-offset` | `daysSincePascha` | Ascension (+40…47), Pentecost (+50…55) |

Both the principal commemoration and a window sitting *behind* a higher-ranked
saint are consulted, so 2026-08-09 (St Herman inside the Transfiguration
afterfeast) resolves.

The moveable ranges are **one day tighter** than the existing
`isAscensionAfterfeast` / `isPentecostAfterfeast` booleans in the same file.
Those deliberately include the feast itself, because a megalynarion and a
dismissal introit apply on the feast and through its window alike. A window
signal must not, and an earlier draft that reused them made Ascension report
`feastOnly` **and** a window at once.

## Invariants (tested)

- **INV-1** — the feast itself reports `feastOnly` with `feastWindow` null, on
  both calendars.
- **INV-2** — a window day is detected on fixed and moveable days alike, with
  the right `kind` and `source`.
- **INV-3** — an Afterfeast is not necessarily a *Great* feast window
  (2026-08-30, the Beheading).
- **INV-4** — the window is found when a saint outranks it (2026-08-09).
- **INV-5** — an ordinary day is null, so the signal means something.
- **INV-6** — `feastOnly || feastWindow` fires across feast *and* afterfeast,
  and not on an ordinary day.

## Known coverage gaps

Stated rather than papered over — the signal is useful, not complete.

- **2026-12-26 and 12-27 return null** though both fall inside the Nativity
  afterfeast (Dec 25–31). Those days carry saints' titles (Synaxis of the
  Theotokos; Stephen the Protomartyr) instead of an "Afterfeast of…" row, and
  12-28/29/30 do have rows. Closing it means authoring commemoration data from a
  source, not widening the regex.
- **Lesser-feast windows are sparse.** Only two non-Great windows exist in the
  data today (the Beheading, and the Aug 1 Procession of the Cross), so
  `isGreatFeast: false` is lightly exercised.
- **Forefeasts of the moveable cycle** have no `paschal-offset` branch; only the
  afterfeasts do.

## Keep in sync

- `FEAST_CYCLE_TITLE` / `GREAT_FEAST_WINDOW` in `server-lib/sources/menaion-principal.js`
  — the regexes this is built on. The evidence for `GREAT_FEAST_WINDOW` is 16
  reference orders; widening it without orders in hand would be a guess.
- `isAscensionAfterfeast` / `isPentecostAfterfeast` in
  `server-lib/sources/liturgy-from-orthocal.js` — related but **not**
  interchangeable, see Derivation.
- New window rows in `commemorations` change coverage; re-check the gaps above.

## Pointers

- `docs/choir-director-questions-2026-10-01.md` — the rubric this unblocks, and
  the question still outstanding with the director
- `features/patron-of-temple.md` — the consumer, which gates on `feastOnly` today
- Memory: `project_afterfeast_modeling`, `project_feast_window_sunday_2026_08_10`,
  `project_herman_alaska_audit_2026_08_07`
