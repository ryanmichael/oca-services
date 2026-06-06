'use strict';

const fs   = require('fs');
const path = require('path');

const { loadJSON }              = require('../_shared/load-json');
const { generateCalendarEntry } = require('../../calendar-rules');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Returns a calendar entry for the date, or null if unavailable.
 * Priority:
 *   1. calendar-rules.js auto-generation (for supported seasons)
 *   2. Hand-authored calendar JSON (for Lenten/special dates)
 *
 * When both exist, the auto-generated entry is used as the base (vespers),
 * and any `liturgy` field from the hand-authored file is merged in.
 */
function getCalendarEntry(dateStr, style = 'new') {
  const calPath     = path.join(ROOT, 'variable-sources', 'calendar', `${dateStr}.json`);
  const handAuthored = fs.existsSync(calPath) ? loadJSON(`variable-sources/calendar/${dateStr}.json`) : null;

  const generated = generateCalendarEntry(dateStr, style);

  if (generated && handAuthored) {
    // Merge: auto-generated base + hand-authored liturgy (and commemorations if present)
    if (handAuthored.liturgy)         generated.liturgy         = handAuthored.liturgy;
    if (handAuthored.commemorations)  generated.commemorations  = handAuthored.commemorations;
    return generated;
  }

  return generated ?? handAuthored;
}

/**
 * Returns the next calendar date as a YYYY-MM-DD string.
 * Used for the Vespers date-shift: Vespers served on date X is liturgically
 * the first service of date X+1, so we look up the next day's calendar entry.
 */
function getNextDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

module.exports = { getCalendarEntry, getNextDateStr };
