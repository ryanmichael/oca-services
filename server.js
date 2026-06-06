/**
 * OCA Service Browser
 *
 * A minimal HTTP server for browsing assembled Vespers services.
 * Uses calendar-rules.js + assembler.js + renderer.js to render
 * a full service (fixed + variable texts) for any date.
 *
 * For regular Saturdays in ordinary time, services are generated
 * automatically. For Lenten/special dates, hand-authored calendar
 * entries are used if available.
 *
 * Usage:
 *   node server.js          — starts on http://localhost:3000
 *   node server.js --port 8080
 */

'use strict';

const http = require('node:http');
const fs   = require('fs');
const path = require('path');

const { assembleVespers, assembleLiturgy, assemblePresanctified, assemblePaschalHours, assembleMidnightOffice, assemblePaschalMatins, assembleBridegroomMatins, assemblePassionGospels, assembleLamentations, assembleVesperalLiturgy, assembleRoyalHours, assembleMatins, resolveSource } = require('./assembler');
const { generateCalendarEntry, getLiturgicalSeason, getDayOfWeek, getLiturgicalKey,
        getLiturgyVariant, getTone, getTrisagionSubstitution, isLiturgyServed,
        isPresanctifiedDay, isBridegroomMatins, isPassionGospelsDay, isLamentationsDay, isVesperalLiturgyDay, isRoyalHoursDay, isBurialVespersDay,
        getWeekOfLent, calculatePascha, getGreatFeastKey, isSoulSaturday,
        getEothinon } = require('./calendar-rules');
const { renderService, renderVespers }             = require('./renderer');
const { getMatinsKathismata }                    = require('./kathisma');
const { deduplicateBySource }                    = require('./oca-psalter');

const { loadJSON }       = require('./server-lib/_shared/load-json');
const { escHtml, formatDate } = require('./server-lib/_shared/html');
const { parseQuery }     = require('./server-lib/_shared/parse-query');
const { serveStatic }    = require('./server-lib/_shared/serve-static');

// Translation overlay subsystem. Each overlay lives at
// fixed-texts/translations/<id>/ as a manifest.json plus sparse <service>-fixed.json
// files. Selection priority: ?translation= query > LITURGY_TRANSLATION env > none.
// See server-lib/overlays/ for the cascade, drift, diff, rubrics, and registry layers.
const {
  fixedTextRegistry, registerBaseFixed,
  getOverlayFixed, getLiturgyFixed,
  getOverlayRubrics,
  getTranslationManifests,
  validateAllTranslations,
  tagBlocksWithOverlay, diffOverlay,
  resolveTranslation,
} = require('./server-lib/overlays');

// Variable-source resolvers (calendar entries, menaion, propers, matins-spec,
// liturgy-from-orthocal, db-source) and cache primitives (oca.db, orthocal cache).
const {
  loadSources,
  getCalendarEntry, getNextDateStr,
  getMenaionRanked, getSticheraDay, getMenaionDay, getMenaionDayList,
  GENERAL_MENAION_FALLBACK, getGeneralMenaionTexts,
  GREAT_FEAST_VARIANTS, PENTECOSTARION_SUNDAY_OVERRIDES, LITURGICAL_DAY_LABELS,
  DAY_PATRONS,
  buildMatinsSpec, buildLiturgyFromOrthocal,
  buildDbSource, getDbBlocks, mapDbBlocks,
} = require('./server-lib/sources');
const { openDb, ensureOrthocalCacheTable, fetchOrthocalDay } = require('./server-lib/cache');

// Assembly dispatchers + per-block transformations (pronoun substitution,
// day-label resolution, per-date Vespers entry point).
const { assembleForDate, applyYouYour, getDayLabel } = require('./server-lib/assemble');

// HTML render layer + dashboard data builder.
const {
  HOME_CSS, renderHomePage, getCollectedDates,
  formatAssemblyWarning, renderErrorPage,
  renderServiceHTML,
  buildDashboardData, formatSticheraSource,
} = require('./server-lib/render');

// ─── Config ───────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT    = portIdx !== -1 ? parseInt(args[portIdx + 1], 10)
              : process.env.PORT ? parseInt(process.env.PORT, 10)
              : 3000;





// ─── Request handler ──────────────────────────────────────────────────────────

// Pre-load sources once at startup
// (DAY_PATRONS now lives in daily-propers.json, loaded at module top.)

let sources;
try {
  sources = loadSources();
  console.log('Sources loaded: octoechos, prokeimena, menaion, triodion');
} catch (err) {
  console.error('Failed to load sources:', err.message);
  process.exit(1);
}

let fixedTexts;
try {
  fixedTexts = loadJSON('fixed-texts/vespers-fixed.json');
  registerBaseFixed('vespers', fixedTexts);
  console.log('Fixed texts loaded.');
} catch (err) {
  console.error('Failed to load fixed texts:', err.message);
  process.exit(1);
}

let liturgyFixed;
try {
  liturgyFixed = loadJSON('fixed-texts/liturgy-fixed.json');
  registerBaseFixed('liturgy', liturgyFixed);
  console.log('Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load liturgy fixed texts:', err.message);
  process.exit(1);
}

let presanctifiedFixed;
try {
  presanctifiedFixed = loadJSON('fixed-texts/presanctified-fixed.json');
  registerBaseFixed('presanctified', presanctifiedFixed);
  console.log('Presanctified fixed texts loaded.');
} catch (err) {
  console.error('Failed to load presanctified fixed texts:', err.message);
  process.exit(1);
}

// Defer translation validation until AFTER all base fixed-text files have
// registered, so drift warnings have a base to check against.
validateAllTranslations();

let paschalHoursFixed;
try {
  paschalHoursFixed = loadJSON('fixed-texts/paschal-hours-fixed.json');
  console.log('Paschal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Hours fixed texts:', err.message);
  process.exit(1);
}

let midnightOfficeFixed;
try {
  midnightOfficeFixed = loadJSON('fixed-texts/midnight-office-fixed.json');
  console.log('Midnight Office fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Midnight Office fixed texts:', err.message);
  process.exit(1);
}

let paschalMatinsFixed;
try {
  paschalMatinsFixed = loadJSON('fixed-texts/paschal-matins-fixed.json');
  console.log('Paschal Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Matins fixed texts:', err.message);
  process.exit(1);
}

let passionGospelsFixed;
try {
  passionGospelsFixed = loadJSON('fixed-texts/passion-gospels-fixed.json');
  console.log('Passion Gospels fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Passion Gospels fixed texts:', err.message);
  process.exit(1);
}

let bridegroomMatinsFixed;
try {
  bridegroomMatinsFixed = loadJSON('fixed-texts/bridegroom-matins-fixed.json');
  console.log('Bridegroom Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Bridegroom Matins fixed texts:', err.message);
  process.exit(1);
}

let lamentationsFixed;
try {
  lamentationsFixed = loadJSON('fixed-texts/lamentations-fixed.json');
  console.log('Lamentations fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Lamentations fixed texts:', err.message);
  process.exit(1);
}

let vesperalLiturgyFixed;
try {
  vesperalLiturgyFixed = loadJSON('fixed-texts/vesperal-liturgy-fixed.json');
  console.log('Vesperal Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Vesperal Liturgy fixed texts:', err.message);
  process.exit(1);
}

let kneelingVespersFixed;
try {
  kneelingVespersFixed = loadJSON('fixed-texts/kneeling-vespers-fixed.json');
  registerBaseFixed('kneeling-vespers', kneelingVespersFixed);
  console.log('Kneeling Vespers fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Kneeling Vespers fixed texts:', err.message);
  process.exit(1);
}

let royalHoursFixed;
try {
  royalHoursFixed = loadJSON('fixed-texts/royal-hours-fixed.json');
  console.log('Royal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Royal Hours fixed texts:', err.message);
  process.exit(1);
}

let matinsFixed;
try {
  matinsFixed = loadJSON('fixed-texts/matins-fixed.json');
  console.log('Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Matins fixed texts:', err.message);
  process.exit(1);
}

ensureOrthocalCacheTable();

// ─── Routes ───────────────────────────────────────────────────────────────────
// All endpoint handlers live in server-lib/routes/<endpoint>.js. Each is
// `(req, res, ctx) => void` and reads what it needs out of ctx by destructure.
// The dispatcher in server-lib/routes/index.js wraps every route in a single
// try/catch that renders a 5xx HTML page.

const routes = require('./server-lib/routes');

const ctx = {
  // Boot-time state
  sources,
  fixedTexts, liturgyFixed, presanctifiedFixed,
  paschalHoursFixed, midnightOfficeFixed, paschalMatinsFixed,
  passionGospelsFixed, bridegroomMatinsFixed, lamentationsFixed,
  vesperalLiturgyFixed, kneelingVespersFixed, royalHoursFixed,
  matinsFixed,
  // Shared helpers
  parseQuery, escHtml, formatDate, serveStatic, loadJSON,
  renderService, renderVespers,
  getMatinsKathismata, deduplicateBySource,
  // Project-level subsystems
  ...require('./assembler'),
  ...require('./calendar-rules'),
  // server-lib bundles
  ...require('./server-lib/overlays'),
  ...require('./server-lib/sources'),
  ...require('./server-lib/cache'),
  ...require('./server-lib/assemble'),
  ...require('./server-lib/render'),
};

// ─── Start ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => routes.dispatch(req, res, ctx));
server.listen(PORT, () => {
  console.log(`OCA Service Browser running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
