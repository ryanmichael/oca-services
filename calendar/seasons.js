/**
 * Liturgical season classifier + day/week helpers + stable liturgical key.
 *
 * All pure functions of (date). Built on top of computus.
 *
 * Extracted from calendar-rules.js as Track D Step 2 + 5a.
 */

'use strict';

const { calculatePascha } = require('./computus');

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getDayOfWeek(date) {
  return DAYS[date.getUTCDay()];
}

/**
 * Returns the broad liturgical season for a given date.
 *
 * @returns {'ordinaryTime'|'preLenten'|'greatLent'|'holyWeek'|'brightWeek'|'pentecostarion'}
 */
function getLiturgicalSeason(date) {
  const year   = date.getUTCFullYear();
  const pascha = calculatePascha(year);

  const cleanMonday    = new Date(pascha.getTime() - 48 * DAY_MS);
  const palmSunday     = new Date(pascha.getTime() -  7 * DAY_MS);
  const triodiOnStart  = new Date(pascha.getTime() - 70 * DAY_MS); // Sunday of Publican & Pharisee
  const diff           = Math.floor((date - pascha) / DAY_MS);

  if (date >= pascha) {
    if (diff <= 6)  return 'brightWeek';
    if (diff <= 49) return 'pentecostarion';
    return 'ordinaryTime';
  }

  if (date >= palmSunday)   return 'holyWeek';
  if (date >= cleanMonday)  return 'greatLent';
  if (date >= triodiOnStart) return 'preLenten';
  return 'ordinaryTime';
}

/**
 * Returns Clean Monday (first day of Great Lent) for a given year.
 * = Pascha − 48 days.
 */
function getCleanMonday(year) {
  return new Date(calculatePascha(year).getTime() - 48 * DAY_MS);
}

/**
 * Returns which week of Great Lent a date falls in (1–6),
 * or null if the date is not during Great Lent.
 *
 * Week 1 begins on Clean Monday (Monday–Sunday).
 * Week 6 ends on Palm Sunday (the last day before Holy Week).
 *
 * Examples (Pascha 2026 = Apr 12, Clean Monday = Feb 23):
 *   Feb 23 (Mon) → week 1
 *   Mar  7 (Sat) → week 2
 *   Apr  4 (Sat, Lazarus) → week 6
 *   Apr  5 (Sun, Palm Sunday) → week 6
 */
function getWeekOfLent(date) {
  if (getLiturgicalSeason(date) !== 'greatLent') return null;
  const year        = date.getUTCFullYear();
  const cleanMonday = getCleanMonday(year);
  const daysSince   = Math.floor((date - cleanMonday) / DAY_MS);
  return Math.floor(daysSince / 7) + 1;
}

/**
 * Returns which Lenten Saturday number (1–6) a given date is, or 0.
 *
 *   1 = Saturday of the Great Canon / St. Theodore the Tyrant
 *   2 = Soul Saturday 2 (Memorial Saturday)
 *   3 = Soul Saturday 3 (Memorial Saturday)
 *   4 = Soul Saturday 4 (Memorial Saturday)
 *   5 = 5th Saturday of Lent
 *   6 = Lazarus Saturday (Saturday before Palm Sunday)
 */
function getLentenSaturdayNumber(date) {
  if (getDayOfWeek(date) !== 'saturday') return 0;
  if (getLiturgicalSeason(date) !== 'greatLent') return 0;

  const year        = date.getUTCFullYear();
  const cleanMonday = getCleanMonday(year);
  const daysSince   = Math.floor((date - cleanMonday) / DAY_MS);

  // First Lenten Saturday is always 5 days after Clean Monday (Mon+5 = Sat)
  const satNum = Math.floor((daysSince - 5) / 7) + 1;
  return (satNum >= 1 && satNum <= 6) ? satNum : 0;
}

/**
 * Returns true if the date is one of the three Memorial Saturdays of
 * Great Lent (Soul Saturdays 2, 3, and 4).
 */
function isSoulSaturday(date) {
  const n = getLentenSaturdayNumber(date);
  return n === 2 || n === 3 || n === 4;
}

/**
 * Returns a stable liturgical key for a date, independent of calendar year.
 * Used to key DB lookups so collected texts can be reused across years.
 *
 *   greatLent saturday 1     → 'lent.saturday.1'   (St. Theodore)
 *   greatLent saturday 2–4   → 'lent.soulSaturday.2' … 'lent.soulSaturday.4'
 *   greatLent saturday 5     → 'lent.saturday.5'
 *   greatLent saturday 6     → 'lent.lazarusSaturday'
 *   greatLent sunday 1–5     → 'lent.sunday.1' … 'lent.sunday.5'
 *   greatLent weekday        → 'lent.week.N.{dow}'
 *   holyWeek                 → 'holyWeek.{dow}'
 *
 * Returns null for dates without a stable liturgical key
 * (ordinary time, Pentecostarion, Bright Week, etc.).
 */
function getLiturgicalKey(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);

  if (season === 'greatLent') {
    const weekOfLent = getWeekOfLent(date);
    if (dow === 'saturday') {
      const satNum = getLentenSaturdayNumber(date);
      if (satNum === 6)               return 'lent.lazarusSaturday';
      if (satNum >= 2 && satNum <= 4) return `lent.soulSaturday.${satNum}`;
      return `lent.saturday.${satNum}`;
    }
    if (dow === 'sunday') return `lent.sunday.${weekOfLent}`;
    return `lent.week.${weekOfLent}.${dow}`;
  }

  if (season === 'preLenten') {
    const pascha = calculatePascha(date.getUTCFullYear());
    const diff   = Math.floor((date - pascha) / DAY_MS);
    if (diff === -70) return 'triodion.publicanPharisee';
    if (diff === -63) return 'triodion.prodigalSon';
    if (diff === -57) return 'triodion.meatfareSaturday';
    if (diff === -56) return 'triodion.meatfareSunday';
    if (diff === -49) return 'triodion.forgivenessSunday';
    // Other pre-Lenten days (ordinary Saturdays, weekdays) → no stable key
    return null;
  }

  if (season === 'holyWeek') {
    return `holyWeek.${dow}`;
  }

  if (season === 'brightWeek') {
    return `brightWeek.${dow}`;
  }

  if (season === 'pentecostarion') {
    const pascha = calculatePascha(date.getUTCFullYear());
    const diff   = Math.floor((date - pascha) / DAY_MS);
    if (diff === 39) return 'pentecostarion.ascension';
    if (diff === 49) return 'pentecostarion.pentecost';
    // week 2 = Thomas week, week 3 = Myrrhbearers, …, week 7 = Holy Fathers
    const week = Math.floor(diff / 7) + 1;
    return `pentecostarion.week.${week}.${dow}`;
  }

  return null;
}

module.exports = {
  DAYS,
  getDayOfWeek,
  getLiturgicalSeason,
  getCleanMonday,
  getWeekOfLent,
  getLentenSaturdayNumber,
  isSoulSaturday,
  getLiturgicalKey,
};
