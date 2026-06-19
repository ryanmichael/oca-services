/**
 * Calendar Rules — facade.
 *
 * Track D (2026-06-19) split this file (originally 2,376 lines) into focused
 * axis modules under `calendar/`. This file now re-exports the same public
 * surface so all existing callers (server-lib, assemblers, audit rules) keep
 * working unchanged. New code should import from the topic modules directly.
 *
 * Public surface — 27 keys, frozen by
 * `test/contracts/calendar-rules-exports.test.js`:
 *
 *   computus.js              → calculatePascha, getAllSaints
 *   seasons.js               → DAYS [internal], getDayOfWeek,
 *                              getLiturgicalSeason, getCleanMonday [internal],
 *                              getWeekOfLent, getLentenSaturdayNumber,
 *                              isSoulSaturday, getLiturgicalKey
 *   cycle.js                 → getTone, getEothinon
 *   fixed-feasts.js          → JULIAN_OFFSET_DAYS, fixedFeastDate,
 *                              getGreatFeastKey, getFeastRank, isVigilServed,
 *                              VIGIL_SAINTS [internal], POLYELEOS_SAINTS [internal]
 *   liturgy-day.js           → getLiturgyVariant, getTrisagionSubstitution,
 *                              isLiturgyServed, isPresanctifiedDay
 *   holy-week-services.js    → isBridegroomMatins, isPassionGospelsDay,
 *                              isLamentationsDay, isVesperalLiturgyDay,
 *                              isRoyalHoursDay, isBurialVespersDay
 *   vespers-shared.js        → VESPERS_SUNG_EVE (+ DAY_MS, nowIso, prokeimena
 *                              helpers, all internal-only)
 *   generators/*.js          → not exposed on facade — only generateCalendarEntry
 *                              touches them
 *   entry.js                 → generateCalendarEntry
 */

'use strict';

const { calculatePascha, getAllSaints } = require('./calendar/computus');
const {
  getDayOfWeek,
  getLiturgicalSeason,
  getWeekOfLent,
  getLentenSaturdayNumber,
  isSoulSaturday,
  getLiturgicalKey,
} = require('./calendar/seasons');
const { getTone, getEothinon } = require('./calendar/cycle');
const {
  JULIAN_OFFSET_DAYS,
  fixedFeastDate,
  getGreatFeastKey,
  getFeastRank,
  isVigilServed,
} = require('./calendar/fixed-feasts');
const {
  getLiturgyVariant,
  getTrisagionSubstitution,
  isLiturgyServed,
  isPresanctifiedDay,
} = require('./calendar/liturgy-day');
const {
  isBridegroomMatins,
  isPassionGospelsDay,
  isLamentationsDay,
  isVesperalLiturgyDay,
  isRoyalHoursDay,
  isBurialVespersDay,
} = require('./calendar/holy-week-services');
const { VESPERS_SUNG_EVE } = require('./calendar/vespers-shared');
const { generateCalendarEntry } = require('./calendar/entry');

module.exports = {
  JULIAN_OFFSET_DAYS,
  fixedFeastDate,
  calculatePascha,
  getAllSaints,
  getLiturgicalSeason,
  getTone,
  getDayOfWeek,
  getWeekOfLent,
  getLentenSaturdayNumber,
  isSoulSaturday,
  getLiturgicalKey,
  getLiturgyVariant,
  getTrisagionSubstitution,
  isLiturgyServed,
  getGreatFeastKey,
  getFeastRank,
  isVigilServed,
  isPresanctifiedDay,
  isBridegroomMatins,
  isPassionGospelsDay,
  isLamentationsDay,
  isVesperalLiturgyDay,
  isRoyalHoursDay,
  isBurialVespersDay,
  getEothinon,
  generateCalendarEntry,
  VESPERS_SUNG_EVE,
};
