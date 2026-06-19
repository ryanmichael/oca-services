/**
 * Holy Week special-service predicates.
 *
 * Each predicate is a thin wrapper over (season === 'holyWeek' && dow === X).
 * Kept as named functions because callers branch on them by name.
 *
 * Extracted from calendar-rules.js as Track D Step 6.
 */

'use strict';

const { getDayOfWeek, getLiturgicalSeason } = require('./seasons');

/**
 * Returns true if Bridegroom Matins is served on this date.
 * Served on the EVENING of Sun/Mon/Tue/Wed of Holy Week.
 * API date = civil evening (the date the person attends).
 * Content is from the NEXT liturgical day (Mon/Tue/Wed/Thu).
 */
function isBridegroomMatins(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && ['sunday', 'monday', 'tuesday', 'wednesday'].includes(dow);
}

/**
 * Returns true if the Service of the Twelve Passion Gospels is served on this date.
 * Served on the evening of Great Thursday (Matins of Great Friday).
 */
function isPassionGospelsDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && dow === 'thursday';
}

/**
 * Returns true if the Lamentations service is served on this date.
 * Served on the evening of Great Friday (Matins of Great Saturday).
 */
function isLamentationsDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && dow === 'friday';
}

/**
 * Returns true if the Vesperal Liturgy of St. Basil is served on this date.
 * Served on Great Saturday morning.
 */
function isVesperalLiturgyDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && dow === 'saturday';
}

/**
 * Returns true if the Royal Hours are served on this date.
 * Served on the morning of Great Friday.
 */
function isRoyalHoursDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && dow === 'friday';
}

/**
 * Returns true if Burial Vespers is served on this date.
 * Served on Great Friday afternoon (not Thursday evening).
 */
function isBurialVespersDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && dow === 'friday';
}

module.exports = {
  isBridegroomMatins,
  isPassionGospelsDay,
  isLamentationsDay,
  isVesperalLiturgyDay,
  isRoyalHoursDay,
  isBurialVespersDay,
};
