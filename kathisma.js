'use strict';

/**
 * Kathisma Lookup
 *
 * Returns the kathisma number appointed for Vespers on a given day.
 * The 150 Psalms are divided into 20 kathismata, read through weekly.
 *
 * At Great Vespers (Saturday), Kathisma 1, Section 1 ("Blessed Is The Man")
 * is always sung — the assembler handles the actual rendering.
 *
 * At Daily Vespers (Mon–Fri), the appropriate kathisma number is returned
 * so the assembler can display the correct rubric. Full psalm texts are
 * not yet stored; a placeholder is rendered instead.
 *
 * Exports:
 *   getVespersKathisma(dayOfWeek, season) → number | null
 */

// Ordinary time — evening kathisma by day of week.
// Source: OCA Reader's Service Book / Psalter schedule.
// "Saturday" here = Great Vespers (Kathisma 1, Section 1).
const ORDINARY_TIME = {
  sunday:    1,
  monday:    4,
  tuesday:   6,
  wednesday: 9,
  thursday:  11,
  friday:    13,
  saturday:  1,
};

// Great Lent — daily vespers kathisma by day of week.
// Lent intensifies the Psalter reading; additional kathismata are added
// to Matins and the Hours, but Vespers follows a similar weekday pattern.
// TODO: verify against full Lenten Psalter schedule.
const GREAT_LENT = {
  sunday:    1,
  monday:    4,
  tuesday:   6,
  wednesday: 9,
  thursday:  11,
  friday:    13,
  saturday:  1,
};

/**
 * Returns the kathisma number appointed at Vespers for a given day.
 *
 * @param {string} dayOfWeek  — 'monday' … 'saturday'
 * @param {string} season     — 'ordinaryTime' | 'greatLent' | 'holyWeek' | etc.
 * @returns {number|null}  Kathisma number (1–20), or null if kathisma is omitted.
 */
function getVespersKathisma(dayOfWeek, season) {
  if (season === 'greatLent') {
    return GREAT_LENT[dayOfWeek] ?? null;
  }

  if (season === 'holyWeek') {
    // Kathisma is generally omitted during Holy Week Vespers.
    return null;
  }

  if (season === 'brightWeek') {
    // Kathisma is omitted throughout Bright Week.
    return null;
  }

  // ordinaryTime, preLenten, pentecostarion — use ordinary schedule
  return ORDINARY_TIME[dayOfWeek] ?? null;
}

module.exports = { getVespersKathisma };
