/**
 * Bright Week day entry generator.
 *
 * All services during Bright Week use Paschal texts sourced from the DB.
 *
 * Extracted from calendar-rules.js as Track D Step 8b.
 */

'use strict';

const { nowIso } = require('../vespers-shared');

function generateBrightWeekDay(dateStr, dow, litKey) {
  const names = {
    sunday:    'Holy Pascha',
    monday:    'Bright Monday',
    tuesday:   'Bright Tuesday',
    wednesday: 'Bright Wednesday',
    thursday:  'Bright Thursday',
    friday:    'Bright Friday',
    saturday:  'Bright Saturday',
  };
  const name = names[dow] || `Bright Week ${dow}`;

  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated ${name}. Variable texts (source:'db') keyed by '${litKey}'.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season: 'brightWeek' },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      paschalOpening: true,
      rubricNote:  `${name} — Paschal Vespers`,
      lordICall: {
        totalStichera: 6,
        slots: [
          { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', tone: 2,
            key: `${litKey}.vespers.lordICall`, label: 'Stichera' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory` },
        now:   { source: 'db', key: `${litKey}.vespers.lordICall.now`, label: 'Theotokion' },
      },
      prokeimenon: (() => {
        const BRIGHT_PROK = {
          sunday:    { pattern: 'great',   key: 'whoIsSoGreat' },
          monday:    { pattern: 'great',   key: 'whoIsSoGreat' },
          tuesday:   { pattern: 'great',   key: 'ourGodIsInHeaven' },
          wednesday: { pattern: 'great',   key: 'iCriedAloud' },
          thursday:  { pattern: 'great',   key: 'hearkenUntoMyPrayer' },
          friday:    { pattern: 'great',   key: 'iLoveThee' },
          saturday:  { pattern: 'weekday', weekday: 'saturdayGreatVespers' },
        };
        return BRIGHT_PROK[dow] ?? { pattern: 'weekday', weekday: 'saturdayGreatVespers' };
      })(),
      // Bright Sunday aposticha: 5 unique Paschal stichera with Ps. 67/117 verses, then Glory+Now
      aposticha: dow === 'sunday' ? {
        slots: [
          { position: 1, source: 'db', key: 'brightWeek.sunday.vespers.aposticha.hymns.0', tone: 2, label: 'for the Resurrection' },
          { position: 2, source: 'db', key: 'brightWeek.sunday.vespers.aposticha.hymns.1', tone: 5, label: 'Paschal Sticheron' },
          { position: 3, source: 'db', key: 'brightWeek.sunday.vespers.aposticha.hymns.2', tone: 5, label: 'Paschal Sticheron' },
          { position: 4, source: 'db', key: 'brightWeek.sunday.vespers.aposticha.hymns.3', tone: 5, label: 'Paschal Sticheron' },
          { position: 5, source: 'db', key: 'brightWeek.sunday.vespers.aposticha.hymns.4', tone: 5, label: 'Paschal Sticheron' },
        ],
        glory: { source: 'db', key: 'brightWeek.sunday.vespers.aposticha.now', combinesGloryNow: true },
      } : {
        slots: [
          { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, label: 'Sticheron' },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.aposticha.now`, combinesGloryNow: true, label: 'Theotokion' },
      },
      troparia: {
        source: 'db',
        slots: [
          { order: 1,          source: 'db', key: `${litKey}.vespers.troparia` },
          { position: 'glory', source: 'db', key: `${litKey}.vespers.troparia` },
          { position: 'now',   source: 'db', key: `${litKey}.vespers.troparia.now` },
        ],
      },
    },
  };
}

module.exports = { generateBrightWeekDay };
