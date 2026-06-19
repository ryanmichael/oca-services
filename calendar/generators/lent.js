/**
 * Lenten (greatLent) Vespers entry generators.
 *
 * Saturdays:
 *   - Soul Saturdays (2/3/4)
 *   - Theodore Saturday (week 1)
 *   - Akathist Saturday (week 5)
 *   - Lazarus Saturday (week 6)
 *   - Generic Lenten Saturday dispatcher
 *
 * Sunday: Lenten Sunday (weeks 1–5 Great Vespers sung Sat eve)
 * Weekday: Lenten Mon–Fri (Daily Vespers with OT readings)
 *
 * Extracted from calendar-rules.js as Track D Step 8e.
 */

'use strict';

const {
  nowIso,
  SATURDAY_GREAT_VESPERS_PROKEIMENON,
  buildLentenProkeimenon,
} = require('../vespers-shared');

/**
 * Generates a Soul Saturday Great Vespers entry.
 * Soul Saturdays 2, 3, 4 are Memorial Saturdays for the departed.
 *
 * Variable texts reference the triodion (data exists for Saturday 2;
 * Saturdays 3 & 4 will resolve once their triodion files are added).
 */
function generateSoulSaturday(dateStr, satNum, tone, litKey) {
  const triKey = `lent.soulSaturday${satNum}`;
  const tk     = `tone${tone}`;

  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated Soul Saturday ${satNum}. Tone ${tone}.`,
    },
    date:      dateStr,
    dayOfWeek: 'saturday',
    liturgicalContext: {
      season:          'greatLent',
      weekOfLent:      satNum,        // Soul Sat N falls in week N
      specialDay:      'soulSaturday',
      specialDayIndex: satNum,
      tone,
      toneSource:      'weeklyLenten',
    },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  `Soul Saturday ${satNum} — Memorial Saturday for the Departed (sung on Friday evening)`,
      lordICall: {
        tone,
        totalStichera: 6,
        slots: [
          {
            // Martyrs stichera are tonal — live in the Octoechos per weekly tone
            verses: [6, 5, 4],
            count:  3,
            source: 'octoechos',
            key:    `${tk}.saturday.vespers.lordICall.martyrs`,
            tone,
            label:  'For the Martyrs (in the Tone of the week)',
          },
          {
            // Menaion stichera for the saint of the day, injected by server.js
            verses: [3, 2, 1],
            count:  3,
            source: 'menaion',
            key:    `auto.${dateStr}.lordICall`,
            tone,
            label:  'For the Saint',
          },
        ],
        // Departed doxastichon is tonal — live in the Octoechos per weekly tone
        glory: { source: 'octoechos', key: `${tk}.saturday.vespers.lordICall.departedGlory`, tone, label: 'For the Departed' },
        now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon' },
      },
      prokeimenon: {
        pattern: 'lentenWithReadings',
        entries: [
          { order: 1, tone: 4, source: 'triodion', key: `${triKey}.prokeimenon1`, reading: null },
          { order: 2, tone: 6, source: 'triodion', key: `${triKey}.prokeimenon2`, reading: null },
        ],
      },
      aposticha: {
        slots: [
          { position: 1, source: 'triodion', key: `${triKey}.aposticha.idiomelon`, tone, label: 'Idiomelon' },
          { position: 2, repeatPrevious: true },
          { position: 3, source: 'triodion', key: `${triKey}.aposticha.martyrs`, tone, label: 'For the Martyrs' },
        ],
        glory: {
          source:           'triodion',
          key:              `${triKey}.aposticha.theotokion`,
          tone,
          label:            'Theotokion',
          combinesGloryNow: true,
        },
      },
      troparia: {
        source: 'triodion',
        slots: [
          { order:    1,       tone: 2, source: 'triodion', key: `${triKey}.troparia.allSaints`, label: 'Troparion' },
          { position: 'glory', tone: 2, source: 'triodion', key: `${triKey}.troparia.departed`,  label: 'For the Departed' },
          { position: 'now',   tone: 2, source: 'triodion', key: `${triKey}.troparia.theotokion`, label: 'Theotokion' },
        ],
      },
    },
  };
}

/**
 * Generates a generic Lenten Saturday Great Vespers entry
 * (St. Theodore Saturday, 5th Saturday, Lazarus Saturday).
 * Variable texts reference the db source (populated in Step 2).
 */
function generateLentenSaturday(dateStr, satNum, weekOfLent, tone, litKey) {
  const tk       = `tone${tone}`;
  const satLabels = {
    1: "Saturday of St. Theodore the Tyrant",
    5: "5th Saturday of Great Lent",
    6: "Lazarus Saturday",
  };
  const label = satLabels[satNum] || `Saturday of Great Lent (week ${weekOfLent})`;

  if (satNum === 1) return generateTheodoreSaturday(dateStr, weekOfLent, tone, label);
  if (satNum === 5) return generateAkathist_Saturday(dateStr, weekOfLent, tone, label);
  if (satNum === 6) return generateLazarusSaturday(dateStr, weekOfLent, tone, label);

  // Fallback for any future unimplemented Saturday (should not occur in practice)
  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated ${label}. Tone ${tone}. Variable texts (source:'db') keyed by '${litKey}'.`,
    },
    date:      dateStr,
    dayOfWeek: 'saturday',
    liturgicalContext: { season: 'greatLent', weekOfLent, tone, toneSource: 'weeklyLenten' },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  `${label} — Great Vespers (sung on Friday evening)`,
      lordICall: {
        tone,
        totalStichera: 6,
        slots: [
          { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', key: `${litKey}.vespers.lordICall`, tone, label: 'Stichera' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone },
        now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon' },
      },
      prokeimenon: { pattern: 'lentenWithReadings', entries: [] },
      aposticha: {
        slots: [
          { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Idiomelon' },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.aposticha.now`, tone, combinesGloryNow: true, label: 'Theotokion' },
      },
      troparia: {
        source: 'db',
        slots: [{ order: 1, tone, source: 'db', key: `${litKey}.vespers.troparia` }],
      },
    },
  };
}

function generateTheodoreSaturday(dateStr, weekOfLent, tone, label) {
  const tk  = `tone${tone}`;
  const tri = 'lent.saturday1';
  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated ${label}. Tone ${tone}.`,
    },
    date:      dateStr,
    dayOfWeek: 'saturday',
    liturgicalContext: { season: 'greatLent', weekOfLent, tone, toneSource: 'weeklyLenten' },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  `${label} — Great Vespers (sung on Friday evening)`,
      lordICall: {
        tone: 2,
        totalStichera: 3,
        slots: [
          { verses: [3, 2, 1], count: 3, source: 'triodion', key: `${tri}.lordICall.theodore`, tone: 2, label: 'For St. Theodore' },
        ],
        glory: { source: 'triodion', key: `${tri}.lordICall.glory`, tone: 6, label: 'For St. Theodore' },
        now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon' },
      },
      prokeimenon: {
        pattern: 'lentenWithReadings',
        entries: [
          { order: 1, tone: 5, source: 'triodion', key: `${tri}.prokeimenon1`, reading: null },
          { order: 2, tone: 6, source: 'triodion', key: `${tri}.prokeimenon2`, reading: null },
        ],
      },
      aposticha: {
        slots: [
          { position: 1, source: 'triodion', key: `${tri}.aposticha.idiomelon`, tone: 5, label: 'Idiomelon' },
          { position: 2, repeatPrevious: true },
          { position: 3, source: 'triodion', key: `${tri}.aposticha.martyrs`,  tone: 5, label: 'For the Martyrs' },
          { position: 4, source: 'triodion', key: `${tri}.aposticha.theodore`, tone: 2, label: 'For St. Theodore' },
        ],
        glory: { source: 'triodion', key: `${tri}.aposticha.theotokion`, tone: 4, combinesGloryNow: true, label: 'Theotokion' },
      },
      troparia: {
        source: 'triodion',
        slots: [
          { position: 'glory', tone: 2, source: 'triodion', key: `${tri}.troparia.theodore`,  label: 'For St. Theodore' },
          { position: 'now',   tone: 2, source: 'triodion', key: `${tri}.troparia.theotokion`, label: 'Theotokion' },
        ],
      },
    },
  };
}

function generateAkathist_Saturday(dateStr, weekOfLent, tone, label) {
  const tri = 'lent.saturday5';
  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated ${label}. Tone ${tone}.`,
    },
    date:      dateStr,
    dayOfWeek: 'saturday',
    liturgicalContext: { season: 'greatLent', weekOfLent, tone, toneSource: 'weeklyLenten' },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  `${label} — Great Vespers (sung on Friday evening)`,
      lordICall: {
        tone: 6,
        totalStichera: 8,
        slots: [
          { verses: [8, 7, 6, 5, 4, 3, 2, 1], count: 8, source: 'triodion', key: `${tri}.lordICall.theotokos`, tone: 6, label: 'For the Theotokos' },
        ],
        glory: { source: 'triodion', key: `${tri}.lordICall.glory`, tone: 2, combinesGloryNow: true, label: 'Theotokion' },
      },
      prokeimenon: {
        pattern: 'lentenWithReadings',
        entries: [
          { order: 1, tone: 4, source: 'triodion', key: `${tri}.prokeimenon1`, reading: null },
          { order: 2, tone: 4, source: 'triodion', key: `${tri}.prokeimenon2`, reading: null },
        ],
      },
      aposticha: {
        slots: [
          { position: 1, source: 'triodion', key: `${tri}.aposticha.idiomelon`, tone: 6, label: 'Idiomelon' },
          { position: 2, repeatPrevious: true },
          { position: 3, source: 'triodion', key: `${tri}.aposticha.martyrs`,  tone: 6, label: 'For the Martyrs' },
        ],
        glory: { source: 'triodion', key: `${tri}.aposticha.theotokion`, tone: 4, combinesGloryNow: true, label: 'Theotokion' },
      },
      troparia: {
        source: 'triodion',
        slots: [
          { order: 1, tone: 8, source: 'triodion', key: `${tri}.troparia.theotokos`, label: 'Troparion' },
        ],
      },
    },
  };
}

function generateLazarusSaturday(dateStr, weekOfLent, tone, label) {
  const tri = 'lent.lazarusSaturday';
  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated ${label}. Tone ${tone}.`,
    },
    date:      dateStr,
    dayOfWeek: 'saturday',
    liturgicalContext: {
      season:     'greatLent',
      weekOfLent,
      specialDay: 'lazarusSaturday',
      tone,
      toneSource: 'weeklyLenten',
    },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  `${label} — Great Vespers (sung on Friday evening)`,
      lordICall: {
        tone: 6,
        totalStichera: 6,
        slots: [
          { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'triodion', key: `${tri}.lordICall.lazarus`, tone: 6, label: 'The Raising of Lazarus' },
        ],
        glory: { source: 'triodion', key: `${tri}.lordICall.glory`, tone: 8, combinesGloryNow: true, label: 'Glory and Now' },
      },
      prokeimenon: {
        pattern: 'lentenWithReadings',
        entries: [
          { order: 1, tone: 6, source: 'triodion', key: `${tri}.prokeimenon1`, reading: null },
          { order: 2, tone: 6, source: 'triodion', key: `${tri}.prokeimenon2`, reading: null },
        ],
      },
      aposticha: {
        slots: [
          { position: 1, source: 'triodion', key: `${tri}.aposticha.idiomelon`, tone: 8, label: 'Idiomelon' },
          { position: 2, repeatPrevious: true },
          { position: 3, source: 'triodion', key: `${tri}.aposticha.martyrs`,  tone: 8, label: 'For the Martyrs' },
        ],
        glory: { source: 'triodion', key: `${tri}.aposticha.lazarus`, tone: 8, combinesGloryNow: true, label: 'Glory and Now' },
      },
      troparia: {
        source: 'triodion',
        slots: [
          { order: 1, tone: 1, source: 'triodion', key: `${tri}.troparia.lazarus`, label: 'Troparion' },
        ],
      },
    },
  };
}

/**
 * Generates a Lenten Sunday Great Vespers entry.
 * Sundays of Lent use both the Octoechos (resurrectional hymns) and Triodion.
 * Variable texts reference the db source (populated in Step 2).
 */
function generateLentenSunday(dateStr, weekOfLent, tone, litKey) {
  const tk = `tone${tone}`;
  const sundayNames = {
    1: 'Sunday of Orthodoxy',
    2: 'Sunday of St. Gregory Palamas',
    3: 'Sunday of the Veneration of the Holy Cross',
    4: 'Sunday of St. John of the Ladder',
    5: 'Sunday of St. Mary of Egypt',
    6: 'Palm Sunday',
  };
  const name = sundayNames[weekOfLent] || `Sunday of Great Lent (week ${weekOfLent})`;

  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated ${name}. Tone ${tone}. Variable texts (source:'db') keyed by '${litKey}'.`,
    },
    date:      dateStr,
    dayOfWeek: 'sunday',
    liturgicalContext: {
      season:    'greatLent',
      weekOfLent,
      tone,
      toneSource: 'octoechosCycle',
    },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  `${name} — Great Vespers (sung on Saturday evening)`,
      lordICall: {
        tone,
        totalStichera: 10,
        slots: [
          { verses: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], count: 10, source: 'db', key: `${litKey}.vespers.lordICall`, tone, label: 'Stichera' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone },
        now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon' },
      },
      prokeimenon: { ...SATURDAY_GREAT_VESPERS_PROKEIMENON },
      aposticha: {
        slots: [
          { position: 1, source: 'db', key: `${litKey}.vespers.aposticha.hymns.0`, tone, label: 'Sticheron' },
          { position: 2, source: 'db', key: `${litKey}.vespers.aposticha.hymns.1`, tone, label: 'Sticheron' },
          { position: 3, source: 'db', key: `${litKey}.vespers.aposticha.hymns.2`, tone, label: 'Sticheron' },
          { position: 4, source: 'db', key: `${litKey}.vespers.aposticha.hymns.3`, tone, label: 'Sticheron' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.aposticha.glory`, tone },
        now:   { source: 'db', key: `${litKey}.vespers.aposticha.now`,   tone, label: 'Theotokion' },
      },
      troparia: {
        source: 'db',
        slots: [
          { order: 1, tone, source: 'db', key: `${litKey}.vespers.troparia` },
        ],
      },
    },
  };
}


/**
 * Generates a Lenten weekday Daily Vespers entry (Monday–Friday).
 * Lenten weekday vespers includes OT readings; variable hymns from the db.
 */
function generateLentenWeekday(dateStr, dayOfWeek, weekOfLent, tone, litKey) {
  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated Lenten weekday Daily Vespers (${dayOfWeek}, week ${weekOfLent}). ` +
                   `Tone ${tone}. Variable texts (source:'db') keyed by '${litKey}'. ` +
                   `OT reading entries require Step 3.`,
    },
    date:      dateStr,
    dayOfWeek,
    liturgicalContext: {
      season:    'greatLent',
      weekOfLent,
      tone,
      toneSource: 'weeklyLenten',
    },
    commemorations: [],
    vespers: {
      serviceType: 'dailyVespers',
      rubricNote:  `Lenten Daily Vespers with OT Readings (week ${weekOfLent}, ${dayOfWeek})`,
      lordICall: {
        tone,
        totalStichera: 6,
        slots: [
          { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', key: `${litKey}.vespers.lordICall`, tone, label: 'Stichera' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone },
        now:   { source: 'db', key: `${litKey}.vespers.lordICall.now`,   tone, label: 'Theotokion' },
      },
      prokeimenon: buildLentenProkeimenon(litKey, tone),
      aposticha: {
        slots: [
          { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Sticheron' },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.aposticha.now`, tone, combinesGloryNow: true, label: 'Theotokion' },
      },
      troparia: {
        source: 'db',
        slots: [
          { order: 1, tone, source: 'db', key: `${litKey}.vespers.troparia` },
        ],
      },
    },
  };
}

/**
 * Generates a Holy Week day entry.
 * All variable slots are DB-sourced via the stable holyWeek.{dow} key.
 *
 * Service types:
 *   Sun–Thu  → dailyVespers  (Palm Sunday evening; Mon–Wed Bridegroom Vespers;
 *                              Thu note: primary service is Liturgy of St. Basil)
 *   Friday   → greatVespers  (Burial Vespers — full Great Vespers with Epitaphion)
 *   Saturday → greatVespers  (combined with Liturgy of St. Basil)
 *
 * Prokeimena:
 *   Sunday    → Sunday prokeimenon (Tone 8, "Behold now, bless the Lord")
 *   Mon–Wed   → appointed weekday prokeimenon by day of week
 *   Thursday  → Thursday weekday prokeimenon
 *   Friday    → specific Holy Friday prokeimenon (Tone 4, "They parted my garments")
 *   Saturday  → Saturday Great Prokeimenon (Tone 8, "Thou hast given an inheritance")
 */

module.exports = {
  generateSoulSaturday,
  generateLentenSaturday,
  generateTheodoreSaturday,
  generateAkathist_Saturday,
  generateLazarusSaturday,
  generateLentenSunday,
  generateLentenWeekday,
};
