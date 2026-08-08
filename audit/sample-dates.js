'use strict';

const fs   = require('fs');
const path = require('path');
const cal  = require('../calendar-rules.js');

const MENAION_DIR = path.resolve(__dirname, '..', 'variable-sources', 'menaion');
const MONTH_NAMES = ['', 'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

/** True when the menaion file for (m, d) supplies its own Matins prokeimenon or
 *  Gospel — the saint's, which on a Sunday must NOT displace the resurrectional
 *  prokeimenon and eothinon Gospel. */
function menaionHasMatinsProper(m, d) {
  const f = path.join(MENAION_DIR, `${MONTH_NAMES[m]}-${String(d).padStart(2, '0')}.json`);
  if (!fs.existsSync(f)) return false;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return !!(j.matins && (j.matins.prokeimenon || j.matins.gospel));
  } catch (_) { return false; }
}

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

  // ── Tier 4: Sundays where a menaion file supplies its own Matins propers ──
  //
  // Derived from the data condition rather than a hardcoded list, so it
  // self-populates for any year. These are the dates where the saint's Matins
  // prokeimenon and Gospel can bleed into the Sunday slots the resurrectional
  // cycle owns.
  //
  // Added 2026-08-08: 2026-08-09 was NOT in the sample, so a live regression sat
  // on the very date being audited all week while every push reported high=0.
  // Worse, M3/M14 only fire when the saint's Gospel happens to coincide with
  // some eothinon passage, so 12 of the 13 affected Sundays were silent even
  // where they were sampled. Sampling the whole class closes both holes.
  {
    let c = utcDate(year, 1, 1);
    const end = utcDate(year, 12, 31);
    while (c <= end) {
      if (c.getUTCDay() === 0
          && menaionHasMatinsProper(c.getUTCMonth() + 1, c.getUTCDate())) {
        dates.add(toISO(c));
      }
      c = addDays(c, 1);
    }
  }

  return Array.from(dates).sort();
}

module.exports = { representativeDates };
