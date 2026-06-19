/**
 * Calendar Rules
 *
 * Programmatically generates calendar entries for any date, driving the
 * service assembler without requiring a hand-authored JSON file per day.
 *
 * Supported:
 *   - Saturday Great Vespers in ordinary time (post-Pentecost)
 *   - Great Lent: all Saturdays (including Soul Saturdays), Sundays, weekdays
 *
 * Returns null for seasons not yet implemented (Holy Week, Bright Week,
 * Pentecostarion feasts, pre-Lenten period).
 *
 * Variable text slots that cannot yet be resolved (triodion data not
 * populated, or requiring the DB source from Step 2) use source:'db'
 * and will silently produce no output until the DB resolver is wired.
 *
 * Exports:
 *   calculatePascha(year)            → Date (UTC midnight)
 *   getAllSaints(year)               → Date (UTC midnight)
 *   getLiturgicalSeason(date)        → string
 *   getTone(date)                    → 1–8
 *   getDayOfWeek(date)              → string
 *   getWeekOfLent(date)             → 1–6 | null
 *   getLentenSaturdayNumber(date)   → 1–6 | 0
 *   isSoulSaturday(date)            → boolean
 *   generateCalendarEntry(dateStr)  → Object | null
 */

'use strict';

// Vespers-generator shared constants + helpers extracted to
// calendar/vespers-shared.js (Track D step 7). DAY_MS, nowIso, the
// VESPERS_SUNG_EVE table and the prokeimenon spec builders are
// imported here for use by the generator family below.
const {
  DAY_MS,
  nowIso,
  VESPERS_SUNG_EVE,
  SATURDAY_GREAT_VESPERS_PROKEIMENON,
  vespersDailyProkeimenon,
  buildLentenProkeimenon,
} = require('./calendar/vespers-shared');

// ─── Calendar style (New / Old) ───────────────────────────────────────────────
// Orthodox jurisdictions split between the Julian ("Old") and Revised Julian
// ("New") calendars. Both use the same Julian Pascha computus, so all
// Pascha-anchored math (Lent, Pentecostarion, Octoechos tones, Holy Week)
// is identical for both. The axis is only the FIXED-feast lookup:
// Nativity = Dec 25 New = Jan 7 Old (Gregorian civil dates).
//
// JULIAN_OFFSET_DAYS + fixedFeastDate + great-feast/vigil/polyeleos tables
// extracted to calendar/fixed-feasts.js (Track D step 4).
const {
  JULIAN_OFFSET_DAYS,
  fixedFeastDate,
  getGreatFeastKey,
  VIGIL_SAINTS,
  POLYELEOS_SAINTS,
  getFeastRank,
  isVigilServed,
} = require('./calendar/fixed-feasts');

// ─── Pascha calculation ───────────────────────────────────────────────────────

// calculatePascha + getAllSaints extracted to calendar/computus.js (Track D step 1)
const { calculatePascha, getAllSaints } = require('./calendar/computus');

// getTone + getEothinon extracted to calendar/cycle.js (Track D step 3)
const { getTone, getEothinon } = require('./calendar/cycle');

// Season/day helpers + stable liturgical key extracted to calendar/seasons.js
// (Track D step 2 + 5a).
const {
  DAYS,
  getDayOfWeek,
  getLiturgicalSeason,
  getCleanMonday,
  getWeekOfLent,
  getLentenSaturdayNumber,
  isSoulSaturday,
  getLiturgicalKey,
} = require('./calendar/seasons');

// ─── Calendar entry generators ────────────────────────────────────────────────

// Ordinary-time Vespers generators extracted to
// calendar/generators/ordinary-time.js (Track D step 8c). NOTE: pre-lent and
// pentecostarion generators mutate generateOrdinaryTimeSaturday's output.
const {
  generateOrdinaryTimeWeekday,
  generateOrdinaryTimeSaturday,
} = require('./calendar/generators/ordinary-time');

// Great-Feast + Vigil-Feast Vespers generators extracted to
// calendar/generators/great-feast.js (Track D step 8a).
const {
  generateGreatFeastVespers,
  generateVigilFeastVespers,
} = require('./calendar/generators/great-feast');

// Lent Vespers generator family extracted to calendar/generators/lent.js
// (Track D step 8e): Soul Saturday, Theodore Sat, Akathist Sat, Lazarus Sat,
// generic Lenten-Sat dispatcher, Lenten Sun, Lenten weekday.
const {
  generateSoulSaturday,
  generateLentenSaturday,
  generateTheodoreSaturday,
  generateAkathist_Saturday,
  generateLazarusSaturday,
  generateLentenSunday,
  generateLentenWeekday,
} = require('./calendar/generators/lent');

// Holy Week day generator extracted to calendar/generators/holy-week.js
// (Track D step 8f).
const { generateHolyWeekDay } = require('./calendar/generators/holy-week');

// Pre-Lenten Triodion Sunday + Meatfare Saturday Vespers generator extracted
// to calendar/generators/pre-lent.js (Track D step 8d).
const { generatePreLentenDay } = require('./calendar/generators/pre-lent');

// Bright Week day generator extracted to calendar/generators/bright-week.js
// (Track D step 8b).
const { generateBrightWeekDay } = require('./calendar/generators/bright-week');

// Pentecostarion day generator extracted to calendar/generators/pentecostarion.js
// (Track D step 8g). Mutates generateOrdinaryTimeSaturday's output for the
// Saturday branch — see Track-D risk register item #4.
const { generatePentecostarionDay } = require('./calendar/generators/pentecostarion');

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generates a calendar entry object for a given date, or returns null
 * if the date/season is not yet supported.
 *
 * @param {string} dateStr  "YYYY-MM-DD"
 * @returns {Object|null}
 */
function generateCalendarEntry(dateStr, style = 'new') {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date   = new Date(Date.UTC(year, month - 1, day));
  const dow    = getDayOfWeek(date);
  const season = getLiturgicalSeason(date);
  const tone   = getTone(date);
  const litKey = getLiturgicalKey(date);

  // ── Fixed-calendar Great Feasts override season logic ────────────────────
  // These feasts always get an All-Night Vigil regardless of what day they fall on.
  // Moveable feasts (Palm Sunday, Ascension, Pentecost) are handled by their
  // own season generators below.
  const feastKey = getGreatFeastKey(date, style);
  if (feastKey && !['palmSunday', 'ascension', 'pentecost', 'pascha'].includes(feastKey)) {
    return generateGreatFeastVespers(dateStr, dow, tone, feastKey, season);
  }

  // ── Vigil-rank saints override ordinary day logic ──────────────────────────
  // These feasts get an All-Night Vigil with Litya and Blessing of Bread.
  const feastRank = getFeastRank(date, style);
  if (feastRank === 'vigil') {
    return generateVigilFeastVespers(dateStr, dow, tone);
  }

  // ── Ordinary time ──────────────────────────────────────────────────────────
  if (season === 'ordinaryTime') {
    if (dow === 'saturday') return generateOrdinaryTimeSaturday(dateStr, tone, 'saturday');
    if (dow === 'sunday')   return generateOrdinaryTimeSaturday(dateStr, tone, 'sunday');
    return generateOrdinaryTimeWeekday(dateStr, dow, tone);
  }

  // ── Great Lent ─────────────────────────────────────────────────────────────
  if (season === 'greatLent') {
    const weekOfLent = getWeekOfLent(date);

    if (dow === 'saturday') {
      const satNum = getLentenSaturdayNumber(date);
      if (isSoulSaturday(date)) {
        return generateSoulSaturday(dateStr, satNum, tone, litKey);
      }
      return generateLentenSaturday(dateStr, satNum, weekOfLent, tone, litKey);
    }

    if (dow === 'sunday') {
      return generateLentenSunday(dateStr, weekOfLent, tone, litKey);
    }

    // Monday–Friday: Lenten Daily Vespers
    return generateLentenWeekday(dateStr, dow, weekOfLent, tone, litKey);
  }

  // ── Pre-Lenten (Triodion: Publican & Pharisee through Forgiveness Sunday) ─
  if (season === 'preLenten') {
    // Named Triodion days have liturgical keys and full DB texts
    if (litKey) return generatePreLentenDay(dateStr, dow, tone, litKey);

    // Ordinary Saturdays in the Triodion use the same Octoechos structure
    if (dow === 'saturday') {
      const entry = generateOrdinaryTimeSaturday(dateStr, tone);
      entry.liturgicalContext.season = 'preLenten';
      return entry;
    }

    // Weekdays: same structure as ordinary-time Daily Vespers
    const entry = generateOrdinaryTimeWeekday(dateStr, dow, tone);
    entry.liturgicalContext.season = 'preLenten';
    return entry;
  }

  // ── Holy Week ──────────────────────────────────────────────────────────────
  if (season === 'holyWeek') {
    return generateHolyWeekDay(dateStr, dow, litKey);
  }

  // ── Bright Week (Pascha through the following Saturday) ───────────────────
  if (season === 'brightWeek') {
    return generateBrightWeekDay(dateStr, dow, litKey);
  }

  // ── Pentecostarion (Thomas Sunday through eve of All Saints) ──────────────
  if (season === 'pentecostarion') {
    return generatePentecostarionDay(dateStr, dow, tone, litKey);
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return null;
}

// Liturgy-day predicates extracted to calendar/liturgy-day.js (Track D step 5)
const {
  getLiturgyVariant,
  getTrisagionSubstitution,
  isLiturgyServed,
  isPresanctifiedDay,
} = require('./calendar/liturgy-day');

// Holy Week special-service predicates extracted to
// calendar/holy-week-services.js (Track D step 6).
const {
  isBridegroomMatins,
  isPassionGospelsDay,
  isLamentationsDay,
  isVesperalLiturgyDay,
  isRoyalHoursDay,
  isBurialVespersDay,
} = require('./calendar/holy-week-services');

// ─── Exports ──────────────────────────────────────────────────────────────────

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
