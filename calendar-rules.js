/**
 * Calendar Rules
 *
 * Programmatically generates calendar entries for any date, driving the
 * assembler without requiring a hand-authored JSON file per day.
 *
 * Currently supports:
 *   - Saturday Great Vespers in ordinary time (post-Pentecost)
 *
 * Returns null for seasons not yet implemented (Lent, Holy Week, etc.),
 * so callers can fall back gracefully.
 *
 * Exports:
 *   calculatePascha(year)          → Date (UTC)
 *   getLiturgicalSeason(date)      → string
 *   getTone(date)                  → 1–8
 *   generateCalendarEntry(dateStr) → Object | null
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
 *
 * @param {number} year
 * @returns {Date} UTC midnight
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
    month = 3; day = 22 + f; // March
  } else {
    month = 4; day = f - 9;  // April
  }

  // Julian → Gregorian: +13 days
  return new Date(Date.UTC(year, month - 1, day + 13));
}

/**
 * Returns the date of All Saints Sunday = Pascha + 56 days.
 * This is Tone 1 week of the Octoechos cycle.
 */
function getAllSaints(year) {
  return new Date(calculatePascha(year).getTime() + 56 * DAY_MS);
}

// ─── Tone cycle ───────────────────────────────────────────────────────────────

/**
 * Returns the Octoechos tone (1–8) active for a given date.
 *
 * The cycle anchors to All Saints Sunday each year (Tone 1).
 * Saturday Vespers uses the tone of the week that is *ending* —
 * i.e., the tone of the preceding Sunday.
 *
 * @param {Date} date  UTC midnight
 * @returns {1|2|3|4|5|6|7|8}
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
 * @param {Date} date  UTC midnight
 * @returns {'ordinaryTime'|'preLenten'|'greatLent'|'holyWeek'|'brightWeek'|'pentecostarion'}
 */
function getLiturgicalSeason(date) {
  const year = date.getUTCFullYear();
  const pascha = calculatePascha(year);
  const diff = Math.floor((date - pascha) / DAY_MS);

  const cleanMonday  = new Date(pascha.getTime() - 48 * DAY_MS);
  const palmSunday   = new Date(pascha.getTime() -  7 * DAY_MS);
  const meatfareSun  = new Date(pascha.getTime() - 56 * DAY_MS);

  if (date >= pascha) {
    if (diff <= 6)  return 'brightWeek';
    if (diff <= 49) return 'pentecostarion';
    return 'ordinaryTime';
  }

  if (date >= palmSunday)  return 'holyWeek';
  if (date >= cleanMonday) return 'greatLent';
  if (date >= meatfareSun) return 'preLenten';
  return 'ordinaryTime';
}

// ─── Day of week ──────────────────────────────────────────────────────────────

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getDayOfWeek(date) {
  return DAYS[date.getUTCDay()];
}

// ─── Calendar entry generation ────────────────────────────────────────────────

/**
 * Generates a calendar entry object for a given date.
 *
 * Currently handles:
 *   - Saturday in ordinary time → Saturday Great Vespers
 *     (6 resurrectional stichera from Octoechos, dogmatikon, aposticha)
 *
 * Returns null for unsupported dates/seasons.
 *
 * @param {string} dateStr  ISO date string "YYYY-MM-DD"
 * @returns {Object|null}
 */
function generateCalendarEntry(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  const dayOfWeek = getDayOfWeek(date);
  const season    = getLiturgicalSeason(date);
  const tone      = getTone(date);

  // Only generate entries for Saturday ordinary-time Great Vespers for now
  if (dayOfWeek !== 'saturday') return null;
  if (season !== 'ordinaryTime') return null;

  const toneKey = `tone${tone}`;

  return {
    _meta: {
      generated:   true,
      generatedAt: new Date().toISOString(),
      note:        `Auto-generated Saturday Great Vespers. Tone ${tone}. ` +
                   `Menaion commemorations not included.`,
    },

    date:      dateStr,
    dayOfWeek: 'saturday',

    liturgicalContext: {
      season:            'ordinaryTime',
      tone,
      toneSource:        'octoechosCycle',
    },

    commemorations: [],

    vespers: {
      serviceType: 'greatVespers',
      rubricNote:  `Great Vespers with Entrance (sung on Friday evening)`,

      lordICall: {
        tone,
        totalStichera: 6,
        note: `6 resurrectional stichera from Octoechos Tone ${tone}`,
        slots: [
          {
            verses: [6, 5, 4, 3, 2, 1],
            count:  6,
            source: 'octoechos',
            key:    `${toneKey}.saturday.vespers.lordICall.resurrectional`,
            tone,
            label:  'Resurrectional',
          },
        ],
        glory: {
          source: 'octoechos',
          key:    `${toneKey}.saturday.vespers.lordICall.glory`,
          tone,
          label:  'Theotokion',
        },
        now: {
          source: 'octoechos',
          key:    `${toneKey}.saturday.vespers.dogmatikon`,
          tone,
          label:  'Theotokion — Dogmatikon',
          note:   'Dogmatikon always from Octoechos on Saturday Great Vespers',
        },
      },

      prokeimenon: {
        pattern: 'weekday',
        weekday: 'saturdayGreatVespers',
        note:    `Great Prokeimenon (Tone 8) — always at Saturday Great Vespers`,
      },

      aposticha: {
        note: 'Octoechos resurrectional idiomelon with repeated psalm verses',
        slots: [
          {
            position: 1,
            source:   'octoechos',
            key:      `${toneKey}.saturday.vespers.aposticha.hymns.0`,
            tone,
            label:    'Resurrectional (Idiomelon)',
          },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
        ],
        glory: {
          source: 'octoechos',
          key:    `${toneKey}.saturday.vespers.aposticha.glory`,
          tone,
        },
        now: {
          source: 'octoechos',
          key:    `${toneKey}.saturday.vespers.aposticha.theotokion`,
          tone,
          label:  'Theotokion',
        },
      },

      troparia: {
        source: 'octoechos',
        slots: [
          {
            order:  1,
            tone,
            source: 'octoechos',
            key:    `${toneKey}.saturday.vespers.troparion`,
            label:  'Resurrectional Troparion',
          },
          {
            position: 'now',
            tone,
            source:   'octoechos',
            key:      `${toneKey}.saturday.vespers.dismissalTheotokion`,
            label:    'Dismissal Theotokion',
          },
        ],
      },
    },
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  calculatePascha,
  getAllSaints,
  getLiturgicalSeason,
  getTone,
  getDayOfWeek,
  generateCalendarEntry,
};
