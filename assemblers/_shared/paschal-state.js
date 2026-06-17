'use strict';

/**
 * Single derivation point for the Liturgy's paschal-period signals.
 *
 * Four signals coexist on the calendar entry:
 *   - `spec.paschalOpening`            — Paschal Troparion at opening + closing
 *                                         doxology + dismissal greeting.
 *                                         Window: Pascha → Apodosis of Pascha.
 *   - `spec.paschalAntiphons12`        — Paschal psalm antiphons replace the
 *                                         typical 1st/2nd antiphons.
 *   - `spec.weHaveSeen === 'paschal'`  — Sentinel: substitutes "Christ is
 *                                         risen" for "We have seen the true
 *                                         Light" at Post-Communion.
 *   - `liturgicalContext.season`       — 'brightWeek' | 'pentecostarion' —
 *                                         drives Paschal Communion order
 *                                         ("In the fear of God..." replacement).
 *
 * The writer (`server-lib/sources/liturgy-from-orthocal.js`) couples these,
 * but hand-authored calendar entries can set one without the others. This
 * helper exposes a single derived `paschal` object and emits warnings when the
 * signals disagree.
 */

const warnings = require('./warnings');

function derivePaschalState(calendarDay, spec) {
  const season           = calendarDay?.liturgicalContext?.season || null;
  const isBrightWeek     = season === 'brightWeek';
  const isPentecostarion = season === 'pentecostarion';
  const isPaschalSeason  = isBrightWeek || isPentecostarion;

  const hasPaschalOpening      = !!spec.paschalOpening;
  const hasPaschalAntiphons    = !!spec.paschalAntiphons12;
  const hasPaschalCommunionSub = spec.weHaveSeen === 'paschal';

  if (hasPaschalOpening && !isPaschalSeason) {
    warnings.push({ source: 'spec', key: 'liturgy.paschalOpening', scope: 'Paschal state',
      detail: `paschalOpening=true but season="${season}" — expected brightWeek or pentecostarion` });
  }
  if (hasPaschalAntiphons && !isPaschalSeason) {
    warnings.push({ source: 'spec', key: 'liturgy.paschalAntiphons12', scope: 'Paschal state',
      detail: `paschalAntiphons12 set but season="${season}" — expected brightWeek or pentecostarion` });
  }
  if (hasPaschalCommunionSub && !isPaschalSeason) {
    warnings.push({ source: 'spec', key: 'liturgy.weHaveSeen', scope: 'Paschal state',
      detail: `weHaveSeen='paschal' but season="${season}" — expected brightWeek or pentecostarion` });
  }

  return {
    season,
    isBrightWeek,
    isPentecostarion,
    isPaschalSeason,
    hasPaschalOpening,
    hasPaschalAntiphons,
    hasPaschalCommunionSub,
  };
}

module.exports = { derivePaschalState };
