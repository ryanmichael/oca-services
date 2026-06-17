'use strict';

const { calculatePascha, getGreatFeastKey } = require('../../calendar-rules');
const { GREAT_FEAST_VARIANTS, LITURGICAL_DAY_LABELS } = require('../sources/propers');
const { SEASONS } = require('../../constants/seasons');

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
const DAY_MS   = 86400000;

function ordinal(n) {
  if (n < ORDINALS.length && ORDINALS[n]) return ORDINALS[n];
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function getDayLabel(entry, dow, season, date) {
  // Great Feasts override every season's default label.
  if (date) {
    const d = date instanceof Date ? date : new Date(date + 'T12:00:00Z');
    const feastKey = getGreatFeastKey(d);
    if (feastKey && GREAT_FEAST_VARIANTS[feastKey]?.label) {
      return GREAT_FEAST_VARIANTS[feastKey].label;
    }
  }
  if (season === SEASONS.GREAT_LENT) {
    if (dow === 'saturday') {
      const note = entry._meta?.note || '';
      // Soul Saturdays
      const soulMatch = note.match(/Soul Saturday (\d)/);
      if (soulMatch) return `Soul Saturday ${soulMatch[1]}`;
      // Lazarus Saturday
      if (/Lazarus/.test(note)) return 'Lazarus Saturday';
      // Numbered Saturdays
      const satNum = entry.liturgicalContext?.weekOfLent || entry.liturgicalContext?.specialDayIndex;
      if (satNum) return `${ORDINALS[satNum] || satNum + 'th'} Saturday of Great Lent`;
      return null;
    }
    if (dow === 'sunday') {
      const wk = entry.liturgicalContext?.weekOfLent;
      return LITURGICAL_DAY_LABELS.lentenSundays[wk] || null;
    }
    // Weekday
    const wk  = entry.liturgicalContext?.weekOfLent;
    const cap = dow.charAt(0).toUpperCase() + dow.slice(1);
    if (wk) return `${cap}, ${ORDINALS[wk] || wk + 'th'} Week of Great Lent`;
    return null;
  }

  if (season === SEASONS.PRE_LENTEN) {
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return LITURGICAL_DAY_LABELS.preLentenSundays[key] || null;
  }

  if (season === SEASONS.HOLY_WEEK) {
    return LITURGICAL_DAY_LABELS.holyWeek[dow] || null;
  }

  if (season === SEASONS.BRIGHT_WEEK) {
    return LITURGICAL_DAY_LABELS.brightWeek[dow] || null;
  }

  if (season === SEASONS.PENTECOSTARION) {
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return LITURGICAL_DAY_LABELS.pentecostarionFeasts[key] || null;
  }

  // Ordinary-time Sunday: "Nth Sunday after Pentecost". Numbered from All Saints
  // Sunday (Pascha + 56 = 1st Sunday after Pentecost). Handles year-boundary
  // dates (Jan/early Feb before next Pre-Lent) by falling back to the previous
  // year's Pascha when the date precedes the current year's Pascha.
  if (season === SEASONS.ORDINARY_TIME && dow === 'sunday' && date) {
    const d  = date instanceof Date ? date : new Date(date + 'T12:00:00Z');
    let pascha = calculatePascha(d.getUTCFullYear());
    if (d < pascha) pascha = calculatePascha(d.getUTCFullYear() - 1);
    const dMid    = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const pMid    = Date.UTC(pascha.getUTCFullYear(), pascha.getUTCMonth(), pascha.getUTCDate());
    const dsp     = Math.round((dMid - pMid) / DAY_MS);
    const n       = (dsp - 49) / 7;
    if (Number.isInteger(n) && n >= 1) return `${ordinal(n)} Sunday after Pentecost`;
  }

  return null;
}

module.exports = { ORDINALS, getDayLabel };
