# Old-Style Calendar — Design Sketch

**Status:** design, not implemented. Decision points marked with **?**.

The strategic posture ([memory: strategic-posture]) commits to serving New
Calendar (OCA, GOARCH, Antiochian, Bulgarian, Romanian, Carpatho-Russian)
**and** Old Calendar (ROCOR, Serbian, Georgian, Russian Patriarchate, Mt
Athos) jurisdictions. Old-Style support is the structural prerequisite.

---

## 1. Background — three calendars, not two

Real-world Orthodox practice uses **three** calendars (per Wikipedia, GOA):

| Calendar | Used by | Fixed feasts | Pascha |
|---|---|---|---|
| **Julian** ("Old") | Jerusalem, Russia, Serbia, Georgia, Poland, Sinai, Ukraine, Japan; many Constantinople diaspora parishes | Julian (M, D) | Julian computus |
| **Revised Julian** ("New") | Constantinople, Alexandria, Antioch, Romania, Bulgaria, Cyprus, Greece, Albania, OCA | Gregorian (M, D) | Julian computus |
| **Gregorian** | Finland (sole canonical adopter) | Gregorian (M, D) | Western Easter |

The strategic posture's 9 target jurisdictions split: 5 New (OCA, GOARCH,
Antiochian, Bulgarian, Romanian) + 3 Old (ROCOR, Serbian, Georgian) +
1 mixed (Carpatho-Russian). Finland's Gregorian-Pascha case is outside
scope.

**Important nuance:** the jurisdiction → calendar mapping is not 1:1.
Constantinople is officially Revised Julian, but many of its diaspora
parishes still use Julian. This means **style is a per-parish property,
not a per-jurisdiction one** — which validates attaching `style:` at the
translation-overlay layer (where parish-specific overlays already live)
rather than as a separate jurisdiction-level setting.

**The 14-day shift:** the Julian–Gregorian offset is 13 days through
2099, then becomes 14 days on March 1, 2100. The existing
`calculatePascha` already carries a "valid for 1900–2099" comment for
the same century-leap-year reason. We adopt the same constraint here —
hard-code 13 days, with a comment noting the 2100 revisit point.

---

## 2. The actual surface — narrower than it looks

Walking the code (`calendar-rules.js`, `server-lib/sources/matins-spec.js`,
`server-lib/sources/menaion.js`), the divergence between New and Old
Calendar is **only the fixed-feast lookup**. Everything Pascha-anchored is
identical across both Julian and Revised Julian:

| Layer | Old vs. New | Why |
|---|---|---|
| `calculatePascha(year)` | **identical** | Both calendars use the Julian computus for Pascha, then convert to the Gregorian civil date (the +13d in `calculatePascha`). |
| `getLiturgicalSeason`, `getWeekOfLent`, `getLentenSaturdayNumber`, `isSoulSaturday`, all moveable cycles (Lent, Pentecostarion, Bright Week, Holy Week) | **identical** | All measured as offsets from the same Pascha date. |
| `getTone` (Octoechos cycle) | **identical** | Anchored to All Saints Sunday = Pascha + 56d. |
| Day of week | **identical** | Civil. Sunday is Sunday. |
| Fixed-feast lookups (Menaion, Vigil saints, Great Feasts of the Lord/Theotokos on the fixed calendar, Trisagion substitutions on fixed dates, Basil-Liturgy on fixed eves) | **diverge by 13 days** | Old Calendar runs the Julian fixed calendar against the Gregorian civil date. ROCOR's Nativity = January 7 (Gregorian) = December 25 (Julian). |

So the axis is one thing: **fixed-feast date offset.** Roughly:

```js
// New Style: fixed feasts use the input civil date as-is
// Old Style: fixed feasts use (civil date - 13 days), interpreted as the Julian (M, D)
function fixedFeastDate(civilDate, style) {
  return style === 'old'
    ? new Date(civilDate.getTime() - 13 * DAY_MS)
    : civilDate;
}
```

Every site that reads `date.getUTCMonth() + 1` / `date.getUTCDate()` for a
fixed-feast lookup must consume the adjusted date instead. The user-facing
date (URL, panel header) stays the civil Gregorian date.

---

## 3. Inventory — every site that does a fixed-date lookup

Found by grep across `calendar-rules.js` + `server-lib/sources/`:

| # | Site | What it looks up |
|---|---|---|
| 1 | `getLiturgyVariant` `calendar-rules.js:1876` | Basil-Liturgy days: Jan 1, Dec 24, Jan 5 |
| 2 | `getTrisagionSubstitution` `calendar-rules.js:1909` | Sep 14, Dec 25, Jan 6 |
| 3 | `isLiturgyServed` `calendar-rules.js:1958` | 12 Great Feasts |
| 4 | `getGreatFeastKey` `calendar-rules.js:1999` | 9 fixed Great Feasts |
| 5 | `getFeastRank` `calendar-rules.js:2070` | 12 Vigil saints |
| 6 | `matins-spec.js:544` `menaionKey = ${monthNames[mo]}-${dd}` | Menaion file lookup |
| 7 | `getCommemorations` (menaion DB query, via `getMenaionRanked`) | Commemorations text |

Plus calendar-entry generators that read `(month, day)` to label feasts
(`generateOrdinaryTimeWeekday`, `generateLentenSunday`, etc.) — these need
the adjusted date for any commemoration text but the civil date for the URL
field and any Pascha-relative math.

Total: 7 lookup sites, all already isolated to small helpers. No big-bang
refactor needed; the change is **one helper + one extra parameter threaded
through buildMatinsSpec and the calendar-entry path.**

---

## 4. Decisions

### D-1. Transport: overlay-driven default + query-param override **(decided)**

The translation-overlay manifest declares `style: 'new' | 'old'` (default
`'new'` if absent). A future `rocor/manifest.json` adds `style: 'old'`
and no text overrides; selecting that overlay flips the calendar without
forcing parish-level customization. The existing `?translation=` query
param already drives overlay selection, so this is one new key in an
existing schema, not a new transport axis.

Staff/debug escape hatch: `?style=old` query param on any endpoint
overrides whatever the overlay says. Costs nothing and is invaluable for
contract tests + audit runs.

Validates against the strategic posture: per-parish overlays exist for
real reasons (Constantinople-diaspora exceptions, parish micro-customs),
and the parish has its own overlay file regardless. The style choice
piggybacks on that file.

### D-2. Plumbing: push `style` into each helper **(decided)**

Each helper that does a fixed-date lookup grows one optional parameter,
default `'new'`. Roughly 7 sites in `calendar-rules.js` + `matins-spec.js`.

Pattern:

```js
// calendar-rules.js
const JULIAN_OFFSET_DAYS = 13;  // Valid for 1900-03-01 through 2100-02-28.
                                 // From 2100-03-01 onward, becomes 14.

function fixedFeastDate(civilDate, style = 'new') {
  if (style !== 'old') return civilDate;
  return new Date(civilDate.getTime() - JULIAN_OFFSET_DAYS * DAY_MS);
}

function getGreatFeastKey(date, style = 'new') {
  const adj = fixedFeastDate(date, style);
  const month = adj.getUTCMonth() + 1;
  const day   = adj.getUTCDate();
  // …existing lookup, unchanged
  // Pascha-relative math below still uses the unadjusted `date`.
}
```

Helper contracts remain honest about what they consume; the default
preserves all current behavior; the diff is small and additive.

### D-3. Audit rule extension

**Plan:** add a `style` axis to the audit `ctx` and write new A-family
contract rules covering a handful of known dates (Nativity-on-Jan-7-OS,
Theophany-on-Jan-19-OS, Annunciation-on-Apr-7-OS, Dormition-on-Aug-28-OS,
Elevation-on-Sep-27-OS, Entry-on-Dec-4-OS, etc.). One-off full audit run
in both styles when shipping; ongoing CI runs single-style with the
contract rules to catch offset regressions cheaply.

### D-4. Default style

If no overlay sets it and no query param is passed: **`'new'`**. The
audit baseline (snapshots, knownFailures, ASSESSMENT) is all New
Calendar. Old Style is opt-in via overlay or query param.

### D-5. Edge cases named for the implementer

- **Kyriopascha** — when Annunciation (Julian Mar 25 = Gregorian Apr 7)
  coincides with Pascha. Does not occur 2024–2099 in either calendar.
  Defer.
- **Fixed-feast inside Holy Week** — e.g., Annunciation Apr 7 OS can land
  inside Holy Week (= Julian Mar 25 falling during Holy Week). The festal
  Matins overlay already has a precedence path (`feastKey` checked before
  menaion); re-test against shifted dates as part of the contract suite.
- **Dec–Jan year wrap** — January 7 OS = Dec 25 Julian. The *year* rolls
  back too: `fixedFeastDate(2026-01-07, 'old')` returns a Date object
  whose `getUTCMonth/getUTCDate` are (12, 25) and whose `getUTCFullYear`
  is 2025. That happens to be exactly what the menaion file
  (`december-25.json`) and the Pascha-year math both want. Confirmed by
  millisecond arithmetic; no special-casing needed.
- **2100-03-01 offset shift** — `JULIAN_OFFSET_DAYS = 13` is correct
  through 2100-02-28. A single comment + a TODO at the constant; the
  same century-leap-year cliff already constrains `calculatePascha`'s
  validity window.

---

## 5. Implementation order (proposed)

1. **`calendar-rules.js`** — add `fixedFeastDate(civilDate, style)` helper.
   Thread `style` through the 5 lookup functions (#1–#5 above) with
   default `'new'`.
2. **`matins-spec.js`** — thread `style` through `buildMatinsSpec`, pass
   to the (mo, dd) computation for the menaion key (#6).
3. **`server-lib/sources/menaion.js`** — `getMenaionRanked(mo, dy)`
   already takes (mo, dy), so the call sites in matins-spec and api-service
   need to pass the *adjusted* (mo, dy). One call-site change each.
4. **Route layer** — extract `style` from `(query.style || overlayStyle ||
   'new')` once per request, pass into the cascade. About 6 routes total
   read the menaion / great-feast layer; the rest are content-only.
5. **Audit rule A-family** — write 1 new contract rule per "must
   resolve" tuple (Nativity OS = Jan 7 → matins emits Nativity festal
   spec, etc.). About 10 dates worth covering for the first cut.
6. **Contract tests** — `test/old-style.test.js` with 10–12 hand-picked
   (date, style, expected feast) triples. Runs in the Node test suite,
   no server needed once `buildMatinsSpec` accepts `style`.

Estimated diff: ~150 lines net across calendar-rules + matins-spec +
routes + tests. Snapshot baseline does not change (no overlay sets
`style: 'old'` in the shipped overlay set, so default behavior is
preserved).

---

## 6. What this does **not** include

- ROCOR or Serbian overlay manifests with `style: 'old'`. Those land as
  separate per-jurisdiction PRs once the axis exists.
- Old-Style menaion content beyond what we already have. Same source
  files; the (M, D) lookup just uses the Julian (M, D) instead.
- Old-Style Paschalion. (There is no such thing in practice — Orthodox
  Pascha is one date worldwide. The ROADMAP bullet calling for a
  "Paschalion algorithm decision" is moot.)
- Calendar-style switching in the UI. That's a settings-view concern;
  ships once a `style: 'old'` overlay exists for users to select.

---

---

## Sources for the calendar facts

- [The Calendar of the Orthodox Church — GOA](https://www.goarch.org/-/the-calendar-of-the-orthodox-church)
- [Eastern Orthodox liturgical calendar — Wikipedia](https://en.wikipedia.org/wiki/Eastern_Orthodox_liturgical_calendar)
- [Revised Julian calendar — Wikipedia](https://en.wikipedia.org/wiki/Revised_Julian_calendar)
- [Julian calendar — Wikipedia](https://en.wikipedia.org/wiki/Julian_calendar)
- [Church Calendar — OrthodoxWiki](https://orthodoxwiki.org/Church_Calendar)
