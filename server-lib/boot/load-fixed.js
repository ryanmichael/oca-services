'use strict';

// Boot block. Loads sources + the 11 base fixed-text JSON files, registers
// them in the overlay registry, validates all translation overlays, ensures
// the orthocal cache table exists, and returns a ctx object the routes
// dispatcher can read from.
//
// Any load failure exits the process with code 1: a missing/corrupt fixed-text
// file means the assembler can't render that service at all, and silently
// continuing would surface as opaque runtime errors per request.

const { loadJSON }     = require('../_shared/load-json');
const { escHtml, formatDate } = require('../_shared/html');
const { parseQuery }   = require('../_shared/parse-query');
const { serveStatic }  = require('../_shared/serve-static');

const { renderService, renderVespers }   = require('../../renderer');
const { getMatinsKathismata }            = require('../../kathisma');
const { deduplicateBySource }            = require('../../oca-psalter');

const overlays = require('../overlays');
const sourcesLib = require('../sources');
const cache = require('../cache');
const assemble = require('../assemble');
const render = require('../render');

function loadOrExit(label, loader) {
  try {
    return loader();
  } catch (err) {
    console.error(`Failed to load ${label}:`, err.message);
    process.exit(1);
  }
}

function boot() {
  const { registerBaseFixed, validateAllTranslations } = overlays;
  const { loadSources } = sourcesLib;
  const { ensureOrthocalCacheTable } = cache;

  const sources = loadOrExit('sources', () => {
    const s = loadSources();
    console.log('Sources loaded: octoechos, prokeimena, menaion, triodion');
    return s;
  });

  const fixedTexts = loadOrExit('fixed texts', () => {
    const t = loadJSON('fixed-texts/vespers-fixed.json');
    registerBaseFixed('vespers', t);
    console.log('Fixed texts loaded.');
    return t;
  });

  const liturgyFixed = loadOrExit('liturgy fixed texts', () => {
    const t = loadJSON('fixed-texts/liturgy-fixed.json');
    registerBaseFixed('liturgy', t);
    console.log('Liturgy fixed texts loaded.');
    return t;
  });

  const presanctifiedFixed = loadOrExit('presanctified fixed texts', () => {
    const t = loadJSON('fixed-texts/presanctified-fixed.json');
    registerBaseFixed('presanctified', t);
    console.log('Presanctified fixed texts loaded.');
    return t;
  });

  // Defer translation validation until AFTER all base fixed-text files have
  // registered, so drift warnings have a base to check against.
  validateAllTranslations();

  const paschalHoursFixed = loadOrExit('Paschal Hours fixed texts', () => {
    const t = loadJSON('fixed-texts/paschal-hours-fixed.json');
    console.log('Paschal Hours fixed texts loaded.');
    return t;
  });

  const midnightOfficeFixed = loadOrExit('Midnight Office fixed texts', () => {
    const t = loadJSON('fixed-texts/midnight-office-fixed.json');
    console.log('Midnight Office fixed texts loaded.');
    return t;
  });

  const paschalMatinsFixed = loadOrExit('Paschal Matins fixed texts', () => {
    const t = loadJSON('fixed-texts/paschal-matins-fixed.json');
    console.log('Paschal Matins fixed texts loaded.');
    return t;
  });

  const passionGospelsFixed = loadOrExit('Passion Gospels fixed texts', () => {
    const t = loadJSON('fixed-texts/passion-gospels-fixed.json');
    console.log('Passion Gospels fixed texts loaded.');
    return t;
  });

  const bridegroomMatinsFixed = loadOrExit('Bridegroom Matins fixed texts', () => {
    const t = loadJSON('fixed-texts/bridegroom-matins-fixed.json');
    console.log('Bridegroom Matins fixed texts loaded.');
    return t;
  });

  const lamentationsFixed = loadOrExit('Lamentations fixed texts', () => {
    const t = loadJSON('fixed-texts/lamentations-fixed.json');
    console.log('Lamentations fixed texts loaded.');
    return t;
  });

  const vesperalLiturgyFixed = loadOrExit('Vesperal Liturgy fixed texts', () => {
    const t = loadJSON('fixed-texts/vesperal-liturgy-fixed.json');
    console.log('Vesperal Liturgy fixed texts loaded.');
    return t;
  });

  const kneelingVespersFixed = loadOrExit('Kneeling Vespers fixed texts', () => {
    const t = loadJSON('fixed-texts/kneeling-vespers-fixed.json');
    registerBaseFixed('kneeling-vespers', t);
    console.log('Kneeling Vespers fixed texts loaded.');
    return t;
  });

  const royalHoursFixed = loadOrExit('Royal Hours fixed texts', () => {
    const t = loadJSON('fixed-texts/royal-hours-fixed.json');
    console.log('Royal Hours fixed texts loaded.');
    return t;
  });

  const matinsFixed = loadOrExit('Matins fixed texts', () => {
    const t = loadJSON('fixed-texts/matins-fixed.json');
    console.log('Matins fixed texts loaded.');
    return t;
  });

  const typikaFixed = loadOrExit('Typika fixed texts', () => {
    const t = loadJSON('fixed-texts/typika-fixed.json');
    console.log('Typika fixed texts loaded.');
    return t;
  });

  ensureOrthocalCacheTable();

  return {
    // Boot-time state
    sources,
    fixedTexts, liturgyFixed, presanctifiedFixed,
    paschalHoursFixed, midnightOfficeFixed, paschalMatinsFixed,
    passionGospelsFixed, bridegroomMatinsFixed, lamentationsFixed,
    vesperalLiturgyFixed, kneelingVespersFixed, royalHoursFixed,
    matinsFixed, typikaFixed,
    // Shared helpers
    parseQuery, escHtml, formatDate, serveStatic, loadJSON,
    renderService, renderVespers,
    getMatinsKathismata, deduplicateBySource,
    // Project-level subsystems
    ...require('../../assembler'),
    ...require('../../calendar-rules'),
    // server-lib bundles
    ...overlays,
    ...sourcesLib,
    ...cache,
    ...assemble,
    ...render,
  };
}

module.exports = { boot };
