# Feature: a lesser feast's window does not claim "Now and ever…"

## Problem

The feast-window machinery (`FEAST_CYCLE_TITLE` — Afterfeast / Forefeast /
Leavetaking / Midfeast / Postfeast) was built for the Twelve Great Feasts, where
the window's hymn displaces the closing Theotokion:

- Vespers concluding troparia: `Now and ever… Troparion of the Feast`
  (in place of the Resurrectional Dismissal Theotokion)
- Liturgy kontakia: `Now and ever… Kontakion of the Feast`
  (in place of the Kontakion-Theotokion, "Protection of Christians…")

That is correct for 2026-08-16 (Dormition) and 2026-08-09 (St. Herman inside the
Transfiguration afterfeast). It is **wrong for a window whose feast is not one of
the Twelve.** There, the Theotokion still closes and the window is sung in an
ordinary slot.

## Rule

A feast window claims "Now and ever…" **only when its feast is a Great Feast.**
`windowClaimsNowAndEver(title)` in `server-lib/sources/menaion-principal.js` is
the single predicate; both the Vespers path (`server-lib/assemble/for-date.js`)
and the Liturgy path (`server-lib/sources/liturgy-from-orthocal.js`) consult it.

Where the lesser window goes instead differs by service, because the services
print a different number of saint hymns:

| Service | Slots printed | Lesser window sits |
|---|---|---|
| Great Vespers, concluding troparia | Resurrection + one saint hymn + Theotokion | at the **Glory** — it outranks the day's saint for the single slot |
| Divine Liturgy, troparia and kontakia | Resurrection + patron + N saints + Theotokion | **ahead of the Glory**, unconnected; the day's saints keep the Glory |

## Evidence

`reference/orders/` — all 16 orders that print a window kontakion give it
"Now and ever…", and every one is a Great Feast (Theophany, Nativity, Dormition,
Entry, Meeting, Annunciation, Nativity of the Theotokos, Midfeast).

`reference/orders/2026-0830-order-services.txt` is the counterexample. Inside
the Afterfeast of the Beheading of the Forerunner — not one of the Twelve — it
prints:

```
Great Vespers                     Divine Liturgy
Resurrectional Troparion, T4      Troparion of the Resurrection, T4
Glory… Forerunner, T2             Troparion of the Church (if of Patron Saint)
Now and ever… Resurrectional      Troparion of the Forerunner, T2
  Dismissal Theotokion, T2        Troparion of the Saints, T4
                                  Kontakion of the Resurrection, T4
                                  Kontakion of the Church (if of Patron Saint)
                                  Kontakion of the Forerunner, T5
                                  Glory… Kontakion of the Saints, T8
                                  Now and ever… "Steadfast Protectress…", T6
```

Of the 30 window titles in `commemorations`, exactly two are not Great Feasts:
"Forefeast of the Procession of the Honorable and Lifegiving Cross of the Lord"
(August 1) and the Afterfeast of the Beheading (August 30).

## Invariants

- **INV-1** — 8-29 Great Vespers concluding troparia are Resurrection T4, then
  the Glory connector, then the Forerunner T2, then the Now connector, then the
  Resurrectional Dismissal Theotokion. Asserted by **position**, not by label.
- **INV-2** — the Theotokion at 8-29 Vespers follows the tone of the Glory (T2,
  the Forerunner's), not the tone of the day's saint.
- **INV-3** — 8-30 Liturgy troparia read Resurrection → Patron → Forerunner →
  Saints, in that order.
- **INV-4** — 8-30 Liturgy kontakia put the Forerunner **before** the Glory
  connector, the Saints immediately after it, and the Kontakion-Theotokion after
  the Now connector.
- **INV-5** — the guard does not over-fire: 8-23 (Leavetaking of the Dormition, a
  Great Feast) still gives its kontakion "Now and ever…" and emits **no**
  Kontakion-Theotokion.
- **INV-6** — likewise 8-08 Great Vespers (St. Herman on 8-09, inside the Transfiguration
  afterfeast) still closes on the Feast troparion, not a Dismissal Theotokion.
- **INV-7** — `windowClaimsNowAndEver` is true for every window title in
  `commemorations` except the two lesser ones, and false for any non-window
  title.
