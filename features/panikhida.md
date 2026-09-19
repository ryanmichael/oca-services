# Feature: Panikhida (Memorial Service for the Departed)

**Status:** shipped (this commit)
**Contract test:** `test/contracts/panikhida.test.js`
**Route:** `GET /api/panikhida`
**Assembler:** `assemblers/panikhida.js`
**Texts:** `fixed-texts/panikhida-fixed.json` (+ Psalms 90 and 50 from `fixed-texts/psalter.json`)

## Purpose

The Panikhida is served on request — anniversaries, the 3rd/9th/40th day, Soul
Saturdays after Liturgy — and is almost entirely invariable. The only runtime
inputs are the names of the departed (which drive number and gender across
every petition, hymn and the dismissal) and how much of the canon is sung.
Until this feature the app had no memorial order at all; the pieces existed
only as `liturgy-fixed.json > litany-departed` and the Soul Saturday kontakion.

## Source

Wording is the OCA *Burial of a Layperson* (2018, oca.org/files/PDF/Music/Burial/),
which shares every hymn and prayer of the parish Panikhida. Order of the
parish (abbreviated) Panikhida cross-checked against an OCA parish service
sheet. The Bright Week Paschal Panikhida is a different order and is **not**
modeled — the route refuses a Bright Week `date` with 404.

## Interface

```
GET /api/panikhida
  ?names=John,Mary      comma-separated; up to 50. Empty → generic "(NN.)" plural form
  &gender=m|f           only consulted when exactly ONE name is given (default m)
  &canon=full|brief     full = heirmoi of Odes I,III,IV,V,VI,VII,VIII,IX (default)
                        brief = Odes III, VI, IX only
  &psalm90=0            omit Psalm 90 and its reader's preamble
  &date=YYYY-MM-DD      optional; heading only + Bright Week guard
  &pronoun=tt|yy &translation=<id> &format=html   as on every route
```

Overlay cascade: `fixed-texts/translations/<id>/panikhida-fixed.json` cascades
onto the base under service name `panikhida` (registered via `registerBaseFixed`).

## Inflection

Every text in `panikhida-fixed.json` that names the departed is authored ONCE
with tokens — `{servant} {Servant} {soul} {N} {they} {They} {their} {Their}
{them} {has} {is} {was}` — and the assembler resolves them against
`forms.plural | forms.masculine | forms.feminine`. `{N}` becomes the joined
names, or the table placeholder `(N.)` / `(NN.)` when no names are given.

| names | gender | form |
|---|---|---|
| 0 | any | plural |
| 1 | m / absent | masculine |
| 1 | f | feminine |
| 2+ | any | plural |

## Order (block ids in emission order)

1. Opening — `pk-bless`, `pk-excl`, `pk-amen`
2. Trisagion → Our Father — `pk-tris` … `pk-of-amen`
3. Psalm 90 (optional) — `pk-lhm12`, `pk-ps90-gn`, `pk-ocluw-{0..2}`, `pk-ps90`, `pk-ps90-gn2`, `pk-ps90-all`
4. Alleluia T8 with 3 verses — `pk-al-v{i}` / `pk-al-r{i}`
5. Troparion T8 "Thou only Creator" + Glory/Now + Theotokion — `pk-trop`, `pk-trop-gn`, `pk-trop-theot`
6. Evlogitaria T5 — refrain BEFORE each of 6 troparia (`pk-ev-ref-{i}`, `pk-ev-{i}`), then `pk-ev-glory`, `pk-ev-triad`, `pk-ev-now`, `pk-ev-theot`, `pk-ev-all`
7. Little Litany — `pk-lit1-*` ending `pk-lit1-prayer`, `pk-lit1-excl`, `pk-lit1-amen`
8. Kathisma hymn T5 + Theotokion — `pk-kath`, `pk-kath-gn`, `pk-kath-theot`
9. Psalm 50 — `pk-ps50`
10. Canon T6 (heirmos, refrain ×2, Glory, Now per ode) — `pk-ode{n}-irm|ref|glory|now`; Little Litany after Ode III (`pk-lit2-*`) and Ode VI (`pk-lit3-*`), then `pk-kont`, `pk-ikos` before Ode VII
11. Trisagion → Our Father — `pk-cl-*`
12. Troparia T4 — `pk-tr-0`, `pk-tr-1`, `pk-tr-glory`, `pk-tr-g`, `pk-tr-now`, `pk-tr-n`
13. Augmented Litany — `pk-lit4-*` (triple "Lord, have mercy") ending in prayer/exclamation/amen
14. Dismissal → Memory Eternal — `pk-dis-*`, `pk-me-call`, `pk-me`, `pk-me-dwell` (last block)

## Invariants (tested — each asserts POSITION, not a label)

- **INV-1** No `{token}` survives assembly in any of the four forms (plural, masculine, feminine, no-name).
- **INV-2** Feminine single form contains no `his`/`him` referring to the departed; masculine contains no `her`; plural contains no `his`/`her` outside Psalm 90 and the dismissal's references to Christ.
- **INV-3** Evlogitaria: the refrain block immediately precedes each of the six troparia; `pk-ev-glory` immediately precedes `pk-ev-triad`; `pk-ev-now` immediately precedes `pk-ev-theot`.
- **INV-4** The Prayer for the Departed ("O God of spirits") is said exactly four times, and its exclamation immediately follows each one: after the Evlogitaria, after Ode III, after Ode VI, after the Tone 4 troparia.
- **INV-5** Kontakion + Ikos sit between the Ode VI litany's Amen and the Ode VII heirmos (in `full`) — i.e. `pk-lit3-amen` < `pk-kont` < `pk-ikos` < `pk-ode7-irm`; in `brief`, before `pk-ode9-irm`.
- **INV-6** `canon=brief` emits exactly Odes III, VI, IX and still has all four prayers and the kontakion.
- **INV-7** `psalm90=0` removes exactly the seven Psalm-90 blocks and nothing else.
- **INV-8** The last block is `pk-me-dwell` and the one before it is `pk-me` ("Memory eternal!").
- **INV-9** Names appear in every prayer/exclamation/petition that carries `{N}` — 4 prayers, 4 exclamations, 4 first-petitions, dismissal, Memory-Eternal call — and nowhere in a hymn.
- **INV-10** Route: Bright Week `date` → 404; no date → 200 with `date: null`.

## Not modeled / follow-ups

- Bright Week Paschal Panikhida.
- Great Panikhida / Parastas (full 17th Kathisma, full canon troparia).
- Home-page UI entry (the date-driven service list has no name form yet) — reach it by URL.
- Parish overlays: none authored; the cascade is wired.
