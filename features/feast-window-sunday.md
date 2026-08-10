# Feature: a Sunday inside a feast window

## Purpose

An afterfeast, forefeast or leavetaking that lands on a Sunday has to sing three
things at once — the Resurrection, the feast window, and whatever saint the
calendar appoints. This spec fixes where each one goes.

Worked example: **2026-08-16**, the Translation of the Image Not-Made-by-Hands
inside the Afterfeast of the Dormition, which the weekly LLM judge reported with
seven high-severity findings.

## The rule

**The feast window claims "Now and ever…".** The saint, if there is one, takes
"Glory…". If there is no saint, the Resurrection kontakion takes "Glory…". The
generic Kontakion-Theotokion ("Protection of Christians…") does not appear at
all — it is what gets sung when nothing else claims the slot, and inside a window
something always does.

Two OCA order documents establish this independently:

| Source | Glory… | Now and ever… |
|---|---|---|
| `2026-0823-order-services.txt` (Leavetaking of the Dormition) | Kontakion of the Resurrection, Tone 3 | Kontakion of the Feast, Tone 2 |
| `2026-0816-order-services.txt` (the Image) | Kontakion of the Image, Tone 2 | Kontakion of the Feast, Tone 2 |
| `2026-0208-order-services.txt` (Afterfeast of the Meeting) | Kontakion from the Triodion, Tone 4 | Kontakion of the Feast, Tone 1 |

Troparia follow the same precedence and the window is sung LAST: Resurrection,
saint, Feast.

## What was broken, and why it hid

`feastCycleComm` — the mechanism that tags a window's hymns so the restructure
knows they own "Now and ever…" — is defined as *a notable commemoration that is
not the principal*:

```js
const feastCycleComm = (ranked?.notable || []).find(
  c => c.id !== menaionPrincipal?.id && FEAST_CYCLE_TITLE.test(c.title || ''));
```

That is right on 8-09, where St. Herman is the principal and the Transfiguration
afterfeast sits beside him. It is silent in the **ordinary** case, where the
window IS the principal because no saint outranks it. On those Sundays the
restructure in `api-liturgy.js` found no `feastCycle` kontakion, gave "Now and
ever…" to the Kontakion-Theotokion, and **dropped the window's kontakion off the
end of the service**.

`principalIsFeastWindow` closes it: when the principal's own title matches
`FEAST_CYCLE_TITLE`, its kontakion is tagged the same way.

Five 2026 Sundays change — 2-08 (Meeting), 8-16 and 8-23 (Dormition), 9-20
(Elevation), 11-22 (Entry). All five previously ended on the Theotokion with the
feast kontakion either at "Glory…" or gone.

## The co-celebrated saint

Supplied through `variable-sources/cocelebrated-overlays.json`, the same
month-day mechanism All Saints of North America (6-14) and Constantine and Helen
(5-21) already use. Two things had to change for it to work inside a window:

- **Kontakion placement.** The pre-existing branch assumed `kontakia[0]` is the
  feast kontakion — true on a Great Feast, false on a Sunday, where `[0]` is the
  Resurrection. Applied there it would have moved "Now and ever…" onto the
  Resurrection kontakion. It now splices in front of the `feastCycle` kontakion
  when one exists.
- **`communionHymn.prescribed`.** An overlay koinonikon is normally opt-in
  (`includeSecondKoinonikon === true`) because it is an extra. On 8-16 the OCA
  order *prints* both verses, so the entry marks itself prescribed and renders by
  default. An explicit parish `includeSecondKoinonikon: false` still wins.

## The megalynarion

`isDormitionAfterfeast` (Aug 15 – Aug 23) mirrors `isTransfigurationAfterfeast`
(Aug 6 – 13): the festal megalynarion replaces "It is truly meet" for the whole
window, not only on the feast. `great-feast-variants.dormition.megalynarion`
already held both halves the order prints — "The Angels, as they looked…" and
"The limits of nature are overcome…".

## Known gaps on 8-16 — deliberate, not oversights

- **The Image's prokeimenon (Tone 4) and alleluia (Tone 4).** The OCA order
  names them by incipit only ("Sing to the Lord a new song…") and no
  authoritative verse text is on hand. Not authored rather than invented; the
  Sunday Tone-2 propers render alone. Recorded in the overlay's `_note`.
- **The second Gospel** (Luke 9:51-56; 10:22-24). Not a defect — this is the
  `includeSecondGospel` one-Gospel parish practice. Both Epistles do render.
- **The Beatitudes** want 4 resurrectional + 2 from Ode 1 of each Dormition
  canon + 4 from Ode 6 of the Image's. This is the standing canon-ode troparia
  sourcing gap, not specific to this date.
- **2-08 still lacks its Triodion kontakion** at "Glory…" — a pre-existing gap
  this work exposed but did not introduce, and does not fix.

## Keep in sync

- `server-lib/sources/liturgy-from-orthocal.js` — `principalIsFeastWindow`,
  `isDormitionAfterfeast`, the overlay troparion/kontakion placement
- `server-lib/routes/api-liturgy.js` — the Sunday-kontakia restructure
- `variable-sources/cocelebrated-overlays.json` — the 8-16 entry
- `test/contracts/feast-window-sunday-kontakia.test.js` — 7 invariants
