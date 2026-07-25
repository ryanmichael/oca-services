/**
 * Fixed-cycle (Menaion) feast tables + Old-Style date threading.
 *
 * Pure lookups + rank classification. Depends on computus only because
 * the moveable Great Feasts (Pascha, Palm Sunday, Ascension, Pentecost)
 * are detected via Pascha-relative offsets inside getGreatFeastKey.
 *
 * Extracted from calendar-rules.js as Track D Step 4.
 */

'use strict';

const { calculatePascha } = require('./computus');

const DAY_MS = 24 * 60 * 60 * 1000;

// Helpers that look up fixed feasts accept an optional `style = 'new' | 'old'`
// argument (default 'new'). When 'old', the lookup uses the input date shifted
// 13 days earlier. The offset becomes 14 days from 2100-03-01 onward — same
// century-leap-year cliff that already constrains calculatePascha to 1900–2099.
// Revisit at the next code-review before 2100.
//
// See docs/old-style-calendar.md for the full design.
const JULIAN_OFFSET_DAYS = 13;

/**
 * For Old-Style ('old') consumers, returns `civilDate` shifted 13 days earlier
 * so that re-reading getUTCMonth/getUTCDate yields the Julian (M, D) tuple
 * that the menaion / Vigil-saints / Great-Feast lookups expect. For 'new',
 * returns `civilDate` unchanged. Year wraps (Jan 7 → Dec 25 of prior year)
 * fall out naturally from millisecond arithmetic.
 */
function fixedFeastDate(civilDate, style = 'new') {
  if (style !== 'old') return civilDate;
  return new Date(civilDate.getTime() - JULIAN_OFFSET_DAYS * DAY_MS);
}

/**
 * Returns the great-feast key for a given date, or null if none.
 *
 * Lord's feasts (typical antiphons):
 *   nativity, theophany, meeting, transfiguration, elevation,
 *   palmSunday, ascension, pentecost
 *
 * Feasts of the Theotokos (typical antiphons, but unique megalynarion):
 *   nativityTheotokos, entryTheotokos, annunciation, dormition
 *
 * Not classified as Great Feasts for antiphon purposes:
 *   6/24 (Nativity of Forerunner), 6/29 (Sts. Peter & Paul) — these are
 *   "great feasts" in the broad sense but use typical antiphons.
 */
function getGreatFeastKey(date, style = 'new') {
  const adj   = fixedFeastDate(date, style);
  const month = adj.getUTCMonth() + 1;
  const day   = adj.getUTCDate();

  // Fixed-calendar feasts
  const FIXED = {
    '1-1':   'circumcision',
    '12-25': 'nativity',
    '1-6':   'theophany',
    '2-2':   'meeting',
    '3-25':  'annunciation',
    '8-6':   'transfiguration',
    '8-15':  'dormition',
    '9-8':   'nativityTheotokos',
    '9-14':  'elevation',
    '11-21': 'entryTheotokos',
  };
  const fixedKey = FIXED[`${month}-${day}`];
  if (fixedKey) return fixedKey;

  // Moveable feasts. Use Math.floor — pascha is midnight UTC while ctx dates
  // can be any time of day; Math.round(-0.5) === -0 === 0, which falsely
  // identifies the day BEFORE Pascha as Pascha. Math.floor matches the
  // convention used throughout this file.
  const pascha = calculatePascha(date.getUTCFullYear());
  const diff = Math.floor((date - pascha) / DAY_MS);

  if (diff === 0)  return 'pascha';
  if (diff === -7) return 'palmSunday';
  if (diff === 39) return 'ascension';
  if (diff === 49) return 'pentecost';

  return null;
}

// ─── Feast Rank Classification ───────────────────────────────────────────────

/**
 * Fixed-calendar saints/feasts that always receive an All-Night Vigil.
 * Key: "M-D" (month-day), Value: descriptive label (for debugging).
 *
 * This is the OCA's list of Vigil-rank feasts beyond the 12 Great Feasts.
 * Great Feasts are detected by getGreatFeastKey() and ranked separately.
 */
const VIGIL_SAINTS = new Map([
  ['1-1',   'Circumcision of the Lord / St. Basil the Great'],
  ['1-30',  'Three Holy Hierarchs'],
  ['5-21',  'Sts. Constantine and Helen'],
  ['6-24',  'Nativity of St. John the Forerunner'],
  ['6-29',  'Sts. Peter and Paul'],
  ['7-15',  'St. Vladimir, Equal-to-the-Apostles'],
  ['8-29',  'Beheading of St. John the Forerunner'],
  ['9-25',  'St. Sergius of Radonezh'],
  ['10-1',  'Protection (Pokrov) of the Theotokos'],
  ['10-9',  'St. Tikhon, Patriarch of Moscow'],
  ['11-8',  'Synaxis of the Archangel Michael'],
  ['12-6',  'St. Nicholas the Wonderworker'],
]);

/**
 * Fixed-calendar saints/feasts of Polyeleos rank — Polyeleos + Magnification +
 * Gospel at Matins, secondary prokeimenon/alleluia/koinonikon at Liturgy.
 * Key: "M-D", Value: descriptive label.
 *
 * Initial coverage targets the audit cases (Jul 5 Uncovering of Sergius relics)
 * plus widely-celebrated polyeleos commemorations. Grows over time — there is
 * no rank column in our menaion DB to drive this from, so additions live here.
 */
const POLYELEOS_SAINTS = new Map([
  ['5-8',   'Apostle and Evangelist John the Theologian'],
  ['5-11',  'Sts. Cyril and Methodius, Equals-to-the-Apostles'],
  ['7-5',   'Uncovering of the Relics of St. Sergius of Radonezh'],
  ['7-11',  'St. Olga, Equal-to-the-Apostles'],
  ['7-20',  'Holy Glorious Prophet Elijah'],
  ['7-22',  'St. Mary Magdalene, Equal-to-the-Apostles'],
  ['7-26',  'Repose of St. Jacob Netsvetov, Enlightener of the Peoples of Alaska'],
  ['11-13', 'St. John Chrysostom'],
  ['11-14', 'Apostle Philip'],
  ['11-16', 'Apostle and Evangelist Matthew'],
  ['11-30', 'Apostle Andrew the First-Called'],
  ['12-12', 'St. Spyridon the Wonderworker'],
]);

/**
 * Returns the feast rank for a given date.
 *
 * Ranks (highest to lowest):
 *   'greatFeast'   — 12 Great Feasts, Pascha, and moveable feasts
 *   'vigil'        — Saints with All-Night Vigil (VIGIL_SAINTS)
 *   'polyeleos'    — Polyeleos-rank saints (future: from DB)
 *   'doxology'     — Great Doxology saints (future: from DB)
 *   'sixStichera'  — Ordinary commemorations (default)
 *
 * @param {Date} date — UTC date
 * @returns {string}
 */
function getFeastRank(date, style = 'new') {
  if (getGreatFeastKey(date, style) !== null) return 'greatFeast';

  const adj   = fixedFeastDate(date, style);
  const month = adj.getUTCMonth() + 1;
  const day   = adj.getUTCDate();
  const md    = `${month}-${day}`;
  if (VIGIL_SAINTS.has(md))     return 'vigil';
  if (POLYELEOS_SAINTS.has(md)) return 'polyeleos';

  // Doxology rank not yet detected — would need a curated map or DB column
  return 'sixStichera';
}

/**
 * Returns true if an All-Night Vigil should be served on this date.
 * Does NOT include ordinary Sundays (Saturday Great Vespers uses the
 * existing greatVespers serviceType for those).
 *
 * @param {Date} date — UTC date
 * @returns {boolean}
 */
function isVigilServed(date) {
  const rank = getFeastRank(date);
  return rank === 'greatFeast' || rank === 'vigil';
}

module.exports = {
  JULIAN_OFFSET_DAYS,
  fixedFeastDate,
  getGreatFeastKey,
  VIGIL_SAINTS,
  POLYELEOS_SAINTS,
  getFeastRank,
  isVigilServed,
};
