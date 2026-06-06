'use strict';

const { getGreatFeastKey } = require('../../calendar-rules');
const { GREAT_FEAST_VARIANTS, LITURGICAL_DAY_LABELS } = require('../sources/propers');

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

function getDayLabel(entry, dow, season, date) {
  // Great Feasts override every season's default label.
  if (date) {
    const d = date instanceof Date ? date : new Date(date + 'T12:00:00Z');
    const feastKey = getGreatFeastKey(d);
    if (feastKey && GREAT_FEAST_VARIANTS[feastKey]?.label) {
      return GREAT_FEAST_VARIANTS[feastKey].label;
    }
  }
  if (season === 'greatLent') {
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

  if (season === 'preLenten') {
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return LITURGICAL_DAY_LABELS.preLentenSundays[key] || null;
  }

  if (season === 'holyWeek') {
    return LITURGICAL_DAY_LABELS.holyWeek[dow] || null;
  }

  if (season === 'brightWeek') {
    return LITURGICAL_DAY_LABELS.brightWeek[dow] || null;
  }

  if (season === 'pentecostarion') {
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return LITURGICAL_DAY_LABELS.pentecostarionFeasts[key] || null;
  }

  return null;
}

module.exports = { ORDINALS, getDayLabel };
