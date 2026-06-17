'use strict';

const cal = require('../calendar-rules.js');
const { SEASONS } = require('../constants/seasons');

const DAY_MS = 86400000;

function dateFromStr(s) {
  return new Date(s + 'T12:00:00Z');
}

function nextDateStr(s) {
  const d = dateFromStr(s);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Services served in the evening for the *next* liturgical day's office —
// dow / season / tone come from the shifted date so rule ctx aligns with
// what the API actually serves. Burial Vespers (Holy Friday afternoon) is
// the documented exception; it serves the current day's content.
const NEXT_DAY_SHIFTED = new Set([
  'vespers',
  'bridegroom-matins',  // Sun/Mon/Tue/Wed eve → Mon/Tue/Wed/Thu liturgically
  'lamentations',       // Fri eve → Sat morning matins of Great Saturday
  'passion-gospels',    // Thu eve → Holy Friday matins
]);

function buildContext(civilDate, service) {
  const isShifted = NEXT_DAY_SHIFTED.has(service);
  const entryDate = isShifted ? nextDateStr(civilDate) : civilDate;

  const civilD = dateFromStr(civilDate);
  const d      = dateFromStr(entryDate);

  const season = cal.getLiturgicalSeason(d);
  const dow    = cal.getDayOfWeek(d);
  const tone   = cal.getTone(d);
  const pascha = cal.calculatePascha(d.getUTCFullYear());
  const daysSincePascha = Math.floor((d - pascha) / DAY_MS);

  let calendarEntry = null;
  try { calendarEntry = cal.generateCalendarEntry(entryDate); }
  catch (e) { calendarEntry = { _error: e.message }; }

  return {
    service,
    civilDate, civilDow: cal.getDayOfWeek(civilD),
    date: civilDate, dateForEntry: entryDate, d,
    season, dow, tone, daysSincePascha,
    calendarEntry,
    isBrightWeek:           season === SEASONS.BRIGHT_WEEK,
    isPentecostarion:       season === SEASONS.PENTECOSTARION,
    isPaschalGreetingWindow: daysSincePascha >= 0 && daysSincePascha <= 38,
  };
}

module.exports = { buildContext, nextDateStr };
