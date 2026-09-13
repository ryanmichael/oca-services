'use strict';

// Composes the per-day dismissal spec — the festal introit, the weekday patron
// and the day's saints that assemblers/common-parts/dismissal.js turns into the
// priest's "May Christ our true God…".
//
// This logic lived inline in server-lib/assemble/for-date.js on the VESPERS
// path only. assembleMatins therefore called assembleDismissal() with no spec
// at all, and every Matins in the system printed the literal placeholder
// "[Proper Dismissal for the day]" where the dismissal belongs — 352 dates in
// 2026. It went unnoticed because nothing asserted on the Matins dismissal's
// content, and because on a vigil date the festal dismissal was still reachable
// on the Vespers half. Removing the Vespers dismissal at a vigil (correct — a
// vigil has ONE dismissal, at the end) is what exposed it. Extracted here
// 2026-09-13 so both services compose the same spec from the same rules.
//
// See audit rule M31-matins-dismissal-proper.

const { DAY_PATRONS, GREAT_FEAST_VARIANTS } = require('./propers');

/**
 * @param {Object} calendarEntry  the entry for the LITURGICAL day being dismissed
 * @param {Object} opts
 * @param {boolean} opts.isGreatVespers  true when composing for Great Vespers —
 *        a Saturday Great Vespers begins the Sunday celebration and so takes the
 *        resurrectional opening. Matins of a Saturday does not.
 * @returns {Object|null}
 */
function buildDismissalSpec(calendarEntry, opts = {}) {
  if (!calendarEntry) return null;

  const dow      = calendarEntry.dayOfWeek;
  const feastKey = calendarEntry.liturgicalContext?.greatFeast;

  // Saturday Great Vespers begins the Sunday celebration → resurrectional
  // dismissal. That shift belongs to the evening service only: Saturday MATINS
  // is still Saturday, so the caller says which it is building.
  const isSundayService = dow === 'sunday'
    || (opts.isGreatVespers && dow === 'saturday' && !feastKey);

  const introit = (feastKey && GREAT_FEAST_VARIANTS[feastKey]?.dismissalIntroit) || null;

  return {
    opening:    feastKey ? 'feast' : (isSundayService ? 'sunday' : 'weekday'),
    feastLabel: feastKey || null,
    // A Great Feast suppresses the daily cycle — the weekday patron does not
    // belong in its dismissal (same defect fixed on the Liturgy path in
    // liturgy-from-orthocal.js).
    dayPatron:  feastKey ? null : (DAY_PATRONS[dow] || null),
    dismissalIntroit: introit,
    // When a festal introit names the feast, drop the feast from the saints
    // list — otherwise it is announced twice. Mirrors the Liturgy dismissal,
    // which skips feasts[0] for the same reason.
    saints: (calendarEntry.commemorations || [])
      .slice(introit ? 1 : 0)
      .slice(0, 3)
      .map(c => c.title),
  };
}

module.exports = { buildDismissalSpec };
