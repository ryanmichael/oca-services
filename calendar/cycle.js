/**
 * Octoechos tone cycle + Eothinon Gospel cycle.
 *
 * Both anchor on All Saints Sunday (Pascha + 56) and rotate weekly:
 *   - Octoechos: 8-week cycle of tones 1..8 (with Pentecostarion overrides)
 *   - Eothinon: 11-week cycle of resurrectional matins gospels
 *
 * Extracted from calendar-rules.js as Track D Step 3.
 */

'use strict';

const { calculatePascha, getAllSaints } = require('./computus');
const { getLiturgicalSeason } = require('./seasons');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the Octoechos tone (1–8) active for a given date.
 *
 * The cycle anchors to All Saints Sunday each year (Tone 1).
 * The tone for a Saturday belongs to the week that is ending —
 * i.e., the Sunday that started that week sets the tone.
 */
function getTone(date) {
  // Pentecostarion override: weekdays follow the tone of the immediately
  // preceding Pentecostarion Sunday (Thomas=1, Myrrhbearers=2, Paralytic=3,
  // Samaritan=4, Blind Man=5, Holy Fathers=6). Bright Week and Pentecost
  // week have no Octoechos tone proper; return 0 so callers can branch.
  const year   = date.getUTCFullYear();
  const pascha = calculatePascha(year);
  const diff   = Math.floor((date - pascha) / DAY_MS);
  if (diff >= 0 && diff <= 49) {
    if (diff <= 6) return 0;                 // Bright Week — no tone
    const weekIdx = Math.floor((diff - 7) / 7); // 0..5 for weeks 2..7
    if (weekIdx <= 5) return weekIdx + 1;    // weeks 2..7 → tones 1..6
    return 0;                                // Pentecost itself — no tone
  }

  // Tone 1 begins the Sunday AFTER All Saints, not All Saints itself
  let anchor = new Date(getAllSaints(year).getTime() + 7 * DAY_MS);
  if (date < anchor) anchor = new Date(getAllSaints(year - 1).getTime() + 7 * DAY_MS);

  const weeksSince = Math.floor((date - anchor) / (7 * DAY_MS));
  return (weeksSince % 8) + 1;
}

/**
 * Get the Eothinon number (1-11) for a given Sunday.
 * The 11-week Eothinon cycle starts at Eothinon 1 on All Saints Sunday
 * (first Sunday after Pentecost = Pascha + 56 days).
 *
 * Returns null during Triodion/Pentecostarion when the eothinon cycle
 * is suspended or follows special rules.
 */
function getEothinon(date) {
  // Suspended throughout the Triodion (Pre-Lent → Holy Week) and the
  // Pentecostarion (Pascha → Pentecost). The cycle restarts at All Saints
  // Sunday (Pascha + 56) with eothinon 1.
  const season = getLiturgicalSeason(date);
  if (season !== 'ordinaryTime') return null;

  const yr = date.getUTCFullYear();
  const allSaints = getAllSaints(yr);

  const diffMs = date.getTime() - allSaints.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 86400000));

  if (diffWeeks >= 0) {
    return (diffWeeks % 11) + 1;
  }

  // Before this year's All Saints — use previous year's cycle
  const prevAllSaints = getAllSaints(yr - 1);
  const prevDiff = Math.floor((date.getTime() - prevAllSaints.getTime()) / (7 * 86400000));
  if (prevDiff >= 0) {
    return (prevDiff % 11) + 1;
  }

  return null;
}

module.exports = { getTone, getEothinon };
