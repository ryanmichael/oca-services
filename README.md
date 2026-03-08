# Orthodox Daily Services — Data Architecture

## Overview

A service like Great Vespers is not a static document — it is the **output of an assembly algorithm**. This project models that process as three distinct layers:

```
service-structure/        ← the "skeleton": ordered sections + assembly logic
fixed-texts/              ← invariable prayers, psalms, litanies (same every time)
variable-sources/         ← the "books" the typikon draws from by date
  prokeimena.json         ← evening prokeimena by weekday + special occasions
  octoechos.json          ← 8 tones × stichera / aposticha / troparia / theotokia  [TODO]
  calendar.json           ← feast days, ranks, tone assignments per date           [TODO]
  menaion/                ← fixed-calendar feasts (one file per feast day)         [TODO]
  triodion/               ← Lenten/Paschal cycle propers                           [TODO]
  pentecostarion/         ← Paschal cycle (Pascha → All Saints)                    [TODO]
```

Plus an **assembler** — a function `assembleService(date, serviceType)` that:
1. Loads the service structure skeleton
2. Resolves each `variable` block by looking up the correct source for the given date
3. Returns an ordered array of rendered blocks for display or API delivery

---

## Block Types in Service Structure

Each block in a service structure file is one of two types:

### `fixed`
Points to a key in `fixed-texts/`. Content is always identical.
```json
{
  "type": "fixed",
  "speaker": "priest",
  "textKey": "prayers.ourFather"
}
```

### `variable`
Describes *how* to resolve content at runtime. A `resolvedBy` field names the resolver function; `params` and `sources` shape the lookup.
```json
{
  "type": "variable",
  "slot": "prokeimenon",
  "resolvedBy": "prokeimenonResolver",
  "params": { "sources": ["weekday", "greatFeast", "soulSaturday"] }
}
```

---

## Resolver Functions (to be implemented)

| Resolver               | Responsibility                                                    |
|------------------------|-------------------------------------------------------------------|
| `kathismaResolver`     | Determine if/which kathisma section is read based on date rules   |
| `prokeimenonResolver`  | Select correct prokeimenon (weekday / great feast / soul Sat)     |
| `lessonsResolver`      | Return OT lessons if appointed by menaion/pentecostarion          |
| `sticheraAssembler`    | Build ordered list of stichera with correct verse insertions      |
| `apostichaAssembler`   | Build aposticha with correct verse set for day                    |
| `tropariaAssembler`    | Assemble troparia with glory/now/theotokion structure             |
| `dismissalResolver`    | Return correct dismissal text for feast/day                       |

---

## Variable Sources Status

| File                        | Status      | Notes                                      |
|-----------------------------|-------------|--------------------------------------------|
| `prokeimena.json`           | ✅ Complete  | All 7 weekdays + great prokeimena + Soul Sat|
| `octoechos.json`            | 🔲 TODO     | Needs example service data to populate     |
| `calendar.json`             | 🔲 TODO     | Needs feast day database                   |
| `menaion/`                  | 🔲 TODO     | One file per fixed feast                   |
| `triodion/`                 | 🔲 TODO     | Lenten propers                             |
| `pentecostarion/`           | 🔲 TODO     | Paschal cycle                              |

---

## Services Planned

- [x] Great Vespers structure
- [ ] Daily Vespers structure
- [ ] Matins structure
- [ ] Divine Liturgy structure

---

## Key Rubrical Logic to Encode

### Great vs Daily Vespers
- **Great Vespers**: Kathisma 1 §1 ("Blessed is the Man"), Entrance, OT Lessons (when appointed), Augmented Litany *before* Vouchsafe
- **Daily Vespers**: No kathisma on Sunday evenings, no entrance, no lessons, Augmented Litany *after* Troparia

### Kathisma 1 §1 Exceptions (not sung at Great Vespers)
- On eves of great feasts of the Lord (except when the eve falls on Sat or Sun evening)
- On evenings of these feasts (except Saturday evening)

### Prokeimenon Exceptions
- Soul Saturday eve: Alleluia replaces prokeimenon
- Great feasts on Saturday: usual Saturday prokeimenon takes precedence; great prokeimenon sung previous evening

---

## Tone Cycle

The 8-tone (octoechos) cycle governs which tone's stichera/troparia are used on a given Sunday. The cycle resets at a fixed point (Tone 1 = first Sunday after All Saints Sunday). `calendar.json` will encode the tone for each date.
