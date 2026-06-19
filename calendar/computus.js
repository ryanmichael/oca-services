/**
 * Computus — Orthodox Pascha calculation and Pascha-relative anchors.
 *
 * Pure leaf: no dependencies on any other calendar module. Other modules
 * (cycle, seasons, generators) build on top of these primitives.
 *
 * Extracted from calendar-rules.js as Track D Step 1.
 */

'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calculates Orthodox Pascha (Easter) for a given year.
 * Uses the Meeus Julian algorithm, then adds 13 days for Gregorian conversion
 * (valid for 1900–2099).
 *
 * Verified: 2024 → May 5, 2025 → April 20, 2026 → April 12
 */
function calculatePascha(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b + 6 * d + 6) % 7;
  const f = d + e;

  let month, day;
  if (f < 10) {
    month = 3; day = 22 + f;
  } else {
    month = 4; day = f - 9;
  }

  return new Date(Date.UTC(year, month - 1, day + 13));
}

/**
 * Returns the date of All Saints Sunday = Pascha + 56 days.
 * Tone 1 of the Octoechos cycle begins on this day.
 */
function getAllSaints(year) {
  return new Date(calculatePascha(year).getTime() + 56 * DAY_MS);
}

module.exports = { calculatePascha, getAllSaints };
