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
  // Tone 1 begins the Sunday AFTER All Saints, not All Saints itself
  let anchor = new Date(getAllSaints(year).getTime() + 7 * DAY_MS);
  if (date < anchor) anchor = new Date(getAllSaints(year - 1).getTime() + 7 * DAY_MS);

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
  const tk = `tone${tone}`;
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
        totalStichera: 6,
        slots: [
          // 3 Octoechos stichera (tone of the week, day of the week)
          // Server may reduce count when Menaion stichera are available
          { verses: [6, 5, 4], count: 3, source: 'octoechos', key: `${tk}.${dow}.vespers.lordICall`, tone, label: 'Octoechos' },
        ],
        glory: null, // server injects Menaion glory doxastichon
        now:   null, // server injects theotokion
      },
      prokeimenon: { pattern: 'weekday', weekday: dow },
      aposticha: {
        slots: [
          { position: 1, source: 'octoechos', key: `${tk}.${dow}.vespers.aposticha.hymns.0`, tone, label: 'Aposticha' },
          { position: 2, source: 'octoechos', key: `${tk}.${dow}.vespers.aposticha.hymns.1`, tone, label: 'Aposticha' },
          { position: 3, source: 'octoechos', key: `${tk}.${dow}.vespers.aposticha.hymns.2`, tone, label: 'Aposticha' },
        ],
        glory: null, // server injects Menaion glory if available
        now:   { source: 'octoechos', key: `${tk}.${dow}.vespers.aposticha.theotokion`, tone, label: 'Theotokion' },
      },
      troparia: {
        slots: [],   // server injects Menaion troparion
      },
    },
  };
}

/**
 * Generates a Great Vespers entry for a fixed-calendar Great Feast falling on a weekday.
 * All stichera come from the feast (injected from DB by server.js at runtime).
 * The feast key is used to identify the feast for the Liturgy assembler.
 */
function generateGreatFeastVespers(dateStr, dow, tone, feastKey) {
  return {
    _meta: {
      generated:   true,
      generatedAt: new Date().toISOString(),
      note:        `Auto-generated All-Night Vigil — Great Vespers (${feastKey}). Tone ${tone}.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season: 'ordinaryTime', tone, toneSource: 'octoechosCycle', greatFeast: feastKey },
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
      prokeimenon: { pattern: 'weekday', weekday: dow === 'saturday' ? 'saturdayGreatVespers' : dow },
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
 * Generates an All-Night Vigil entry for a vigil-rank saint (non-great-feast).
 * Uses 8 stichera at Lord I Call (vs 6 for ordinary days).
 */
function generateVigilFeastVespers(dateStr, dow, tone) {
  return {
    _meta: {
      generated:   true,
      generatedAt: new Date().toISOString(),
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
      prokeimenon: { pattern: 'weekday', weekday: dow === 'saturday' ? 'saturdayGreatVespers' : dow },
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
        // Tone 5 has no resurrectional doxastichon — combine Glory+Now into the dogmatikon directly.
        // All other tones have a glory doxastichon followed by a separate Now+dogmatikon.
        ...(tone === 5 ? {
          glory: { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon', combinesGloryNow: true },
        } : {
          glory: { source: 'octoechos', key: `${tk}.saturday.vespers.lordICall.glory`, tone, label: 'Resurrectional Doxastichon' },
          now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`,      tone, label: 'Theotokion — Dogmatikon' },
        }),
      },
      prokeimenon: { pattern: 'weekday', weekday: 'saturdayGreatVespers' },
      aposticha: {
        slots: [
          { position: 1, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.0`, tone, label: 'Resurrectional Sticheron 1' },
          { position: 2, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.1`, tone, label: 'Resurrectional Sticheron 2' },
          { position: 3, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.2`, tone, label: 'Resurrectional Sticheron 3' },
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
        totalStichera: 10,
        slots: [
          { verses: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], count: 10, source: 'db', key: `${litKey}.vespers.lordICall`, tone, label: 'Stichera' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone },
        now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon' },
      },
      prokeimenon: { pattern: 'weekday', weekday: 'saturdayGreatVespers' },
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
      name:        'Palm Sunday — The Entry of our Lord into Jerusalem',
      serviceType: 'greatVespers',
      rubricNote:  'Great Vespers of Palm Sunday (celebrated Saturday evening)',
      prokeimenon: { pattern: 'weekday', weekday: 'saturdayGreatVespers' },
      customPalmSunday: true,
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
      serviceKey:  'burialVespers',
      rubricNote:  'Great and Holy Friday — Burial Vespers with the Epitaphion',
      prokeimenon: {
        pattern: 'burialVespers',
        readings: [
          {
            order: 1, book: 'Exodus', pericope: '33:11–23', label: 'First Reading',
            prokeimenon: {
              tone: 4,
              refrain: 'They divide my garments among them, and for my raiment they cast lots.',
              verses: [{ text: 'My God, my God, look upon me! Why hast Thou forsaken me?' }],
              psalmRef: 'Ps. 21:18',
            },
          },
          {
            order: 2, book: 'Job', pericope: '42:12–17', label: 'Second Reading',
            prokeimenon: {
              tone: 4,
              refrain: 'Judge, O Lord, those who wrong me; fight against those who fight against me!',
              verses: [{ text: 'They rewarded me evil for good; my soul is forlorn.' }],
              psalmRef: 'Ps. 34:1',
            },
          },
          { order: 3, book: 'Isaiah', pericope: '52:13–54:1', label: 'Third Reading' },
        ],
        epistle: {
          book: 'I Corinthians', pericope: '1:18–2:2',
          prokeimenon: {
            tone: 6,
            refrain: 'They have laid me in the depths of the pit, in the regions dark and deep.',
            verses: [{ text: 'O Lord God of my salvation, I call for help by day; I cry out in the night before Thee.' }],
            psalmRef: 'Ps. 87:6',
          },
          alleluia: {
            tone: 1,
            verses: [
              { text: 'Save me, O God; for the waters have come up to my soul.' },
              { text: 'They gave me gall for food, and in my thirst they gave me vinegar to drink.' },
              { text: 'Let their eyes be darkened, so that they cannot see!' },
            ],
          },
        },
        gospel: {
          book: 'Matthew/Luke/John',
          pericope: 'Matt. 27:1–38; Lk. 23:39–43; Matt. 27:39–54; Jn. 19:31–37; Matt. 27:55–61',
          label: 'The Composite Gospel of the Burial',
          preGospelResponse: 'Glory to Thy passion, O Lord.',
          postGospelResponse: 'Glory to Thy longsuffering, O Lord.',
        },
      },
      customCalendarEntry: true,
      dismissal: {
        opening: 'holyFriday',
      },
    },
    saturday: {
      name:        'Great and Holy Saturday',
      serviceType: 'greatVespers',
      rubricNote:  'Great and Holy Saturday — Great Vespers with the Liturgy of St. Basil',
      prokeimenon: { pattern: 'weekday', weekday: 'saturdayGreatVespers' },
      apostichaGloryOnly: true,  // no aposticha (service flows directly into Liturgy of St. Basil)
      troparia: {
        source: 'triodion',
        slots: [
          { order: 1,          source: 'triodion', key: 'holyWeek.saturday.troparia.nobleJoseph',  tone: 2, label: 'Troparion of Holy Saturday' },
          { position: 'glory', source: 'triodion', key: 'holyWeek.saturday.troparia.whenThouDidst', tone: 2, label: 'Troparion of Holy Saturday' },
          { position: 'now',   source: 'triodion', key: 'holyWeek.saturday.troparia.theotokion',    tone: 2, label: 'Theotokion' },
        ],
      },
    },
  };

  const cfg = DAY_CONFIG[dow] ?? {
    name:        `Holy Week ${dow}`,
    serviceType: 'dailyVespers',
    rubricNote:  `Holy Week ${dow}`,
    prokeimenon: { pattern: 'weekday', weekday: dow },
  };

  // ── Holy Friday: fully wired from triodion JSON ─────────────────────────
  if (cfg.customCalendarEntry) {
    const triKey = 'holyWeek.friday';
    return {
      _meta: {
        generated:   true,
        generatedAt: new Date().toISOString(),
        note:        `Auto-generated ${cfg.name}. All texts from triodion/${triKey}.`,
      },
      date:      dateStr,
      dayOfWeek: dow,
      liturgicalContext: { season: 'holyWeek' },
      commemorations: [],
      vespers: {
        serviceType: cfg.serviceType,
        serviceKey:  cfg.serviceKey,
        rubricNote:  cfg.rubricNote,
        lordICall: {
          totalStichera: 6,
          slots: [
            { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'triodion', key: `${triKey}.lordICall.stichera`, label: 'Stichera of the Cross' },
          ],
          glory: { source: 'triodion', key: `${triKey}.lordICall.glory`, tone: 6 },
          now:   { source: 'triodion', key: `${triKey}.lordICall.now`, tone: 6, label: 'Theotokion' },
        },
        prokeimenon: cfg.prokeimenon,
        aposticha: {
          slots: [
            { position: 1, source: 'triodion', key: `${triKey}.aposticha.stichera.0`, tone: 2, label: 'Automelon' },
            { position: 2, source: 'triodion', key: `${triKey}.aposticha.stichera.1`, tone: 2, label: 'Automelon',
              verse: 'The Lord is King; He is robed in majesty!' },
            { position: 3, source: 'triodion', key: `${triKey}.aposticha.stichera.2`, tone: 2, label: 'Automelon',
              verse: 'For He has established the world, so that it shall never be moved.' },
            { position: 4, source: 'triodion', key: `${triKey}.aposticha.stichera.3`, tone: 2, label: 'Automelon',
              verse: 'Holiness befits Thy house, O Lord, forevermore!' },
          ],
          glory: { source: 'triodion', key: `${triKey}.aposticha.gloryNow`, tone: 5, combinesGloryNow: true, label: 'Doxastichon' },
        },
        troparia: {
          source: 'triodion',
          slots: [
            { order: 1,          source: 'triodion', key: `${triKey}.troparia.nobleJoseph`,  tone: 2, label: 'Troparion of Holy Saturday' },
            { position: 'glory', source: 'triodion', key: `${triKey}.troparia.nobleJoseph`,  tone: 2, label: 'Troparion of Holy Saturday' },
            { position: 'now',   source: 'triodion', key: `${triKey}.troparia.angelCame`,    tone: 2, label: 'Troparion' },
          ],
        },
        dismissal: {
          opening: 'holyFriday',
          saints: [],
        },
        epitaphion: {
          source: 'triodion',
          key: `${triKey}.epitaphion`,
        },
      },
    };
  }

  // ── Palm Sunday: fully wired from triodion JSON ────────────────────────
  if (cfg.customPalmSunday) {
    const triKey = 'holyWeek.palmSunday';
    return {
      _meta: {
        generated:   true,
        generatedAt: new Date().toISOString(),
        note:        `Auto-generated ${cfg.name}. All texts from triodion/${triKey}.`,
      },
      date:      dateStr,
      dayOfWeek: dow,
      liturgicalContext: { season: 'holyWeek', specialDay: 'palmSunday' },
      commemorations: [],
      vespers: {
        serviceType: cfg.serviceType,
        rubricNote:  cfg.rubricNote,
        lordICall: {
          tone: 6,
          totalStichera: 10,
          slots: [
            { verses: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], count: 10, source: 'triodion', key: `${triKey}.lordICall.stichera`, tone: 6, label: 'Stichera for Palm Sunday' },
          ],
          glory: { source: 'triodion', key: `${triKey}.lordICall.glory`, tone: 6, combinesGloryNow: true, label: 'Glory and Now' },
        },
        prokeimenon: cfg.prokeimenon,
        aposticha: {
          slots: [
            { position: 1, source: 'triodion', key: `${triKey}.aposticha.stichera.0`, tone: 8 },
            { position: 2, source: 'triodion', key: `${triKey}.aposticha.stichera.1`, tone: 8,
              verse: 'Out of the mouths of babes and infants Thou hast fashioned perfect praise!' },
            { position: 3, source: 'triodion', key: `${triKey}.aposticha.stichera.2`, tone: 8,
              verse: 'O Lord, our Lord, how glorious is Thy Name in all the earth!' },
          ],
          glory: { source: 'triodion', key: `${triKey}.aposticha.gloryNow`, tone: 6, combinesGloryNow: true, label: 'Glory and Now' },
        },
        troparia: {
          source: 'triodion',
          slots: [
            { order: 1,          source: 'triodion', key: `${triKey}.troparia.lazarus`,  tone: 1, label: 'Troparion' },
            { position: 'glory', source: 'triodion', key: `${triKey}.troparia.lazarus`,  tone: 1, label: 'Troparion' },
            { position: 'now',   source: 'triodion', key: `${triKey}.troparia.baptism`,  tone: 4, label: 'Troparion' },
          ],
        },
      },
    };
  }

  // ── Generic Holy Week day (Mon–Thu, Sat) ─────────────────────────────────
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
      // Holy Sat (Great Vespers): aposticha omitted (flows into Liturgy of St. Basil).
      aposticha: cfg.apostichaGloryOnly ? { slots: [] } : {
        slots: [
          { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, label: 'Sticheron' },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.aposticha.now`, combinesGloryNow: true, label: 'Theotokion' },
      },
      troparia: cfg.troparia ? cfg.troparia
        : {
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
    'pentecostarion.week.2.sunday': 6,  // Thomas Sunday — all feast stichera, no resurrectional
    'pentecostarion.week.3.sunday': 4,  // Myrrhbearers — 4 feast + 2 resurrectional
    'pentecostarion.week.4.sunday': 2,  // Paralytic
    'pentecostarion.week.5.sunday': 3,  // Samaritan Woman
    'pentecostarion.week.6.sunday': 2,  // Blind Man
    'pentecostarion.week.7.sunday': 4,  // Holy Fathers
    'pentecostarion.ascension':     6,  // Ascension — all feast stichera
    'pentecostarion.pentecost':     6,  // Pentecost — all feast stichera
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

  // Glory: feast doxastichon from DB (weeks 4-7), or Octoechos glory.
  // Tone 5 has no resurrectional doxastichon — combine Glory+Now into the dogmatikon.
  const licGlory = feastCount > 0
    ? { source: 'db',        key: `${litKey}.vespers.lordICall.glory`,          tone }
    : tone === 5
      ? { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`,        tone, label: 'Theotokion — Dogmatikon', combinesGloryNow: true }
      : { source: 'octoechos', key: `${tk}.saturday.vespers.lordICall.glory`,   tone };

  // "Now and ever": major feasts use the DB theotokion; mixed Sundays use dogmatikon
  const DB_FULL_LIC = new Set([
    'pentecostarion.week.2.sunday', 'pentecostarion.ascension', 'pentecostarion.pentecost',
  ]);
  const nowSlot = DB_FULL_LIC.has(litKey)
    ? { source: 'db', key: `${litKey}.vespers.lordICall.now`, tone, label: 'Theotokion' }
    : { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon' };

  // Aposticha: for major feasts (feastCount === 6) all aposticha come from DB;
  // for mixed services, use Octoechos idiomelon with feast glory from DB.
  const DB_FULL_APOSTICHA = new Set([
    'pentecostarion.week.2.sunday',   // Thomas Sunday
    'pentecostarion.ascension',        // Ascension
    'pentecostarion.pentecost',        // Pentecost
  ]);
  const useDbAposticha = DB_FULL_APOSTICHA.has(litKey);
  const apostichaGlory = feastCount > 0
    ? { source: 'db',        key: `${litKey}.vespers.aposticha.glory`, tone }
    : null;

  // Build aposticha slots
  const apostichaSlots = useDbAposticha
    ? [
        { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Sticheron' },
        { position: 2, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Sticheron' },
        { position: 3, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Sticheron' },
      ]
    : [
        { position: 1, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.0`, tone, label: 'Aposticha' },
        { position: 2, repeatPrevious: true },
        { position: 3, repeatPrevious: true },
      ];
  const apostichaNow = useDbAposticha
    ? { source: 'db', key: `${litKey}.vespers.aposticha.now`, tone, label: 'Theotokion' }
    : { source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.theotokion`, tone, label: 'Theotokion' };

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
        slots: apostichaSlots,
        ...(apostichaGlory ? { glory: apostichaGlory } : {}),
        now: apostichaNow,
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

  // ── Fixed-calendar Great Feasts override season logic ────────────────────
  // These feasts always get an All-Night Vigil regardless of what day they fall on.
  // Moveable feasts (Palm Sunday, Ascension, Pentecost) are handled by their
  // own season generators below.
  const feastKey = getGreatFeastKey(date);
  if (feastKey && !['palmSunday', 'ascension', 'pentecost', 'pascha'].includes(feastKey)) {
    return generateGreatFeastVespers(dateStr, dow, tone, feastKey);
  }

  // ── Vigil-rank saints override ordinary day logic ──────────────────────────
  // These feasts get an All-Night Vigil with Litya and Blessing of Bread.
  const feastRank = getFeastRank(date);
  if (feastRank === 'vigil') {
    return generateVigilFeastVespers(dateStr, dow, tone);
  }

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

// ─── Liturgy variant ──────────────────────────────────────────────────────────

/**
 * Returns the liturgy variant ('basil' or 'chrysostom') for a given date.
 *
 * Basil occasions (OCA Typikon):
 *   - January 1 (Feast of St. Basil the Great)
 *   - Five Sundays of Great Lent (weeks 1–5; Palm Sunday = week 6 → Chrysostom)
 *   - Great Thursday and Great Saturday (Holy Week)
 *   - Eve of Nativity (Dec 24) and Eve of Theophany (Jan 5)
 *
 * Note: when the eves of Nativity or Theophany fall on Sunday or Monday,
 * the Liturgy of Basil transfers to the feast day itself. That edge case
 * is not yet handled here.
 */
function getLiturgyVariant(date) {
  const month  = date.getUTCMonth() + 1;
  const day    = date.getUTCDate();
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);

  if (month === 1  && day === 1)  return 'basil';   // St. Basil's Day
  if (month === 12 && day === 24) return 'basil';   // Eve of Nativity
  if (month === 1  && day === 5)  return 'basil';   // Eve of Theophany

  if (season === 'greatLent' && dow === 'sunday') {
    const week = getWeekOfLent(date);
    if (week >= 1 && week <= 5) return 'basil';
  }

  if (season === 'holyWeek' && (dow === 'thursday' || dow === 'saturday')) {
    return 'basil';
  }

  return 'chrysostom';
}

// ─── Trisagion substitution ───────────────────────────────────────────────────

/**
 * Returns the Trisagion substitution type for a given date at the Divine Liturgy.
 *
 *   'cross'      → "Before Thy Cross, we bow down in worship…"
 *                   (Sunday of the Holy Cross; Elevation of the Cross, Sep 14)
 *   'baptismal'  → "As many as have been baptized into Christ, have put on Christ."
 *                   (Nativity Dec 25; Theophany Jan 6; Lazarus Saturday; Great Saturday)
 *   'typical'    → "Holy God, Holy Mighty, Holy Immortal, have mercy on us."
 */
function getTrisagionSubstitution(date) {
  const month  = date.getUTCMonth() + 1;
  const day    = date.getUTCDate();
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);

  // Sunday of the Holy Cross — 3rd Sunday of Great Lent
  if (season === 'greatLent' && dow === 'sunday' && getWeekOfLent(date) === 3) return 'cross';

  // Elevation of the Holy Cross — Sep 14
  if (month === 9 && day === 14) return 'cross';

  // Nativity of Christ — Dec 25
  if (month === 12 && day === 25) return 'baptismal';

  // Theophany — Jan 6
  if (month === 1 && day === 6) return 'baptismal';

  // Lazarus Saturday — 6th Lenten Saturday
  if (season === 'greatLent' && dow === 'saturday' && getLentenSaturdayNumber(date) === 6) {
    return 'baptismal';
  }

  // Great Saturday
  if (season === 'holyWeek' && dow === 'saturday') return 'baptismal';

  return 'typical';
}

// ─── Liturgy availability ─────────────────────────────────────────────────────

/**
 * Returns true for dates where the Divine Liturgy is typically served.
 *
 * Covers:
 *   - All Sundays
 *   - Bright Week (all days)
 *   - Great Lent: all Saturdays (Soul Saturdays, St. Theodore, Akathist, Lazarus)
 *   - Holy Week: Great Thursday and Great Saturday
 *   - Ascension Thursday (Pascha + 39 days)
 *   - The 12 Great Feasts on fixed calendar dates
 */
function isLiturgyServed(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  const month  = date.getUTCMonth() + 1;
  const day    = date.getUTCDate();

  // Great Feasts always have liturgy, even during Lent (e.g. Annunciation Mar 25)
  const GREAT_FEASTS = new Set([
    '1-6',   '2-2',   '3-25',  '6-24',  '6-29',
    '8-6',   '8-15',  '9-8',   '9-14',  '11-21',  '12-25',
  ]);
  if (GREAT_FEASTS.has(`${month}-${day}`)) return true;

  // Great Lent weekdays: no full liturgy (Mon/Tue/Thu = nothing; Wed/Fri = Presanctified)
  if (season === 'greatLent' && dow !== 'saturday' && dow !== 'sunday') return false;

  // Holy Week: Mon-Wed = no full liturgy; Friday = no liturgy
  if (season === 'holyWeek') {
    if (['monday', 'tuesday', 'wednesday', 'friday'].includes(dow)) return false;
  }

  // Everything else: liturgy is served
  return true;
}

// ─── Great Feast identification ───────────────────────────────────────────────

/**
 * Returns a feast key string if the date is a Great Feast, or null otherwise.
 *
 * Feasts of the Lord (have special antiphons, entrance hymn):
 *   nativity, theophany, meeting, transfiguration, elevation,
 *   palmSunday, ascension, pentecost
 *
 * Feasts of the Theotokos (typical antiphons, but unique megalynarion):
 *   nativityTheotokos, entryTheotokos, annunciation, dormition
 *
 * Not classified as Great Feasts for antiphon purposes:
 *   6/24 (Nativity of Forerunner), 6/29 (Sts. Peter & Paul) — these are
 *   "great feasts" in the broad sense but use typical antiphons.
 */
function getGreatFeastKey(date) {
  const month = date.getUTCMonth() + 1;
  const day   = date.getUTCDate();

  // Fixed-calendar feasts
  const FIXED = {
    '12-25': 'nativity',
    '1-6':   'theophany',
    '2-2':   'meeting',
    '3-25':  'annunciation',
    '8-6':   'transfiguration',
    '8-15':  'dormition',
    '9-8':   'nativityTheotokos',
    '9-14':  'elevation',
    '11-21': 'entryTheotokos',
  };
  const fixedKey = FIXED[`${month}-${day}`];
  if (fixedKey) return fixedKey;

  // Moveable feasts
  const pascha = calculatePascha(date.getUTCFullYear());
  const diff = Math.round((date - pascha) / DAY_MS);

  if (diff === 0)  return 'pascha';
  if (diff === -7) return 'palmSunday';
  if (diff === 39) return 'ascension';
  if (diff === 49) return 'pentecost';

  return null;
}

// ─── Feast Rank Classification ───────────────────────────────────────────────

/**
 * Fixed-calendar saints/feasts that always receive an All-Night Vigil.
 * Key: "M-D" (month-day), Value: descriptive label (for debugging).
 *
 * This is the OCA's list of Vigil-rank feasts beyond the 12 Great Feasts.
 * Great Feasts are detected by getGreatFeastKey() and ranked separately.
 */
const VIGIL_SAINTS = new Map([
  ['1-1',   'Circumcision of the Lord / St. Basil the Great'],
  ['1-30',  'Three Holy Hierarchs'],
  ['5-21',  'Sts. Constantine and Helen'],
  ['6-24',  'Nativity of St. John the Forerunner'],
  ['6-29',  'Sts. Peter and Paul'],
  ['7-15',  'St. Vladimir, Equal-to-the-Apostles'],
  ['8-29',  'Beheading of St. John the Forerunner'],
  ['9-25',  'St. Sergius of Radonezh'],
  ['10-1',  'Protection (Pokrov) of the Theotokos'],
  ['10-9',  'St. Tikhon, Patriarch of Moscow'],
  ['11-8',  'Synaxis of the Archangel Michael'],
  ['12-6',  'St. Nicholas the Wonderworker'],
]);

/**
 * Returns the feast rank for a given date.
 *
 * Ranks (highest to lowest):
 *   'greatFeast'   — 12 Great Feasts, Pascha, and moveable feasts
 *   'vigil'        — Saints with All-Night Vigil (VIGIL_SAINTS)
 *   'polyeleos'    — Polyeleos-rank saints (future: from DB)
 *   'doxology'     — Great Doxology saints (future: from DB)
 *   'sixStichera'  — Ordinary commemorations (default)
 *
 * @param {Date} date — UTC date
 * @returns {string}
 */
function getFeastRank(date) {
  if (getGreatFeastKey(date) !== null) return 'greatFeast';

  const month = date.getUTCMonth() + 1;
  const day   = date.getUTCDate();
  if (VIGIL_SAINTS.has(`${month}-${day}`)) return 'vigil';

  // Future: query DB commemorations.rank column for polyeleos/doxology
  return 'sixStichera';
}

/**
 * Returns true if an All-Night Vigil should be served on this date.
 * Does NOT include ordinary Sundays (Saturday Great Vespers uses the
 * existing greatVespers serviceType for those).
 *
 * @param {Date} date — UTC date
 * @returns {boolean}
 */
function isVigilServed(date) {
  const rank = getFeastRank(date);
  return rank === 'greatFeast' || rank === 'vigil';
}

// ─── Presanctified Liturgy ─────────────────────────────────────────────────────

/**
 * Returns true if the Liturgy of the Presanctified Gifts is served on this date.
 *
 * Served on:
 *   - Wednesdays and Fridays of Great Lent (weeks 1–6)
 *   - Monday, Tuesday, Wednesday of Holy Week
 *
 * @param {Date} date — UTC date
 * @returns {boolean}
 */
function isPresanctifiedDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);

  if (season === 'greatLent' && (dow === 'wednesday' || dow === 'friday')) return true;
  if (season === 'holyWeek' && ['monday', 'tuesday', 'wednesday'].includes(dow)) return true;

  return false;
}

/**
 * Returns true if Bridegroom Matins is served on this date.
 * Served on the evenings of Holy Monday, Tuesday, and Wednesday.
 *
 * @param {Date} date — UTC date
 * @returns {boolean}
 */
function isBridegroomMatins(date) {
  // Bridegroom Matins is served on the EVENING of Sun/Mon/Tue/Wed of Holy Week.
  // API date = civil evening (the date the person attends).
  // Content is from the NEXT liturgical day (Mon/Tue/Wed/Thu).
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && ['sunday', 'monday', 'tuesday', 'wednesday'].includes(dow);
}

/**
 * Returns true if the Service of the Twelve Passion Gospels is served on this date.
 * Served on the evening of Great Thursday (Matins of Great Friday).
 *
 * @param {Date} date — UTC date
 * @returns {boolean}
 */
function isPassionGospelsDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && dow === 'thursday';
}

/**
 * Returns true if the Lamentations service is served on this date.
 * Served on the evening of Great Friday (Matins of Great Saturday).
 *
 * @param {Date} date — UTC date
 * @returns {boolean}
 */
function isLamentationsDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && dow === 'friday';
}

/**
 * Returns true if the Vesperal Liturgy of St. Basil is served on this date.
 * Served on Great Saturday morning.
 *
 * @param {Date} date — UTC date
 * @returns {boolean}
 */
function isVesperalLiturgyDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && dow === 'saturday';
}

/**
 * Returns true if the Royal Hours are served on this date.
 * Served on the morning of Great Friday.
 */
function isRoyalHoursDay(date) {
  const season = getLiturgicalSeason(date);
  const dow    = getDayOfWeek(date);
  return season === 'holyWeek' && dow === 'friday';
}

// ─── Eothinon Cycle ──────────────────────────────────────────────────────────

/**
 * Get the Eothinon number (1-11) for a given Sunday.
 * The 11-week Eothinon cycle starts at Eothinon 1 on All Saints Sunday
 * (first Sunday after Pentecost = Pascha + 56 days).
 *
 * Returns null during Triodion/Pentecostarion when the eothinon cycle
 * is suspended or follows special rules.
 */
function getEothinon(date) {
  const yr = date.getUTCFullYear();
  const pascha = calculatePascha(yr);
  const allSaints = getAllSaints(yr);

  const diffMs = date.getTime() - allSaints.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 86400000));

  if (diffWeeks >= 0) {
    return (diffWeeks % 11) + 1;
  }

  // Before this year's All Saints — use previous year's cycle
  const prevAllSaints = getAllSaints(yr - 1);
  const prevDiff = Math.floor((date.getTime() - prevAllSaints.getTime()) / (7 * 86400000));
  if (prevDiff >= 0) {
    return (prevDiff % 11) + 1;
  }

  return null; // Deep Triodion
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
  getLiturgyVariant,
  getTrisagionSubstitution,
  isLiturgyServed,
  getGreatFeastKey,
  getFeastRank,
  isVigilServed,
  isPresanctifiedDay,
  isBridegroomMatins,
  isPassionGospelsDay,
  isLamentationsDay,
  isVesperalLiturgyDay,
  isRoyalHoursDay,
  getEothinon,
  generateCalendarEntry,
};
