/**
 * Vespers entry generators for Great Feasts and Vigil-rank feasts.
 *
 * Both produce an all-night-vigil shaped entry. Server injects all variable
 * texts at runtime; this layer only defines the structure.
 *
 * Extracted from calendar-rules.js as Track D Step 8a (generators, smallest first).
 */

'use strict';

const { nowIso, vespersDailyProkeimenon } = require('../vespers-shared');

/**
 * Great Vespers entry for a fixed-calendar Great Feast (Lord's feast or
 * Theotokos feast). All stichera come from the feast — injected by the server.
 */
function generateGreatFeastVespers(dateStr, dow, tone, feastKey, season) {
  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated All-Night Vigil — Great Vespers (${feastKey}). Tone ${tone}.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season, tone, toneSource: 'octoechosCycle', greatFeast: feastKey },
    commemorations: [],
    vespers: {
      serviceType: 'all-night-vigil',
      rubricNote:  `All-Night Vigil — Great Vespers with Entrance — ${feastKey}`,
      lordICall: {
        tone,
        totalStichera: 8,
        slots: [],   // server injects feast stichera at runtime
        glory: null, // server injects feast glory doxastichon
        now:   null,
      },
      prokeimenon: vespersDailyProkeimenon(dow, { feastDowSpecial: true }),
      litya: {
        slots: [],   // server injects litya stichera when available
        glory: null,
        now:   null,
      },
      aposticha: {
        slots: [],   // server injects feast aposticha
        glory: null,
      },
      troparia: {
        slots: [],   // server injects feast troparion
      },
    },
  };
}

/**
 * All-Night Vigil entry for a vigil-rank saint (non-great-feast).
 * Uses 8 stichera at Lord I Call (vs 6 for ordinary days).
 */
function generateVigilFeastVespers(dateStr, dow, tone) {
  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated All-Night Vigil — Vigil-rank feast. Tone ${tone}.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season: 'ordinaryTime', tone, toneSource: 'octoechosCycle' },
    commemorations: [],
    vespers: {
      serviceType: 'all-night-vigil',
      rubricNote:  `All-Night Vigil — Great Vespers with Entrance`,
      lordICall: {
        tone,
        totalStichera: 8,
        slots: [],   // server injects stichera at runtime
        glory: null,
        now:   null,
      },
      prokeimenon: vespersDailyProkeimenon(dow, { feastDowSpecial: true }),
      litya: {
        slots: [],   // server injects litya stichera when available
        glory: null,
        now:   null,
      },
      aposticha: {
        slots: [],
        glory: null,
      },
      troparia: {
        slots: [],
      },
    },
  };
}

module.exports = { generateGreatFeastVespers, generateVigilFeastVespers };
