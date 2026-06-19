/**
 * Shared constants and helpers used by all Vespers-entry generators.
 *
 * Pure leaf: no dependencies on other calendar modules. Re-exported by the
 * facade so audit rules and external consumers (VESPERS_SUNG_EVE) keep
 * working.
 *
 * Extracted from calendar-rules.js as Track D Step 7.
 */

'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Clock seam — _meta.generatedAt is stamped on every calendar entry. When
// CAL_FREEZE_TIME is set (e.g. for snapshot/contract tests), use that fixed
// value instead of the real wall-clock so output is bit-stable across runs.
function nowIso() {
  return process.env.CAL_FREEZE_TIME || new Date().toISOString();
}

// ─── Vespers sung-evening lookup ──────────────────────────────────────────────
// octoechos.json keys weekday Vespers by the civil evening it is sung — not by
// the liturgical day it opens. `monday.vespers` = Monday-evening Vespers, which
// liturgically opens Tuesday. Calendar entries carry the liturgical `dow`, so
// when reading weekday Vespers data, map liturgical day → sung-evening day.
// (Sunday Great Vespers sung Saturday eve already lives at `saturday.vespers`,
// so Sun-liturgical correctly maps to "saturday".)
const VESPERS_SUNG_EVE = {
  monday:    'sunday',     // Mon liturgical ← Sun evening Vespers (Compunction)
  tuesday:   'monday',     // Tue liturgical ← Mon evening Vespers (Forerunner)
  wednesday: 'tuesday',    // Wed liturgical ← Tue evening Vespers (Cross)
  thursday:  'wednesday',  // Thu liturgical ← Wed evening Vespers (Apostles+Nicholas)
  friday:    'thursday',   // Fri liturgical ← Thu evening Vespers (Cross)
  saturday:  'friday',     // Sat liturgical ← Fri evening Vespers (memorial/all-saints)
  sunday:    'saturday',   // Sun liturgical ← Sat evening Vespers (Sunday Great Vespers)
};

// ─── Vespers prokeimenon spec builders ────────────────────────────────────────
// Three distinct shapes appear across the per-season generators:
//   1. SATURDAY_GREAT_VESPERS_PROKEIMENON — static reference for any Sat/Sun
//      Great Vespers (sung Sat eve, "The Lord is King" Tone 6).
//   2. vespersDailyProkeimenon(dow) — civil-eve weekday lookup, used by
//      ordinary-time / Pentecostarion / Holy-Week-fallback weekday paths.
//   3. vespersDailyProkeimenon(dow, { feastDowSpecial: true }) — same, except
//      a feast falling on Sunday gets the Sat-eve Great Vespers prokeimenon
//      instead. Used by the great-feast and vigil-feast generators.
// Centralizing here means the off-by-one bug fixed in commit aef1f6f (5
// sites) can't recur and the Holy Week DAY_CONFIG TODO has one clear place
// to converge once verified.
const SATURDAY_GREAT_VESPERS_PROKEIMENON = Object.freeze({ pattern: 'weekday', weekday: 'saturdayGreatVespers' });

function vespersDailyProkeimenon(dow, { feastDowSpecial = false } = {}) {
  if (feastDowSpecial && dow === 'sunday') return { ...SATURDAY_GREAT_VESPERS_PROKEIMENON };
  return { pattern: 'weekday', weekday: VESPERS_SUNG_EVE[dow] || dow };
}

/**
 * Build the two-entry Lenten weekday Vespers prokeimenon (Genesis + Proverbs)
 * keyed off the litKey ('lent.week.N.dow').
 */
function buildLentenProkeimenon(litKey) {
  const parts = litKey.split('.');                          // ['lent','week','N','dow']
  const nestedPath = `lenten.${parts.slice(1).join('.')}`;  // 'lenten.week.N.dow'
  return {
    pattern: 'lentenWithReadings',
    entries: [
      {
        order:  1,
        source: 'prokeimena',
        key:    `${nestedPath}.genesis`,
        tone:   null,
        reading: { book: 'Genesis' },
      },
      {
        order:  2,
        source: 'prokeimena',
        key:    `${nestedPath}.proverbs`,
        tone:   null,
        reading: { book: 'Proverbs' },
      },
    ],
  };
}

module.exports = {
  DAY_MS,
  DAYS,
  nowIso,
  VESPERS_SUNG_EVE,
  SATURDAY_GREAT_VESPERS_PROKEIMENON,
  vespersDailyProkeimenon,
  buildLentenProkeimenon,
};
