'use strict';

/**
 * Kathisma Lookup
 *
 * Returns kathisma numbers appointed for Vespers and Matins on a given day.
 * The 150 Psalms are divided into 20 kathismata, read through weekly.
 *
 * Exports:
 *   getVespersKathisma(dayOfWeek, season) → number | null
 *   getMatinsKathismata(dayOfWeek, season) → number[]
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

// ── Matins kathisma schedule ──────────────────────────────────────────────
// Source: Slavonic Typikon / OCA Reader's Service Book Psalter schedule.
//
// Ordinary time — the entire Psalter is read once per week.
// Sunday Matins: Kathismata 2 and 3.
// Weekdays: two kathismata each morning, rotating through the cycle.
// Saturday: Kathismata 16 and 17.
//
// Great Lent — the entire Psalter is read TWICE per week.
// Each day reads 3 kathismata at Matins (except Sunday which keeps 2).
// The cycle restarts on Monday and again on Thursday.

const MATINS_ORDINARY = {
  sunday:    [2, 3],
  monday:    [4, 5],
  tuesday:   [7, 8],
  wednesday: [10, 11],
  thursday:  [13, 14],
  friday:    [19, 20],
  saturday:  [16, 17],
};

const MATINS_LENT = {
  sunday:    [2, 3],       // Same as ordinary time
  monday:    [4, 5, 6],    // 3 kathismata per day during Lent
  tuesday:   [10, 11, 12],
  wednesday: [16, 17, 18],
  thursday:  [4, 5, 6],    // Second cycle starts Thursday
  friday:    [10, 11, 12],
  saturday:  [16, 17],     // Saturday keeps 2
};

/**
 * Returns the kathisma numbers appointed at Matins for a given day.
 *
 * @param {string} dayOfWeek  — 'sunday' … 'saturday'
 * @param {string} season     — 'ordinaryTime' | 'greatLent' | 'holyWeek' | etc.
 * @returns {number[]}  Array of kathisma numbers (1–20), or empty if omitted.
 */
function getMatinsKathismata(dayOfWeek, season) {
  if (season === 'holyWeek' || season === 'brightWeek') {
    return [];
  }

  if (season === 'greatLent') {
    return MATINS_LENT[dayOfWeek] ?? [];
  }

  // ordinaryTime, preLenten, pentecostarion
  return MATINS_ORDINARY[dayOfWeek] ?? [];
}

module.exports = { getVespersKathisma, getMatinsKathismata };
