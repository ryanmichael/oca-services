/**
 * Liturgy-day predicates: variant (basil/chrysostom), Trisagion substitution,
 * served/not-served, presanctified.
 *
 * Depends on computus + seasons + fixed-feasts.
 *
 * Extracted from calendar-rules.js as Track D Step 5.
 */

'use strict';

const { calculatePascha } = require('./computus');
const {
  getDayOfWeek,
  getLiturgicalSeason,
  getWeekOfLent,
  getLentenSaturdayNumber,
} = require('./seasons');
const { fixedFeastDate, getGreatFeastKey } = require('./fixed-feasts');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the liturgy variant ('basil' or 'chrysostom') for a given date.
 *
 * Basil occasions (OCA Typikon):
 *   - January 1 (Feast of St. Basil the Great)
 *   - Five Sundays of Great Lent (weeks 1–5; Palm Sunday = week 6 → Chrysostom)
 *   - Great Thursday and Great Saturday (Holy Week)
 *   - Eve of Nativity (Dec 24) and Eve of Theophany (Jan 5)
 *
 * Note: when the eves of Nativity or Theophany fall on Sunday or Monday,
 * the Liturgy of Basil transfers to the feast day itself. That edge case
 * is not yet handled here.
 */
function getLiturgyVariant(date, style = 'new') {
  const adj    = fixedFeastDate(date, style);
  const month  = adj.getUTCMonth() + 1;
  const day    = adj.getUTCDate();
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);

  if (month === 1  && day === 1)  return 'basil';   // St. Basil's Day
  if (month === 12 && day === 24) return 'basil';   // Eve of Nativity
  if (month === 1  && day === 5)  return 'basil';   // Eve of Theophany

  if (season === 'greatLent' && dow === 'sunday') {
    const week = getWeekOfLent(date);
    if (week >= 1 && week <= 5) return 'basil';
  }

  if (season === 'holyWeek' && (dow === 'thursday' || dow === 'saturday')) {
    return 'basil';
  }

  return 'chrysostom';
}

/**
 * Returns the Trisagion substitution type for a given date at the Divine Liturgy.
 *
 *   'cross'      → "Before Thy Cross, we bow down in worship…"
 *                   (Sunday of the Holy Cross; Elevation of the Cross, Sep 14)
 *   'baptismal'  → "As many as have been baptized into Christ, have put on Christ."
 *                   (Nativity Dec 25; Theophany Jan 6; Lazarus Saturday; Great Saturday)
 *   'typical'    → "Holy God, Holy Mighty, Holy Immortal, have mercy on us."
 */
function getTrisagionSubstitution(date, style = 'new') {
  const adj    = fixedFeastDate(date, style);
  const month  = adj.getUTCMonth() + 1;
  const day    = adj.getUTCDate();
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);

  // Sunday of the Holy Cross — 3rd Sunday of Great Lent
  if (season === 'greatLent' && dow === 'sunday' && getWeekOfLent(date) === 3) return 'cross';

  // Elevation of the Holy Cross — Sep 14
  if (month === 9 && day === 14) return 'cross';

  // Nativity of Christ — Dec 25
  if (month === 12 && day === 25) return 'baptismal';

  // Theophany — Jan 6
  if (month === 1 && day === 6) return 'baptismal';

  // Lazarus Saturday — 6th Lenten Saturday
  if (season === 'greatLent' && dow === 'saturday' && getLentenSaturdayNumber(date) === 6) {
    return 'baptismal';
  }

  // Great Saturday
  if (season === 'holyWeek' && dow === 'saturday') return 'baptismal';

  // Pascha + Bright Week — the entire Paschal Octave (Pascha through Bright Sat)
  if (season === 'brightWeek') return 'baptismal';

  // Pentecost — Pascha+49
  const pascha = calculatePascha(date.getUTCFullYear());
  if (Math.floor((date - pascha) / DAY_MS) === 49) return 'baptismal';

  return 'typical';
}

/**
 * Returns true for dates where the Divine Liturgy is typically served.
 *
 * Covers:
 *   - All Sundays
 *   - Bright Week (all days)
 *   - Great Lent: all Saturdays (Soul Saturdays, St. Theodore, Akathist, Lazarus)
 *   - Holy Week: Great Thursday and Great Saturday
 *   - Ascension Thursday (Pascha + 39 days)
 *   - The 12 Great Feasts on fixed calendar dates
 */
function isLiturgyServed(date, style = 'new') {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  const adj    = fixedFeastDate(date, style);
  const month  = adj.getUTCMonth() + 1;
  const day    = adj.getUTCDate();

  // Great Feasts always have liturgy, even during Lent (e.g. Annunciation Mar 25)
  const GREAT_FEASTS = new Set([
    '1-6',   '2-2',   '3-25',  '6-24',  '6-29',
    '8-6',   '8-15',  '9-8',   '9-14',  '11-21',  '12-25',
  ]);
  if (GREAT_FEASTS.has(`${month}-${day}`)) return true;

  // Great Lent weekdays: no full liturgy (Mon/Tue/Thu = nothing; Wed/Fri = Presanctified)
  if (season === 'greatLent' && dow !== 'saturday' && dow !== 'sunday') return false;

  // Cheesefare Week Wed/Fri (the week before Lent begins): aliturgical per
  // OCA Typikon — Liturgy is not served and Presanctified hasn't begun yet
  // (Presanctified starts Clean Wednesday). Cheesefare week is Pascha-55
  // (Mon) through Pascha-50 (Sat); Wed = P-53, Fri = P-51.
  if (season === 'preLenten' && (dow === 'wednesday' || dow === 'friday')) {
    const pascha = calculatePascha(date.getUTCFullYear());
    const dsp    = Math.floor((date - pascha) / 86400000);
    if (dsp === -53 || dsp === -51) return false;
  }

  // Holy Week: Mon-Wed = no full liturgy; Friday = no liturgy
  if (season === 'holyWeek') {
    if (['monday', 'tuesday', 'wednesday', 'friday'].includes(dow)) return false;
  }

  // Everything else: liturgy is served
  return true;
}

/**
 * Returns true if the Liturgy of the Presanctified Gifts is served on this date.
 *
 * Served on:
 *   - Wednesdays and Fridays of Great Lent (weeks 1–6)
 *   - Monday, Tuesday, Wednesday of Holy Week
 */
function isPresanctifiedDay(date, style = 'new') {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);

  // Great Feasts on Lenten weekdays serve the full Chrysostom Liturgy *instead
  // of* Presanctified (e.g. Annunciation Mar 25 falling Wed/Fri of Lent).
  if (getGreatFeastKey(date, style)) return false;

  if (season === 'greatLent' && (dow === 'wednesday' || dow === 'friday')) return true;
  if (season === 'holyWeek' && ['monday', 'tuesday', 'wednesday'].includes(dow)) return true;

  return false;
}

module.exports = {
  getLiturgyVariant,
  getTrisagionSubstitution,
  isLiturgyServed,
  isPresanctifiedDay,
};
