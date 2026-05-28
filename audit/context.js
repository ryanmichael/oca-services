'use strict';

const cal = require('../calendar-rules.js');

const DAY_MS = 86400000;

function dateFromStr(s) {
  return new Date(s + 'T12:00:00Z');
}

function nextDateStr(s) {
  const d = dateFromStr(s);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Per-cell context. `service` indicates which spec to audit; for vespers we
// apply the date-shift so that calendar entry / dow / tone reflect the
// liturgical day, matching what the API would serve.
function buildContext(civilDate, service) {
  const isVespersShift = service === 'vespers';
  const entryDate = isVespersShift ? nextDateStr(civilDate) : civilDate;

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
    isBrightWeek:           season === 'brightWeek',
    isPentecostarion:       season === 'pentecostarion',
    isPaschalGreetingWindow: daysSincePascha >= 0 && daysSincePascha <= 38,
  };
}

module.exports = { buildContext, nextDateStr };
