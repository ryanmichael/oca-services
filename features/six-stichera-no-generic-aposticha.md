# A six-stichera saint's Aposticha takes no generic Glory

**Status:** shipped 2026-09-24 · **Contract:** `test/contracts/six-stichera-no-generic-aposticha.test.js`

## Rule

A saint of simple (six-stichera) rank whose Menaion service prints no Aposticha
has **none**. On a Saturday evening the Aposticha ends
"Glory… now and ever… Resurrectional Aposticha Theotokion"; on a weekday, the
Octoechos Theotokion. The General Menaion must not invent a Glory for it.

The General-Menaion Aposticha stand-in stays for:

- a saint with **no service of its own** (every sticheron is General Menaion), and
- a **polyeleos or vigil** saint, whose real service does carry an Aposticha Glory
  (1-11: "Glory… Ven. Theodosius, Tone 8") that the DB does not yet hold.

## Why

Found against the Tyler 09.26.26 Great Vespers packet. The OCA order for 9-27
(`reference/orders/2026-0927-order-services.txt`) reads
"Glory… now and ever… Resurrectional Aposticha Theotokion, Tone 8"; we sang
"O come all ye lovers of the Martyrs… the famous Martyr of Christ Callistratus",
a General-Menaion template, plus a Tone 6 Theotokion.

The same fallback put "O Xenia our **Father**", "O Apostle **Equals**" and, on
the eve of the Akathist Saturday, "the honorable **5th Saturday**, O most holy
and pure Virgin" into the Aposticha. 60 dates in 2026 changed, every one a
template Glory; OCA orders checked for 9-27 and 10-4 agree.

## Also fixed with it

Row 9187, the Octoechos martyrikon "In their sufferings, Thy martyrs O Lord", was
scraped onto Callistratus as a 4th Lord-I-Call sticheron, so 9-27 sang 6
Resurrection + 4 instead of the ordered 7 + 3. The same text sits on 16 other
saints (backlog: verify each against its OCA order before removing).

## Invariants

- **INV-1** 9-26 eve: Aposticha has no Menaion hymn; it ends with the Tone 8
  Resurrectional Aposticha Theotokion under a combined Glory/Now label.
- **INV-2** 9-26 eve: Lord-I-Call is 7 Resurrection + 3 Callistratus.
- **INV-3** 1-10 eve (Theodosius, polyeleos): the Aposticha Glory is still sung.
