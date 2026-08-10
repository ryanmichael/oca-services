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
function getCalendarEntry(dateStr, style = 'new', opts = {}) {
  const calPath     = path.join(ROOT, 'variable-sources', 'calendar', `${dateStr}.json`);
  const handAuthored = fs.existsSync(calPath) ? loadJSON(`variable-sources/calendar/${dateStr}.json`) : null;

  const generated = generateCalendarEntry(dateStr, style);

  if (generated && handAuthored) {
    // Merge: auto-generated base + hand-authored liturgy (and commemorations if present)
    if (handAuthored.liturgy)         generated.liturgy         = handAuthored.liturgy;
    if (handAuthored.commemorations)  generated.commemorations  = handAuthored.commemorations;
    return applyLityaPolicy(generated, dateStr, style, opts.rubrics);
  }

  return applyLityaPolicy(generated ?? handAuthored, dateStr, style, opts.rubrics);
}

/**
 * Whether the parish serves a Litya and Blessing of the Loaves, applied AFTER
 * the calendar entry is built.
 *
 * The saint's RANK and the SERVICE the parish actually serves are two different
 * facts, and conflating them is what has blocked rank corrections: setting a
 * saint to vigil rank — which is what drives paremias, the Magnification and
 * festal propers — also started printing a Litya the parish may never serve, so
 * the honest rank produced the wrong service. This separates them. `getFeastRank`
 * stays a statement about the saint; this is a statement about the parish.
 *
 * The OCA order documents make the same distinction themselves: a Great Feast
 * prints "Litya" plainly, while an ordinary vigil-rank saint's day prints
 * "[Litya]" — bracketed, which those documents' own header defines as
 * "commonly omitted in parish practice".
 *
 *   always           every day whose entry carries one (the default; today's output)
 *   greatFeastsOnly  Great Feasts keep theirs, vigil-rank saints' days drop it
 *   never            no Litya at all
 *
 * Subtractive only: this removes a Litya the entry already has and never adds
 * one. Vigil-rank SUNDAYS currently have no Litya block to control — see
 * features/vigil-rank-sunday.md.
 */
function applyLityaPolicy(entry, dateStr, style, rubrics) {
  const policy = rubrics?.vespers?.servesLitya || 'always';
  if (policy === 'always') return entry;
  if (!entry?.vespers?.litya) return entry;

  if (policy === 'greatFeastsOnly') {
    const { getGreatFeastKey } = require('../../calendar-rules');
    const date = new Date(`${dateStr}T12:00:00Z`);
    if (getGreatFeastKey(date, style)) return entry;
  }

  const vespers = { ...entry.vespers };
  delete vespers.litya;
  return { ...entry, vespers };
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

module.exports = {
  applyLityaPolicy, getCalendarEntry, getNextDateStr };
