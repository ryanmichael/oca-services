/**
 * Ordinary-time Vespers entry generators.
 *
 *   - generateOrdinaryTimeWeekday — Mon–Fri Daily Vespers
 *   - generateOrdinaryTimeSaturday — Saturday + Sunday Great Vespers
 *
 * generateOrdinaryTimeSaturday is reused by pre-lent and pentecostarion
 * generators for their Saturday entries. CAUTION: those callers mutate the
 * returned object's liturgicalContext.season to mark it as preLenten /
 * pentecostarion. If a future change freezes the output here, those mutations
 * break silently. See Track-D risk register, item #4.
 *
 * Extracted from calendar-rules.js as Track D Step 8c.
 */

'use strict';

const {
  nowIso,
  VESPERS_SUNG_EVE,
  SATURDAY_GREAT_VESPERS_PROKEIMENON,
  vespersDailyProkeimenon,
} = require('../vespers-shared');

/**
 * Generates a weekday (Mon–Fri) or Sunday evening Daily Vespers for ordinary time.
 *
 * Structure:
 *   - Lord I Call: up to 3 stichera from the Menaion (server injects at runtime);
 *     if no Menaion stichera are available the psalm verses are read plain.
 *   - Kathisma:    appointed kathisma for the day (assembler renders rubric).
 *   - Prokeimenon: weekday prokeimenon by day of week.
 *   - Aposticha:   Menaion if available (server injects); otherwise omitted.
 *   - Troparia:    saint's troparion (server injects from Menaion DB).
 *
 * No resurrectional stichera; those belong to Saturday Great Vespers only.
 */
function generateOrdinaryTimeWeekday(dateStr, dow, tone) {
  const tk  = `tone${tone}`;
  const eve = VESPERS_SUNG_EVE[dow] || dow;
  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated ordinary-time ${dow} Daily Vespers. Tone ${tone}.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season: 'ordinaryTime', tone, toneSource: 'octoechosCycle' },
    commemorations: [],
    vespers: {
      serviceType: 'dailyVespers',
      rubricNote:  `Daily Vespers`,
      lordICall: {
        tone,
        totalStichera: 6,
        slots: [
          // 3 Octoechos stichera (tone of the week, day of the week)
          // Server may reduce count when Menaion stichera are available
          { verses: [6, 5, 4], count: 3, source: 'octoechos', key: `${tk}.${eve}.vespers.lordICall`, tone, label: 'Octoechos' },
        ],
        glory: null, // server injects Menaion glory doxastichon
        now:   null, // server injects theotokion
      },
      prokeimenon: vespersDailyProkeimenon(dow),
      aposticha: {
        slots: [
          { position: 1, source: 'octoechos', key: `${tk}.${eve}.vespers.aposticha.hymns.0`, tone, label: 'Aposticha' },
          { position: 2, source: 'octoechos', key: `${tk}.${eve}.vespers.aposticha.hymns.1`, tone, label: 'Aposticha' },
          { position: 3, source: 'octoechos', key: `${tk}.${eve}.vespers.aposticha.hymns.2`, tone, label: 'Aposticha' },
        ],
        glory: null, // server injects Menaion glory if available
        now:   { source: 'octoechos', key: `${tk}.${eve}.vespers.aposticha.theotokion`, tone, label: 'Theotokion' },
      },
      troparia: {
        slots: [],   // server injects Menaion troparion
      },
    },
  };
}

/**
 * Generates a Great Vespers entry (resurrectional Octoechos) for ordinary time.
 * Used for both Saturday and Sunday calendar entries — each owns the Vespers
 * served on its corresponding civil evening:
 *   - Saturday entry → Vespers served Fri eve (opens Sat liturgical day)
 *   - Sunday entry   → Vespers served Sat eve (opens Sun liturgical day; Great Vespers)
 * Uses 6 resurrectional stichera from the Octoechos + dogmatikon.
 */
function generateOrdinaryTimeSaturday(dateStr, tone, dow = 'saturday') {
  const tk = `tone${tone}`;
  // Sunday Great Vespers (Sat-eve service entering Sun) follows the OCA
  // 10-stichera pattern (7 Octoechos resurrectional + 3 Menaion/feast).
  // Saturday's vespers (Fri-eve service entering Sat liturgical day) uses 6.
  const totalStichera = dow === 'sunday' ? 10 : 6;
  const verses        = dow === 'sunday' ? [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] : [6, 5, 4, 3, 2, 1];
  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated ${dow === 'sunday' ? 'Sunday' : 'Saturday'} Great Vespers. Tone ${tone}. ` +
                   `Menaion commemorations not included.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season: 'ordinaryTime', tone, toneSource: 'octoechosCycle' },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  dow === 'sunday'
        ? 'Great Vespers with Entrance (sung on Saturday evening)'
        : 'Great Vespers with Entrance (sung on Friday evening)',
      lordICall: {
        tone,
        totalStichera,
        slots: [{
          verses,
          count:  totalStichera,
          source: 'octoechos',
          key:    `${tk}.saturday.vespers.lordICall.resurrectional`,
          tone,
          label:  'Resurrectional',
        }],
        // Tone 5 has no resurrectional doxastichon — combine Glory+Now into the dogmatikon directly.
        // All other tones have a glory doxastichon followed by a separate Now+dogmatikon.
        ...(tone === 5 ? {
          glory: { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon', combinesGloryNow: true },
        } : {
          glory: { source: 'octoechos', key: `${tk}.saturday.vespers.lordICall.glory`, tone, label: 'Resurrectional Doxastichon' },
          now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`,      tone, label: 'Theotokion — Dogmatikon' },
        }),
      },
      prokeimenon: { ...SATURDAY_GREAT_VESPERS_PROKEIMENON },
      aposticha: {
        slots: [
          { position: 1, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.0`, tone, label: 'Resurrectional Sticheron 1' },
          { position: 2, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.1`, tone, label: 'Resurrectional Sticheron 2' },
          { position: 3, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.2`, tone, label: 'Resurrectional Sticheron 3' },
          { position: 4, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.3`, tone, label: 'Resurrectional Sticheron 4' },
        ],
        // No resurrectional glory doxastichon in plain Saturday Octoechos;
        // go straight to "Glory...now and ever..." + Theotokion.
        glory: { source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.theotokion`, tone, label: 'Theotokion', combinesGloryNow: true },
      },
      troparia: {
        source: 'octoechos',
        slots: [
          { order: 1,        tone, source: 'octoechos', key: `${tk}.saturday.vespers.troparion`,           label: 'Resurrectional Troparion' },
          { position: 'now', tone, source: 'octoechos', key: `${tk}.saturday.vespers.dismissalTheotokion`, label: 'Dismissal Theotokion' },
        ],
      },
    },
  };
}

module.exports = { generateOrdinaryTimeWeekday, generateOrdinaryTimeSaturday };
