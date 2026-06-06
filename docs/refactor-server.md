# Refactor sketch — `server.js` modularization

Design doc for the Phase 2 follow-on in [`ROADMAP.md`](../ROADMAP.md):
**"Split `server.js` into `routes/`, `overlays/`, `sources/`, `cache/`."**
**No code changes yet.** This sketch is the artifact reviewed before any
function is moved.

**Status:** Draft.

## Why now

`server.js` is 5,375 lines in a single file. Phase 2 (`assembler.js`) collapsed
the assembler from 5,665 lines → 12-line facade. `server.js` is now the next
largest single file in the repo and the next obstacle to a contributor
landing — every new endpoint, every new overlay shape, every new translation
loader currently lands inside one file. Where the assembler split unblocked
*jurisdictional* variants, the server split unblocks *operational* changes:
new endpoints, new caches, alternative front-ends, request-time middleware.

The same trigger logic from `ASSESSMENT.md` §3 applies: modularize *before*
the next layer lands, not after. The next likely layers are Playwright smoke
tests (Phase 2 next bullet), per-jurisdiction route prefixes, and a
schema-driven endpoint registry — each is much cheaper against a split
server than against a 5k-line `handleRequest`.

## Current shape

### Module breakdown by section header (`// ─── …`)

| Section | Line | Lines | What it is |
|---|---|---|---|
| Config + `loadJSON` | 33–45 | 13 | port arg parsing + JSON loader primitive |
| Translation overlay system | 47–333 | 287 | manifest validation, extends chain, cascade merge, drift |
| Overlay diff + provenance | 335–441 | 107 | `collectStringValues`, `tagBlocksWithOverlay`, `diffOverlay`, `resolveTranslation`, `tagProvenance` |
| Sources + calendar lookup | 443–525 | 83 | `loadSources`, `getCalendarEntry`, `getNextDateStr` |
| HTML helpers | 527–541 | 15 | `escHtml`, `formatDate` |
| Home page + CSS | 543–737 | 195 | `HOME_CSS`, `renderHomePage` |
| Error / info pages + service HTML | 739–845 | 107 | `formatAssemblyWarning`, `renderErrorPage`, `renderServiceHTML` |
| Menaion DB helpers | 847–988 | 142 | `getMenaionPrimary`, `getSticheraDay`, `getMenaionRanked`, `extractShortName` |
| General Menaion fallback | 990–1127 | 138 | `GENERAL_MENAION_FALLBACK`, `getGeneralMenaionTexts`, `getMenaionDay/List` |
| DB primitives | 1131–1155 | 25 | `openDb`, `openDbWrite` (better-sqlite3 wrappers) |
| Orthocal API cache | 1157–1243 | 87 | `ensureOrthocalCacheTable`, get/set, `fetchOrthocalDay` (async) |
| Beatitudes builder | 1213–1248 | (within ↑) | `buildBeatitudesTroparia` |
| Data tables (great-feast, pent-overrides, cocelebrated, propers, labels, defaults) | 1245–1293 | 49 | top-level `loadJSON` constants |
| Data file validation | 1295–1316 | 22 | calls into `data-validators.js` |
| Matins spec builder | 1318–2415 | 1,098 | `_loadFestalMatins`, `_buildGreatFeastMatinsStub`, `_buildSundayMatinsFromOctoechos`, `_applyCrossSundayOverlay`, `_mergeAfterFeastCanon`, `buildMatinsSpec`, `buildLiturgyFromOrthocal` |
| DB source resolver | 2417–2624 | 208 | `buildNestedPath`, `categorizeHymn`, `transformSectionBlocks`, `buildDbSource`, `getDbBlocks`, `mapDbBlocks` |
| `assembleForDate` | 2626–2976 | 351 | core per-date assembly dispatcher (calls `assembleVespers` + variants) |
| Pronoun substitution | 2978–3038 | 61 | `YOU_YOUR_RULES`, `applyYouYour` |
| `getDayLabel` | 3040–3098 | 59 | season → label resolver |
| Dashboard data builder | 3100–3322 | 223 | `buildDashboardData`, `formatSticheraSource` |
| Static file serving | 3335–3343 | 9 | `serveStatic` |
| **Boot block** | 3357–3490 | 134 | sources load + 11 fixed-text loads + `validateAllTranslations` + `ensureOrthocalCacheTable` |
| `parseQuery` | 3347–3355 | 9 | URL query parsing |
| **`handleRequest`** | 3492–5367 | **1,876** | every endpoint in one switch |
| Server bootstrap | 5369–5375 | 7 | `http.createServer` + `listen` |

### Endpoints in `handleRequest` (23)

```
/                              /favicon.svg            /styles/*  /scripts/*
/api/service                   /api/education-modules  /api/education-modules-vespers
/api/translations              /api/liturgy            /api/presanctified
/api/bridegroom-matins         /api/matins             /api/passion-gospels
/api/royal-hours               /api/lamentations       /api/vesperal-liturgy
/api/kneeling-vespers          /api/paschal-hours      /api/pascha-collection
/api/choir-prep                /api/days               /api/search
/service                       /api/dashboard          /dashboard
```

### Module-level state (the hidden contract)

```js
const translationCache         = new Map();           // overlayId → merged
const translationManifestCache = new Map();
const baseKeySetCache          = new WeakMap();
const fixedTextRegistry        = {};                  // serviceName → base
let   sources;                                        // octoechos+menaion+triodion+eothinon+db
let   fixedTexts, liturgyFixed, presanctifiedFixed,   // 11 base fixed-text objs
      paschalHoursFixed, midnightOfficeFixed,
      paschalMatinsFixed, passionGospelsFixed,
      bridegroomMatinsFixed, lamentationsFixed,
      vesperalLiturgyFixed, kneelingVespersFixed,
      royalHoursFixed, matinsFixed;
```

These mutate at **boot time only** (between requires and `server.listen`).
Treat them as effectively immutable post-boot. Any refactor that turns them
into per-request state is out of scope.

### Module imports

```js
const http  = require('node:http');
const fs    = require('fs');
const path  = require('path');
const { /* 12 assemble* + resolveSource */ } = require('./assembler');
const { /* 13 calendar-rules exports */    } = require('./calendar-rules');
const { renderService, renderVespers }       = require('./renderer');
const { getMatinsKathismata }                = require('./kathisma');
const { deduplicateBySource }                = require('./oca-psalter');
```

The Orthocal-cache section adds `require('better-sqlite3')` lazily inside
`openDb`. That stays.

## Target shape

Mirror the `assemblers/` layout: small primitive directory, topic-grouped
helper directories, one file per endpoint, public `index.js` re-exports.

```
server.js                                       # 7-line facade (http.createServer + listen)
server-lib/
  router.js                                     # tiny path-prefix → handler dispatcher
  index.js                                      # public surface for tests
  _shared/
    load-json.js                                # loadJSON
    parse-query.js                              # parseQuery
    serve-static.js                             # serveStatic
    html.js                                     # escHtml + formatDate
  overlays/
    manifest.js                                 # validateManifest, getTranslationManifests, listAvailableTranslations
    extends-chain.js                            # resolveExtendsChain
    cascade.js                                  # deepMergeOverlay, getOverlayFixed, getLiturgyFixed
    rubrics.js                                  # getOverlayRubrics
    drift.js                                    # collectKeyPaths, warnUnknownKeys, validateAllTranslations
    diff.js                                     # collectStringValues, tagBlocksWithOverlay, diffOverlay, getOverlayIntroducedStrings
    provenance.js                               # tagProvenance, resolveTranslation
    registry.js                                 # registerBaseFixed, fixedTextRegistry  (the single source of overlay state)
  sources/
    load.js                                     # loadSources (octoechos/prokeimena/menaion/triodion/eothinon)
    calendar.js                                 # getCalendarEntry, getNextDateStr
    menaion.js                                  # getMenaionPrimary, getSticheraDay, getMenaionRanked, getMenaionDay/List
    general-menaion.js                          # GENERAL_MENAION_FALLBACK, extractShortName, getGeneralMenaionTexts
    beatitudes.js                               # buildBeatitudesTroparia
    propers.js                                  # GREAT_FEAST_VARIANTS, PENTECOSTARION_SUNDAY_OVERRIDES, COCELEBRATED_OVERLAYS, DAILY_PROPERS, LITURGICAL_DAY_LABELS, LITURGY_DEFAULTS
    matins-spec.js                              # _loadFestalMatins, _buildGreatFeastMatinsStub, _buildSundayMatinsFromOctoechos, _applyCrossSundayOverlay, _mergeAfterFeastCanon, buildMatinsSpec
    liturgy-from-orthocal.js                    # buildLiturgyFromOrthocal
    db-source.js                                # buildNestedPath, categorizeHymn, transformSectionBlocks, buildDbSource, getDbBlocks, mapDbBlocks, SECTION_LABELS, SECTION_ORDER
  cache/
    sqlite.js                                   # openDb, openDbWrite
    orthocal.js                                 # ensureOrthocalCacheTable, get/set, fetchOrthocalDay
  assemble/
    for-date.js                                 # assembleForDate              (the per-date dispatcher)
    pronouns.js                                 # YOU_YOUR_RULES, applyYouYour
    day-label.js                                # ORDINALS, getDayLabel
  render/
    home-page.js                                # HOME_CSS, renderHomePage, getCollectedDates
    error-page.js                               # renderErrorPage, formatAssemblyWarning
    service-page.js                             # renderServiceHTML
    dashboard.js                                # buildDashboardData, formatSticheraSource
  boot/
    load-fixed.js                               # the 11 fixed-text loads + registerBaseFixed wiring
  routes/
    static.js                                   # /, /favicon.svg, /styles/*, /scripts/*
    service.js                                  # /api/service              (the heaviest route)
    liturgy.js                                  # /api/liturgy
    presanctified.js                            # /api/presanctified
    matins.js                                   # /api/matins
    bridegroom-matins.js                        # /api/bridegroom-matins
    passion-gospels.js                          # /api/passion-gospels
    royal-hours.js                              # /api/royal-hours
    lamentations.js                             # /api/lamentations
    vesperal-liturgy.js                         # /api/vesperal-liturgy
    kneeling-vespers.js                         # /api/kneeling-vespers
    paschal-hours.js                            # /api/paschal-hours
    pascha-collection.js                        # /api/pascha-collection
    choir-prep.js                               # /api/choir-prep
    days.js                                     # /api/days
    search.js                                   # /api/search
    translations.js                             # /api/translations
    education-modules.js                        # /api/education-modules{,-vespers}
    service-html.js                             # /service (HTML dispatch page)
    dashboard.js                                # /api/dashboard, /dashboard
```

Roughly 35 files. After the split, `server.js` is the same shape as
`assembler.js` ended up — a thin entry that imports a single bundle and binds
it.

## The router

The current dispatch is a 1,876-line `else if` chain. The replacement is
deliberately *small* — no middleware framework, no Express. Just a Map of
(method, exact-path) and an array of prefix-match handlers, scanned in order.

```js
// server-lib/router.js  (sketch)
function makeRouter() {
  const exact = new Map();        // 'GET /api/liturgy' → handler
  const prefix = [];              // [{ method, prefix, handler }]
  return {
    get(p, h)   { exact.set('GET ' + p, h);    return this; },
    prefix(p,h) { prefix.push({ prefix: p, handler: h }); return this; },
    dispatch(req, res) {
      const url = req.url || '/';
      const pathname = url.split('?')[0];
      const exactHit = exact.get((req.method || 'GET') + ' ' + pathname);
      if (exactHit) return exactHit(req, res);
      for (const r of prefix) if (pathname.startsWith(r.prefix)) return r.handler(req, res);
      res.writeHead(404); res.end();
    },
  };
}
```

Each handler keeps the same `(req, res)` signature it has today inside the
`else if` arm. **No async middleware, no body parsing layer** — handlers
that need an async path keep the `(async () => {…})().catch(…)` shape they
currently have. The point of this refactor is *physical reorganization*,
not framework adoption.

## Migration plan — 6 phases, snapshot-gated

Same pattern as Phase 2:

- **Phase A — primitives.** Extract `_shared/` (loadJSON, parseQuery,
  serveStatic, html). Pure functions, no state, no risk.
  Snapshot gate: 42/42 byte-identical, 109/109 tests pass.

- **Phase B — overlays.** Extract `overlays/` (~395 lines, server.js
  47–441). The drift detector, manifest validation, and cascade engine
  all move together because they share the cache Maps. The `fixedTextRegistry`
  becomes a module singleton inside `overlays/registry.js`; everywhere else
  imports it. **Risk surface:** boot ordering — `registerBaseFixed` is
  called during the boot block and `validateAllTranslations()` runs after
  all bases register. Keep that ordering when wiring imports.

- **Phase C — sources + cache.** Extract `sources/` (calendar/menaion/
  beatitudes/matins-spec/liturgy-from-orthocal/db-source) and `cache/`
  (sqlite + orthocal). They go together because `buildLiturgyFromOrthocal`
  consumes `fetchOrthocalDay`. **Risk surface:** the matins spec builder is
  1,098 lines and threads through every Sunday-Matins gap fix from the
  recent audit — leave it intact, extract whole.

- **Phase D — assemble + render.** Extract `assemble/` (for-date, pronouns,
  day-label) and `render/` (home, error, service, dashboard). These are
  pure read-only views over the data layer. **Risk surface:** the home page
  is ~200 lines of inline CSS — verify the rendered HTML still byte-matches
  by curling `/` before and after.

- **Phase E — routes.** Extract `routes/` in 2–3 batched PRs (split heavy
  endpoints from light ones). Build the `router.js`. Wire the boot block
  into `boot/load-fixed.js`. **Risk surface:** the largest. Each route's
  `(req, res)` signature must be preserved exactly, including the
  `res.setHeader('Access-Control-Allow-Origin', '*')` calls scattered
  through `/api/service`. Snapshot harness covers 12 of 23 endpoints —
  manually curl the other 11 before-and-after.

- **Phase F — facade.** Collapse `server.js` to 7 lines:
  ```js
  'use strict';
  const http = require('node:http');
  const { boot, router } = require('./server-lib');
  boot();
  http.createServer((req, res) => router.dispatch(req, res))
      .listen(process.env.PORT || 3000, () => console.log('Server up.'));
  ```
  Update ROADMAP, capture pattern observations as memory.

## Safety net

Already in place. No new tooling needed.

- `npm run snapshot:verify` — 42 byte-level hashes covering 12 endpoints.
  Refresh **only** when intentional behavior changes ship.
- `npm test` — 109 unit tests (data validators).
- `npm run audit:quick` — 0/0/0 strict audit on vespers.
- `npm run audit:endpoints` — should hold at 11 pre-existing low-sev items.

For each Phase, the verification ritual is:

```bash
node server.js --port 3001 &   # start server in another shell
SNAPSHOT_HTTP_BASE=http://localhost:3001 npm run snapshot:verify
npm test
```

If any hash drifts, stop. Investigate before committing.

## Decision points for review

These mirror Phase 2's six confirmed defaults. Same answers expected unless
the user flags otherwise.

1. **Flat layout per directory?** Yes — match `assemblers/_shared/`. No
   sub-grouping inside `overlays/`, `sources/`, etc.

2. **`server.js` stays as the facade name?** Yes. External callers
   (`package.json` `"main"`, `npm start`, Railway, `node server.js`) all
   reference it. Keep the filename.

3. **Per-PR helper extraction vs. big-bang?** Per-PR, one phase per commit.
   Same pattern that made Phase 2 reliable.

4. **Express / Fastify?** No. The router stays as a 30-line internal module.
   This is a reorg, not a framework change. Reassess only after the split
   lands.

5. **Bundle the boot block, or keep it inline in `server.js`?** Bundle —
   the 134-line boot block belongs in `boot/load-fixed.js` so `server.js`
   can stay at 7 lines. The boot block is mechanical (load JSON, register,
   validate, ensure tables) and reading it inline obscures the entry shape.

6. **Snapshot baseline refresh?** No refresh during the refactor. The
   refactor must be byte-identical end-to-end. If a Phase changes any hash,
   that is a bug to fix, not a baseline to update.

## What stays out of scope

- **No new endpoints.**
- **No new caching strategies.** `translationCache`, `translationManifestCache`,
  `baseKeySetCache`, and `orthocal_cache` all stay exactly as they are.
- **No middleware framework.** `(req, res)` handlers, hand-rolled router.
- **No async body parsing.** Existing routes don't read bodies; nothing to add.
- **No deletion of `applyYouYour`** even though it appears unused at the route
  level — verify usage first; it may be reachable through `mapDbBlocks` or a
  legacy code path. If genuinely dead, delete it in a follow-up PR.

## Final layout (expected, after Phase F)

```
server.js                              # 7-line facade
server-lib/
  index.js                             # public API ({ boot, router })
  router.js                            # 30-line dispatcher
  _shared/                             # 4 primitives
  overlays/                            # 8 files (~395 lines from server.js)
  sources/                             # 9 files (~1,700 lines from server.js)
  cache/                               # 2 files (~110 lines from server.js)
  assemble/                            # 3 files (~470 lines from server.js)
  render/                              # 4 files (~530 lines from server.js)
  boot/                                # 1 file (~135 lines from server.js)
  routes/                              # ~19 files (~1,876 lines from server.js)
```

server.js: 5,375 → 7 lines (**−99.9%**), distributed across ~35 focused
modules, each ≤ 400 lines.
