/**
 * Liturgical season classifier.
 *
 * Pure function of (date) → broad season name. Anchors on Pascha for the
 * moveable-cycle seasons; falls back to 'ordinaryTime' otherwise.
 *
 * Extracted from calendar-rules.js as Track D Step 2.
 */

'use strict';

const { calculatePascha } = require('./computus');

const DAY_MS = 24 * 60 * 60 * 1000;

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

module.exports = { getLiturgicalSeason };
