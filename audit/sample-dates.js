'use strict';

const cal = require('../calendar-rules.js');

const DAY_MS = 86400000;

function toISO(date)    { return date.toISOString().slice(0, 10); }
function addDays(d, n)  { const o = new Date(d); o.setUTCDate(o.getUTCDate() + n); return o; }
function utcDate(y,m,d) { return new Date(Date.UTC(y, m - 1, d)); }

// Each Great Feast: day-before, day, day-after. Catches boundary bugs at every
// fixed-calendar feast (Theophany, Annunciation, Transfiguration, etc.).
const FIXED_GREAT_FEASTS = [
  [1,  6],   // Theophany
  [2,  2],   // Meeting
  [3, 25],   // Annunciation
  [6, 24],   // Nativity of the Forerunner
  [6, 29],   // Sts. Peter & Paul
  [8,  6],   // Transfiguration
  [8, 15],   // Dormition
  [9,  8],   // Nativity of the Theotokos
  [9, 14],   // Elevation of the Cross
  [11, 21],  // Entry of the Theotokos
  [12, 25],  // Nativity of Christ
];

// Pascha-relative offsets — every transition where bugs love to hide.
const PASCHA_OFFSETS = [
  -49, -48,   // Forgiveness Sunday → Clean Monday (pre-Lent → Lent)
  -8,  -7, -6, // Lazarus Saturday → Palm Sunday → Holy Monday
  -1,   0,  1, // Holy Saturday → Pascha → Bright Monday
   6,   7,    // Bright Saturday → Thomas Sunday (brightWeek → pentecostarion)
  38,  39,    // Apodosis of Pascha → Ascension
  48,  49, 50, // Pentecost eve → Pentecost → Monday after (pentecostarion → ordinary)
];

// Vigil-rank saints whose service structure differs from ordinary days.
// Hand-listed because the source-of-truth VIGIL_SAINTS map in calendar-rules.js
// isn't exported and inlining it here lets the sampler stand alone.
const VIGIL_FIXED = [
  [1,  1],   // Circumcision / St. Basil
  [1, 30],   // Three Hierarchs
  [2, 24],   // First & Second Finding of John's Head
  [5, 21],   // Constantine & Helen
  [7, 20],   // Prophet Elijah
  [9,  1],   // Indiction
  [9, 26],   // Repose of St. John the Theologian
  [10, 1],   // Protection of the Theotokos
  [10, 26],  // St. Demetrius
  [11, 8],   // Synaxis of Archangel Michael
  [11, 13],  // St. John Chrysostom
  [12, 6],   // St. Nicholas
];

/**
 * Returns a representative set of dates for the given year, covering:
 *
 *   Tier 1 — every Pascha-relative boundary and every Great Feast ±1 day
 *   Tier 2 — one date per unique (season, dow, tone, weekOfLent?) tuple
 *   Tier 3 — every vigil-rank fixed feast
 *
 * Run the auditor against this set instead of all 365 days to get the same
 * code-path coverage in roughly a quarter of the time, with explicit
 * boundary testing baked in.
 */
function representativeDates(year) {
  const dates = new Set();

  // ── Tier 1a: Pascha boundaries ──
  const pascha = cal.calculatePascha(year);
  for (const offset of PASCHA_OFFSETS) {
    const d = addDays(pascha, offset);
    if (d.getUTCFullYear() === year) dates.add(toISO(d));
  }

  // ── Tier 1b: each fixed Great Feast ± 1 day ──
  for (const [m, d] of FIXED_GREAT_FEASTS) {
    for (const delta of [-1, 0, 1]) {
      const dt = utcDate(year, m, d + delta);
      if (dt.getUTCFullYear() === year) dates.add(toISO(dt));
    }
  }

  // ── Tier 2: coverage matrix ──
  // Walk the year once; the first date that hits each unique
  // (season, dow, tone, weekOfLent) tuple goes into the sample. weekOfLent
  // distinguishes the 5 Lenten Sundays (Orthodoxy / Gregory Palamas / Cross /
  // Climacus / Mary of Egypt) which would otherwise collapse into one entry.
  const seen = new Set();
  let cursor = utcDate(year, 1, 1);
  const yearEnd = utcDate(year, 12, 31);
  while (cursor <= yearEnd) {
    const season = cal.getLiturgicalSeason(cursor);
    const dow    = cal.getDayOfWeek(cursor);
    const tone   = cal.getTone(cursor);
    const wol    = cal.getWeekOfLent(cursor) || 0;
    const key    = `${season}|${dow}|${tone}|${wol}`;
    if (!seen.has(key)) {
      seen.add(key);
      dates.add(toISO(cursor));
    }
    cursor = addDays(cursor, 1);
  }

  // ── Tier 3: vigil-rank fixed feasts ──
  for (const [m, d] of VIGIL_FIXED) {
    dates.add(toISO(utcDate(year, m, d)));
  }

  return Array.from(dates).sort();
}

module.exports = { representativeDates };
