/**
 * Calendar Rules
 *
 * Programmatically generates calendar entries for any date, driving the
 * service assembler without requiring a hand-authored JSON file per day.
 *
 * Supported:
 *   - Saturday Great Vespers in ordinary time (post-Pentecost)
 *   - Great Lent: all Saturdays (including Soul Saturdays), Sundays, weekdays
 *
 * Returns null for seasons not yet implemented (Holy Week, Bright Week,
 * Pentecostarion feasts, pre-Lenten period).
 *
 * Variable text slots that cannot yet be resolved (triodion data not
 * populated, or requiring the DB source from Step 2) use source:'db'
 * and will silently produce no output until the DB resolver is wired.
 *
 * Exports:
 *   calculatePascha(year)            → Date (UTC midnight)
 *   getAllSaints(year)               → Date (UTC midnight)
 *   getLiturgicalSeason(date)        → string
 *   getTone(date)                    → 1–8
 *   getDayOfWeek(date)              → string
 *   getWeekOfLent(date)             → 1–6 | null
 *   getLentenSaturdayNumber(date)   → 1–6 | 0
 *   isSoulSaturday(date)            → boolean
 *   generateCalendarEntry(dateStr)  → Object | null
 */

'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Pascha calculation ───────────────────────────────────────────────────────

/**
 * Calculates Orthodox Pascha (Easter) for a given year.
 * Uses the Meeus Julian algorithm, then adds 13 days for Gregorian conversion
 * (valid for 1900–2099).
 *
 * Verified: 2024 → May 5, 2025 → April 20, 2026 → April 12
 */
function calculatePascha(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b + 6 * d + 6) % 7;
  const f = d + e;

  let month, day;
  if (f < 10) {
    month = 3; day = 22 + f;
  } else {
    month = 4; day = f - 9;
  }

  return new Date(Date.UTC(year, month - 1, day + 13));
}

/**
 * Returns the date of All Saints Sunday = Pascha + 56 days.
 * Tone 1 of the Octoechos cycle begins on this day.
 */
function getAllSaints(year) {
  return new Date(calculatePascha(year).getTime() + 56 * DAY_MS);
}

// ─── Tone cycle ───────────────────────────────────────────────────────────────

/**
 * Returns the Octoechos tone (1–8) active for a given date.
 *
 * The cycle anchors to All Saints Sunday each year (Tone 1).
 * The tone for a Saturday belongs to the week that is ending —
 * i.e., the Sunday that started that week sets the tone.
 */
function getTone(date) {
  const year = date.getUTCFullYear();
  let anchor = getAllSaints(year);
  if (date < anchor) anchor = getAllSaints(year - 1);

  const weeksSince = Math.floor((date - anchor) / (7 * DAY_MS));
  return (weeksSince % 8) + 1;
}

// ─── Liturgical season ────────────────────────────────────────────────────────

/**
 * Returns the broad liturgical season for a given date.
 *
 * @returns {'ordinaryTime'|'preLenten'|'greatLent'|'holyWeek'|'brightWeek'|'pentecostarion'}
 */
function getLiturgicalSeason(date) {
  const year   = date.getUTCFullYear();
  const pascha = calculatePascha(year);

  const cleanMonday    = new Date(pascha.getTime() - 48 * DAY_MS);
  const palmSunday     = new Date(pascha.getTime() -  7 * DAY_MS);
  const triodiOnStart  = new Date(pascha.getTime() - 70 * DAY_MS); // Sunday of Publican & Pharisee
  const diff           = Math.floor((date - pascha) / DAY_MS);

  if (date >= pascha) {
    if (diff <= 6)  return 'brightWeek';
    if (diff <= 49) return 'pentecostarion';
    return 'ordinaryTime';
  }

  if (date >= palmSunday)   return 'holyWeek';
  if (date >= cleanMonday)  return 'greatLent';
  if (date >= triodiOnStart) return 'preLenten';
  return 'ordinaryTime';
}

// ─── Day helpers ──────────────────────────────────────────────────────────────

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getDayOfWeek(date) {
  return DAYS[date.getUTCDay()];
}

// ─── Lenten calculations ──────────────────────────────────────────────────────

/**
 * Returns Clean Monday (first day of Great Lent) for a given year.
 * = Pascha − 48 days.
 */
function getCleanMonday(year) {
  return new Date(calculatePascha(year).getTime() - 48 * DAY_MS);
}

/**
 * Returns which week of Great Lent a date falls in (1–6),
 * or null if the date is not during Great Lent.
 *
 * Week 1 begins on Clean Monday (Monday–Sunday).
 * Week 6 ends on Palm Sunday (the last day before Holy Week).
 *
 * Examples (Pascha 2026 = Apr 12, Clean Monday = Feb 23):
 *   Feb 23 (Mon) → week 1
 *   Mar  7 (Sat) → week 2
 *   Apr  4 (Sat, Lazarus) → week 6
 *   Apr  5 (Sun, Palm Sunday) → week 6
 */
function getWeekOfLent(date) {
  if (getLiturgicalSeason(date) !== 'greatLent') return null;
  const year        = date.getUTCFullYear();
  const cleanMonday = getCleanMonday(year);
  const daysSince   = Math.floor((date - cleanMonday) / DAY_MS);
  return Math.floor(daysSince / 7) + 1;
}

/**
 * Returns which Lenten Saturday number (1–6) a given date is, or 0.
 *
 *   1 = Saturday of the Great Canon / St. Theodore the Tyrant
 *   2 = Soul Saturday 2 (Memorial Saturday)
 *   3 = Soul Saturday 3 (Memorial Saturday)
 *   4 = Soul Saturday 4 (Memorial Saturday)
 *   5 = 5th Saturday of Lent
 *   6 = Lazarus Saturday (Saturday before Palm Sunday)
 *
 * Examples (Pascha 2026 = Apr 12, Clean Monday = Feb 23):
 *   Feb 28 → 1  (St. Theodore)
 *   Mar  7 → 2  (Soul Saturday 2)
 *   Mar 14 → 3  (Soul Saturday 3)
 *   Mar 21 → 4  (Soul Saturday 4)
 *   Mar 28 → 5
 *   Apr  4 → 6  (Lazarus Saturday)
 */
function getLentenSaturdayNumber(date) {
  if (getDayOfWeek(date) !== 'saturday') return 0;
  if (getLiturgicalSeason(date) !== 'greatLent') return 0;

  const year        = date.getUTCFullYear();
  const cleanMonday = getCleanMonday(year);
  const daysSince   = Math.floor((date - cleanMonday) / DAY_MS);

  // First Lenten Saturday is always 5 days after Clean Monday (Mon+5 = Sat)
  const satNum = Math.floor((daysSince - 5) / 7) + 1;
  return (satNum >= 1 && satNum <= 6) ? satNum : 0;
}

/**
 * Returns true if the date is one of the three Memorial Saturdays of
 * Great Lent (Soul Saturdays 2, 3, and 4).
 */
function isSoulSaturday(date) {
  const n = getLentenSaturdayNumber(date);
  return n === 2 || n === 3 || n === 4;
}

/**
 * Returns a stable liturgical key for a date, independent of calendar year.
 * Used to key DB lookups so collected texts can be reused across years.
 *
 *   greatLent saturday 1     → 'lent.saturday.1'   (St. Theodore)
 *   greatLent saturday 2–4   → 'lent.soulSaturday.2' … 'lent.soulSaturday.4'
 *   greatLent saturday 5     → 'lent.saturday.5'
 *   greatLent saturday 6     → 'lent.lazarusSaturday'
 *   greatLent sunday 1–5     → 'lent.sunday.1' … 'lent.sunday.5'
 *   greatLent weekday        → 'lent.week.N.{dow}'
 *   holyWeek                 → 'holyWeek.{dow}'
 *
 * Returns null for dates without a stable liturgical key
 * (ordinary time, Pentecostarion, Bright Week, etc.).
 */
function getLiturgicalKey(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);

  if (season === 'greatLent') {
    const weekOfLent = getWeekOfLent(date);
    if (dow === 'saturday') {
      const satNum = getLentenSaturdayNumber(date);
      if (satNum === 6)               return 'lent.lazarusSaturday';
      if (satNum >= 2 && satNum <= 4) return `lent.soulSaturday.${satNum}`;
      return `lent.saturday.${satNum}`;
    }
    if (dow === 'sunday') return `lent.sunday.${weekOfLent}`;
    return `lent.week.${weekOfLent}.${dow}`;
  }

  if (season === 'preLenten') {
    const pascha = calculatePascha(date.getUTCFullYear());
    const diff   = Math.floor((date - pascha) / DAY_MS);
    if (diff === -70) return 'triodion.publicanPharisee';
    if (diff === -63) return 'triodion.prodigalSon';
    if (diff === -57) return 'triodion.meatfareSaturday';
    if (diff === -56) return 'triodion.meatfareSunday';
    if (diff === -49) return 'triodion.forgivenessSunday';
    // Other pre-Lenten days (ordinary Saturdays, weekdays) → no stable key
    return null;
  }

  if (season === 'holyWeek') {
    return `holyWeek.${dow}`;
  }

  if (season === 'brightWeek') {
    return `brightWeek.${dow}`;
  }

  if (season === 'pentecostarion') {
    const pascha = calculatePascha(date.getUTCFullYear());
    const diff   = Math.floor((date - pascha) / DAY_MS);
    if (diff === 39) return 'pentecostarion.ascension';
    if (diff === 49) return 'pentecostarion.pentecost';
    // week 2 = Thomas week, week 3 = Myrrhbearers, …, week 7 = Holy Fathers
    const week = Math.floor(diff / 7) + 1;
    return `pentecostarion.week.${week}.${dow}`;
  }

  return null;
}

// ─── Calendar entry generators ────────────────────────────────────────────────

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
  return {
    _meta: {
      generated:   true,
      generatedAt: new Date().toISOString(),
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
        totalStichera: 3,
        slots: [],   // server injects Menaion stichera at runtime
        glory: null, // server injects Menaion glory doxastichon
        now:   null, // server injects dismissal theotokion
      },
      prokeimenon: { pattern: 'weekday', weekday: dow },
      aposticha: {
        slots: [],   // server injects Menaion aposticha if available
        glory: null,
      },
      troparia: {
        slots: [],   // server injects Menaion troparion
      },
    },
  };
}

/**
 * Generates a Saturday Great Vespers entry for ordinary time.
 * Uses 6 resurrectional stichera from the Octoechos + dogmatikon.
 */
function generateOrdinaryTimeSaturday(dateStr, tone) {
  const tk = `tone${tone}`;
  return {
    _meta: {
      generated:   true,
      generatedAt: new Date().toISOString(),
      note:        `Auto-generated Saturday Great Vespers. Tone ${tone}. ` +
                   `Menaion commemorations not included.`,
    },
    date:      dateStr,
    dayOfWeek: 'saturday',
    liturgicalContext: { season: 'ordinaryTime', tone, toneSource: 'octoechosCycle' },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  'Great Vespers with Entrance (sung on Friday evening)',
      lordICall: {
        tone,
        totalStichera: 6,
        slots: [{
          verses: [6, 5, 4, 3, 2, 1],
          count:  6,
          source: 'octoechos',
          key:    `${tk}.saturday.vespers.lordICall.resurrectional`,
          tone,
          label:  'Resurrectional',
        }],
        glory: { source: 'octoechos', key: `${tk}.saturday.vespers.lordICall.glory`, tone, label: 'Theotokion' },
        now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`,      tone, label: 'Theotokion — Dogmatikon' },
      },
      prokeimenon: { pattern: 'weekday', weekday: 'saturdayGreatVespers' },
      aposticha: {
        slots: [
          { position: 1, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.0`, tone, label: 'Resurrectional (Idiomelon)' },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
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
      generatedAt: new Date().toISOString(),
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
            verses: [6, 5, 4],
            count:  3,
            source: 'triodion',
            key:    `${triKey}.lordICall.martyrs`,
            tone,
            label:  'For the Martyrs (in the Tone of the week)',
          },
          {
            // Menaion stichera would go here; use db fallback keyed by liturgical position
            verses: [3, 2, 1],
            count:  3,
            source: 'db',
            key:    `${litKey}.vespers.lordICall`,
            tone,
            label:  'For the Saints',
          },
        ],
        glory: { source: 'triodion', key: `${triKey}.lordICall.glory`, tone, label: 'For the Departed' },
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
      generatedAt: new Date().toISOString(),
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
      generatedAt: new Date().toISOString(),
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
      generatedAt: new Date().toISOString(),
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
      generatedAt: new Date().toISOString(),
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
      generatedAt: new Date().toISOString(),
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
        totalStichera: 6,
        slots: [
          { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', key: `${litKey}.vespers.lordICall`, tone, label: 'Stichera' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone },
        now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon' },
      },
      prokeimenon: { pattern: 'weekday', weekday: 'saturdayGreatVespers' },
      aposticha: {
        slots: [
          { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Sticheron' },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
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
 * Builds the prokeimenon spec for Lenten weekday Vespers.
 * Returns a lentenWithReadings spec with entries populated when data is available
 * in prokeimena.json `lenten` section; otherwise entries remain empty.
 */
function buildLentenProkeimenon(litKey) {
  // litKey = 'lent.week.N.dow'; convert to nested path 'lenten.week.N.dow'
  // prokeimena.json structure: lenten.week.N.dow.{genesis,proverbs}
  const parts = litKey.split('.');         // ['lent', 'week', 'N', 'dow']
  const nestedPath = `lenten.${parts.slice(1).join('.')}`;  // 'lenten.week.N.dow'
  return {
    pattern: 'lentenWithReadings',
    entries: [
      {
        order:  1,
        source: 'prokeimena',
        key:    `${nestedPath}.genesis`,
        tone:   null,   // resolved at runtime from source
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

/**
 * Generates a Lenten weekday Daily Vespers entry (Monday–Friday).
 * Lenten weekday vespers includes OT readings; variable hymns from the db.
 */
function generateLentenWeekday(dateStr, dayOfWeek, weekOfLent, tone, litKey) {
  return {
    _meta: {
      generated:   true,
      generatedAt: new Date().toISOString(),
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
function generateHolyWeekDay(dateStr, dow, litKey) {
  // Per-day service configuration
  const DAY_CONFIG = {
    sunday: {
      name:        'Palm Sunday',
      serviceType: 'dailyVespers',
      rubricNote:  'Palm Sunday — evening service (eve of Holy Monday)',
      prokeimenon: { pattern: 'weekday', weekday: 'sunday' },
    },
    monday: {
      name:        'Holy Monday',
      serviceType: 'dailyVespers',
      rubricNote:  'Holy Monday — Daily Vespers',
      prokeimenon: { pattern: 'weekday', weekday: 'monday' },
      apostichaGloryOnly: true,
    },
    tuesday: {
      name:        'Holy Tuesday',
      serviceType: 'dailyVespers',
      rubricNote:  'Holy Tuesday — Daily Vespers',
      prokeimenon: { pattern: 'weekday', weekday: 'tuesday' },
      apostichaGloryOnly: true,
    },
    wednesday: {
      name:        'Holy Wednesday',
      serviceType: 'dailyVespers',
      rubricNote:  'Holy Wednesday — Daily Vespers',
      prokeimenon: { pattern: 'weekday', weekday: 'wednesday' },
      apostichaGloryOnly: true,
    },
    thursday: {
      name:        'Great and Holy Thursday',
      serviceType: 'dailyVespers',
      rubricNote:  'Great and Holy Thursday — Vespers (primary morning service: Liturgy of St. Basil)',
      prokeimenon: { pattern: 'weekday', weekday: 'thursday' },
      apostichaGloryOnly: true,
    },
    friday: {
      name:        'Great and Holy Friday',
      serviceType: 'greatVespers',
      rubricNote:  'Great and Holy Friday — Burial Vespers with the Epitaphion',
      prokeimenon: { pattern: 'weekday', weekday: 'holyFriday' },
    },
    saturday: {
      name:        'Great and Holy Saturday',
      serviceType: 'greatVespers',
      rubricNote:  'Great and Holy Saturday — Great Vespers with the Liturgy of St. Basil',
      prokeimenon: { pattern: 'weekday', weekday: 'saturdayGreatVespers' },
    },
  };

  const cfg = DAY_CONFIG[dow] ?? {
    name:        `Holy Week ${dow}`,
    serviceType: 'dailyVespers',
    rubricNote:  `Holy Week ${dow}`,
    prokeimenon: { pattern: 'weekday', weekday: dow },
  };

  return {
    _meta: {
      generated:   true,
      generatedAt: new Date().toISOString(),
      note:        `Auto-generated ${cfg.name}. Variable texts (source:'db') keyed by '${litKey}'.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season: 'holyWeek' },
    commemorations: [],
    vespers: {
      serviceType: cfg.serviceType,
      rubricNote:  cfg.rubricNote,
      lordICall: {
        totalStichera: 6,
        slots: [
          { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', key: `${litKey}.vespers.lordICall`, label: 'Stichera' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory` },
        now:   { source: 'db', key: `${litKey}.vespers.lordICall.now`, label: 'Theotokion' },
      },
      prokeimenon: cfg.prokeimenon,
      // Holy Mon–Thu Presanctified: no separate Aposticha section (the LIC doxastichon serves both).
      // Holy Fri/Sat (Great Vespers): keep the full aposticha structure.
      aposticha: cfg.apostichaGloryOnly ? { slots: [] } : {
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
          { order: 1, source: 'db', key: `${litKey}.vespers.troparia` },
        ],
      },
    },
  };
}

/**
 * Generates a pre-Lenten (Triodion) Sunday Great Vespers entry.
 *
 * Sundays:  Publican & Pharisee, Prodigal Son, Meatfare, Forgiveness
 *           All use the Octoechos resurrectional stichera + Triodion
 *           aposticha/troparia from the DB.
 *
 * Meatfare Saturday: Soul Saturday — same structure as Lenten Soul Saturdays.
 */
function generatePreLentenDay(dateStr, dow, tone, litKey) {
  const NAMES = {
    'triodion.publicanPharisee':  'Sunday of the Publican and Pharisee',
    'triodion.prodigalSon':       'Sunday of the Prodigal Son',
    'triodion.meatfareSaturday':  'Meatfare Saturday — Memorial for All the Departed',
    'triodion.meatfareSunday':    'Meatfare Sunday — Judgment Sunday',
    'triodion.forgivenessSunday': 'Forgiveness Sunday (Cheesefare Sunday)',
  };
  const name = NAMES[litKey] || `Pre-Lenten ${dow}`;
  const tk = `tone${tone}`;

  // ── Meatfare Saturday — Soul Saturday structure ─────────────────────────
  if (litKey === 'triodion.meatfareSaturday') {
    return {
      _meta: { generated: true, generatedAt: new Date().toISOString(),
               note: `Auto-generated ${name}. Variable texts (source:'db') keyed by '${litKey}'.` },
      date: dateStr, dayOfWeek: 'saturday',
      liturgicalContext: { season: 'preLenten', tone, toneSource: 'octoechosCycle' },
      commemorations: [],
      vespers: {
        serviceType: 'greatVespers',
        rubricNote: `${name} — Great Vespers (sung on Friday evening)`,
        lordICall: {
          tone,
          totalStichera: 6,
          slots: [{ verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', key: `${litKey}.vespers.lordICall`, tone, label: 'Stichera' }],
          glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone },
          now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Dogmatikon' },
        },
        prokeimenon: { pattern: 'soulSaturday' },
        aposticha: {
          slots: [
            { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Sticheron' },
            { position: 2, repeatPrevious: true },
            { position: 3, repeatPrevious: true },
          ],
          glory: { source: 'db', key: `${litKey}.vespers.aposticha.glory`, tone },
          now:   { source: 'db', key: `${litKey}.vespers.aposticha.now`,   tone, label: 'Theotokion' },
        },
        troparia: {
          source: 'db',
          slots: [
            { order: 1,          tone, source: 'db', key: `${litKey}.vespers.troparia` },
            { position: 'glory', tone, source: 'db', key: `${litKey}.vespers.troparia` },
            { position: 'now',   tone, source: 'db', key: `${litKey}.vespers.troparia.now`   },
          ],
        },
      },
    };
  }

  // ── Triodion Sundays — Great Vespers ────────────────────────────────────
  return {
    _meta: { generated: true, generatedAt: new Date().toISOString(),
             note: `Auto-generated ${name}. Tone ${tone}. Variable texts (source:'db') keyed by '${litKey}'.` },
    date: dateStr, dayOfWeek: 'sunday',
    liturgicalContext: { season: 'preLenten', tone, toneSource: 'octoechosCycle' },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote: `${name} — Great Vespers (sung on Saturday evening)`,
      lordICall: {
        tone,
        totalStichera: 6,
        slots: [
          { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', key: `${litKey}.vespers.lordICall`, tone, label: 'Stichera' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone },
        now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Dogmatikon' },
      },
      prokeimenon: { pattern: 'weekday', weekday: 'saturdayGreatVespers' },
      aposticha: {
        slots: [
          { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Sticheron' },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.aposticha.glory`, tone },
        now:   { source: 'db', key: `${litKey}.vespers.aposticha.now`,   tone, label: 'Theotokion' },
      },
      troparia: {
        source: 'db',
        slots: [
          { order: 1,          tone, source: 'db', key: `${litKey}.vespers.troparia` },
          { position: 'glory', tone, source: 'db', key: `${litKey}.vespers.troparia.glory` },
          { position: 'now',   tone, source: 'octoechos', key: `${tk}.saturday.vespers.dismissalTheotokion`, label: 'Dismissal Theotokion' },
        ],
      },
    },
  };
}

/**
 * Generates a Bright Week day entry.
 * All services during Bright Week use Paschal texts sourced from the DB.
 */
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
      generatedAt: new Date().toISOString(),
      note:        `Auto-generated ${name}. Variable texts (source:'db') keyed by '${litKey}'.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season: 'brightWeek' },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  `${name} — Paschal Vespers`,
      lordICall: {
        totalStichera: 6,
        slots: [
          { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', key: `${litKey}.vespers.lordICall`, label: 'Stichera' },
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
      aposticha: {
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

/**
 * Generates a Pentecostarion day entry.
 *
 * Saturdays:  reuse ordinary-time Great Vespers (Octoechos resurrectionals).
 * Sundays + Ascension + Pentecost: Great Vespers with Pentecostarion texts.
 * Regular weekdays (Mon–Fri): Daily Vespers with weekday prokeimenon.
 *
 * Special prokeimena:
 *   - Thomas Sunday, Pentecost: "Who is so great a God" (Tone 7) — great.whoIsSoGreat
 *   - Ascension: "Our God is in heaven" (Tone 7)              — great.ourGodIsInHeaven
 *   - Other named-feast Sundays: Saturday Great Prokeimenon
 *   - Regular weekdays: weekday prokeimenon by day of week
 */
function generatePentecostarionDay(dateStr, dow, tone, litKey) {
  // ── Saturday: ordinary-time Great Vespers ──────────────────────────────────
  if (dow === 'saturday') {
    const entry = generateOrdinaryTimeSaturday(dateStr, tone);
    entry.liturgicalContext.season = 'pentecostarion';
    entry._meta.note = entry._meta.note.replace('ordinaryTime', 'pentecostarion');
    return entry;
  }

  // ── Named feast labels ──────────────────────────────────────────────────────
  const FEAST_NAMES = {
    'pentecostarion.week.2.sunday': 'Thomas Sunday (Antipascha)',
    'pentecostarion.week.3.sunday': 'Sunday of the Myrrhbearers',
    'pentecostarion.week.4.sunday': 'Sunday of the Paralytic',
    'pentecostarion.week.5.sunday': 'Sunday of the Samaritan Woman',
    'pentecostarion.week.6.sunday': 'Sunday of the Blind Man',
    'pentecostarion.week.7.sunday': 'Sunday of the Holy Fathers',
    'pentecostarion.ascension':     'The Ascension of our Lord',
    'pentecostarion.pentecost':     'Holy Pentecost',
  };

  const name = FEAST_NAMES[litKey] || `Pentecostarion (${dow})`;

  // ── Service type: Great Vespers for Sundays and named feasts ───────────────
  const isNamedFeast = litKey in FEAST_NAMES;
  const isGreat      = dow === 'sunday' || isNamedFeast;
  const serviceType  = isGreat ? 'greatVespers' : 'dailyVespers';
  const tk           = `tone${tone}`;

  // ── Prokeimenon ────────────────────────────────────────────────────────────
  // Thomas Sunday and Pentecost use "Who is so great a God" (great prokeimenon)
  // Ascension uses "Our God is in heaven" (great prokeimenon)
  // Other Sundays / named feasts: Saturday Great Prokeimenon (from Octoechos)
  // Regular weekdays: appointed weekday prokeimenon
  let prokeimenon;
  if (litKey === 'pentecostarion.week.2.sunday' || litKey === 'pentecostarion.pentecost') {
    prokeimenon = { pattern: 'great', key: 'whoIsSoGreat' };
  } else if (litKey === 'pentecostarion.ascension') {
    prokeimenon = { pattern: 'great', key: 'ourGodIsInHeaven' };
  } else if (isGreat) {
    prokeimenon = { pattern: 'weekday', weekday: 'saturdayGreatVespers' };
  } else {
    prokeimenon = { pattern: 'weekday', weekday: dow };
  }

  // ── Lord I Call stichera slots ────────────────────────────────────────────
  // Weeks 4-7 Sundays have feast-specific stichera in the DB (scraped from
  // L'vov-Bakhmetev PDFs). The remaining verses use resurrectional stichera
  // from the Octoechos. Other named feasts (Thomas, Myrrhbearers, Ascension,
  // Pentecost) use all 6 resurrectional stichera from the Octoechos.
  const FEAST_STICHERA_COUNT = {
    'pentecostarion.week.4.sunday': 2,  // Paralytic
    'pentecostarion.week.5.sunday': 3,  // Samaritan Woman
    'pentecostarion.week.6.sunday': 2,  // Blind Man
    'pentecostarion.week.7.sunday': 4,  // Holy Fathers
  };
  const feastCount  = FEAST_STICHERA_COUNT[litKey] || 0;
  const resCount    = 6 - feastCount;
  const allVerses   = [6, 5, 4, 3, 2, 1];
  const licSlots    = [];
  if (resCount > 0) {
    licSlots.push({
      verses: allVerses.slice(0, resCount), count: resCount,
      source: 'octoechos', key: `${tk}.saturday.vespers.lordICall.resurrectional`,
      tone, label: 'Resurrectional',
    });
  }
  if (feastCount > 0) {
    licSlots.push({
      verses: allVerses.slice(resCount), count: feastCount,
      source: 'db', key: `${litKey}.vespers.lordICall`,
      tone, label: 'Stichera',
    });
  }

  // Glory: feast doxastichon from DB (weeks 4-7) or Octoechos glory
  const licGlory = feastCount > 0
    ? { source: 'db',       key: `${litKey}.vespers.lordICall.glory`,             tone }
    : { source: 'octoechos', key: `${tk}.saturday.vespers.lordICall.glory`,        tone };

  // Dogmatikon always sung at "Now and ever" in Great Vespers
  const nowSlot = { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon' };

  // Aposticha: idiomelon from Octoechos, feast glory from DB (if available),
  // theotokion from Octoechos
  const apostichaGlory = feastCount > 0
    ? { source: 'db',        key: `${litKey}.vespers.aposticha.glory`, tone }
    : null;

  return {
    _meta: {
      generated:   true,
      generatedAt: new Date().toISOString(),
      note:        `Auto-generated ${name}. Tone ${tone}. Variable texts (source:'db') keyed by '${litKey}'.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season: 'pentecostarion', tone, toneSource: 'octoechosCycle' },
    commemorations: [],
    vespers: {
      serviceType,
      rubricNote: name,
      lordICall: {
        tone,
        totalStichera: 6,
        slots:  licSlots,
        glory:  licGlory,
        now:    nowSlot,
      },
      prokeimenon,
      aposticha: {
        slots: [
          { position: 1, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.0`, tone, label: 'Aposticha' },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
        ],
        ...(apostichaGlory ? { glory: apostichaGlory } : {}),
        now: { source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.theotokion`, tone, label: 'Theotokion' },
      },
      troparia: {
        slots: (() => {
          // Hard-coded: which feasts have a feast troparion in the DB
          const DB_ONLY_TROPARION  = new Set(['pentecostarion.week.2.sunday', 'pentecostarion.week.3.sunday', 'pentecostarion.ascension', 'pentecostarion.pentecost']);
          const DB_GLORY_TROPARION = new Set(['pentecostarion.week.7.sunday']); // resurrectional + DB at Glory
          const dbKey    = `${litKey}.vespers.troparia`;
          const dismissal = { position: 'now', tone, source: 'octoechos', key: `${tk}.saturday.vespers.dismissalTheotokion`, label: 'Dismissal Theotokion' };
          if (DB_ONLY_TROPARION.has(litKey)) {
            return [
              { order: 1,          tone, source: 'db',       key: dbKey,                                     label: 'Troparion' },
              dismissal,
            ];
          }
          if (DB_GLORY_TROPARION.has(litKey)) {
            return [
              { order: 1,          tone, source: 'octoechos', key: `${tk}.saturday.vespers.troparion`, label: 'Resurrectional Troparion' },
              { position: 'glory', tone, source: 'db',        key: dbKey,                              label: 'Feast Troparion' },
              dismissal,
            ];
          }
          // Weeks 4-6: resurrectional troparion from Octoechos only
          return [
            { order: 1, tone, source: 'octoechos', key: `${tk}.saturday.vespers.troparion`, label: 'Resurrectional Troparion' },
            dismissal,
          ];
        })(),
      },
    },
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generates a calendar entry object for a given date, or returns null
 * if the date/season is not yet supported.
 *
 * @param {string} dateStr  "YYYY-MM-DD"
 * @returns {Object|null}
 */
function generateCalendarEntry(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date   = new Date(Date.UTC(year, month - 1, day));
  const dow    = getDayOfWeek(date);
  const season = getLiturgicalSeason(date);
  const tone   = getTone(date);
  const litKey = getLiturgicalKey(date);

  // ── Ordinary time ──────────────────────────────────────────────────────────
  if (season === 'ordinaryTime') {
    if (dow === 'saturday') return generateOrdinaryTimeSaturday(dateStr, tone);
    return generateOrdinaryTimeWeekday(dateStr, dow, tone);
  }

  // ── Great Lent ─────────────────────────────────────────────────────────────
  if (season === 'greatLent') {
    const weekOfLent = getWeekOfLent(date);

    if (dow === 'saturday') {
      const satNum = getLentenSaturdayNumber(date);
      if (isSoulSaturday(date)) {
        return generateSoulSaturday(dateStr, satNum, tone, litKey);
      }
      return generateLentenSaturday(dateStr, satNum, weekOfLent, tone, litKey);
    }

    if (dow === 'sunday') {
      return generateLentenSunday(dateStr, weekOfLent, tone, litKey);
    }

    // Monday–Friday: Lenten Daily Vespers
    return generateLentenWeekday(dateStr, dow, weekOfLent, tone, litKey);
  }

  // ── Pre-Lenten (Triodion: Publican & Pharisee through Forgiveness Sunday) ─
  if (season === 'preLenten') {
    // Named Triodion days have liturgical keys and full DB texts
    if (litKey) return generatePreLentenDay(dateStr, dow, tone, litKey);

    // Ordinary Saturdays in the Triodion use the same Octoechos structure
    if (dow === 'saturday') {
      const entry = generateOrdinaryTimeSaturday(dateStr, tone);
      entry.liturgicalContext.season = 'preLenten';
      return entry;
    }

    // Weekdays: same structure as ordinary-time Daily Vespers
    const entry = generateOrdinaryTimeWeekday(dateStr, dow, tone);
    entry.liturgicalContext.season = 'preLenten';
    return entry;
  }

  // ── Holy Week ──────────────────────────────────────────────────────────────
  if (season === 'holyWeek') {
    return generateHolyWeekDay(dateStr, dow, litKey);
  }

  // ── Bright Week (Pascha through the following Saturday) ───────────────────
  if (season === 'brightWeek') {
    return generateBrightWeekDay(dateStr, dow, litKey);
  }

  // ── Pentecostarion (Thomas Sunday through eve of All Saints) ──────────────
  if (season === 'pentecostarion') {
    return generatePentecostarionDay(dateStr, dow, tone, litKey);
  }

  // ── Not yet supported ──────────────────────────────────────────────────────
  // preLenten → return null
  return null;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  calculatePascha,
  getAllSaints,
  getLiturgicalSeason,
  getTone,
  getDayOfWeek,
  getWeekOfLent,
  getLentenSaturdayNumber,
  isSoulSaturday,
  getLiturgicalKey,
  generateCalendarEntry,
};
