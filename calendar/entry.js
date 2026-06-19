/**
 * Top-level calendar entry fan-out.
 *
 * Single entry point that switches on (date, style) and dispatches to the
 * appropriate season/feast generator. This is the only module that knows
 * about *all* generators; each generator module is independent.
 *
 * Extracted from calendar-rules.js as Track D Step 9 (final step).
 */

'use strict';

const {
  getDayOfWeek,
  getLiturgicalSeason,
  getWeekOfLent,
  getLentenSaturdayNumber,
  isSoulSaturday,
  getLiturgicalKey,
} = require('./seasons');
const { getTone } = require('./cycle');
const { getGreatFeastKey, getFeastRank } = require('./fixed-feasts');

const {
  generateOrdinaryTimeWeekday,
  generateOrdinaryTimeSaturday,
} = require('./generators/ordinary-time');
const {
  generateGreatFeastVespers,
  generateVigilFeastVespers,
} = require('./generators/great-feast');
const {
  generateSoulSaturday,
  generateLentenSaturday,
  generateLentenSunday,
  generateLentenWeekday,
} = require('./generators/lent');
const { generateHolyWeekDay } = require('./generators/holy-week');
const { generatePreLentenDay } = require('./generators/pre-lent');
const { generateBrightWeekDay } = require('./generators/bright-week');
const { generatePentecostarionDay } = require('./generators/pentecostarion');

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

module.exports = { generateCalendarEntry };
