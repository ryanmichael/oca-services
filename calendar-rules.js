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

// Vespers-generator shared constants + helpers extracted to
// calendar/vespers-shared.js (Track D step 7). DAY_MS, nowIso, the
// VESPERS_SUNG_EVE table and the prokeimenon spec builders are
// imported here for use by the generator family below.
const {
  DAY_MS,
  nowIso,
  VESPERS_SUNG_EVE,
  SATURDAY_GREAT_VESPERS_PROKEIMENON,
  vespersDailyProkeimenon,
  buildLentenProkeimenon,
} = require('./calendar/vespers-shared');

// ─── Calendar style (New / Old) ───────────────────────────────────────────────
// Orthodox jurisdictions split between the Julian ("Old") and Revised Julian
// ("New") calendars. Both use the same Julian Pascha computus, so all
// Pascha-anchored math (Lent, Pentecostarion, Octoechos tones, Holy Week)
// is identical for both. The axis is only the FIXED-feast lookup:
// Nativity = Dec 25 New = Jan 7 Old (Gregorian civil dates).
//
// JULIAN_OFFSET_DAYS + fixedFeastDate + great-feast/vigil/polyeleos tables
// extracted to calendar/fixed-feasts.js (Track D step 4).
const {
  JULIAN_OFFSET_DAYS,
  fixedFeastDate,
  getGreatFeastKey,
  VIGIL_SAINTS,
  POLYELEOS_SAINTS,
  getFeastRank,
  isVigilServed,
} = require('./calendar/fixed-feasts');

// ─── Pascha calculation ───────────────────────────────────────────────────────

// calculatePascha + getAllSaints extracted to calendar/computus.js (Track D step 1)
const { calculatePascha, getAllSaints } = require('./calendar/computus');

// getTone + getEothinon extracted to calendar/cycle.js (Track D step 3)
const { getTone, getEothinon } = require('./calendar/cycle');

// Season/day helpers + stable liturgical key extracted to calendar/seasons.js
// (Track D step 2 + 5a).
const {
  DAYS,
  getDayOfWeek,
  getLiturgicalSeason,
  getCleanMonday,
  getWeekOfLent,
  getLentenSaturdayNumber,
  isSoulSaturday,
  getLiturgicalKey,
} = require('./calendar/seasons');

// ─── Calendar entry generators ────────────────────────────────────────────────

// Ordinary-time Vespers generators extracted to
// calendar/generators/ordinary-time.js (Track D step 8c). NOTE: pre-lent and
// pentecostarion generators mutate generateOrdinaryTimeSaturday's output.
const {
  generateOrdinaryTimeWeekday,
  generateOrdinaryTimeSaturday,
} = require('./calendar/generators/ordinary-time');

// Great-Feast + Vigil-Feast Vespers generators extracted to
// calendar/generators/great-feast.js (Track D step 8a).
const {
  generateGreatFeastVespers,
  generateVigilFeastVespers,
} = require('./calendar/generators/great-feast');

// Lent Vespers generator family extracted to calendar/generators/lent.js
// (Track D step 8e): Soul Saturday, Theodore Sat, Akathist Sat, Lazarus Sat,
// generic Lenten-Sat dispatcher, Lenten Sun, Lenten weekday.
const {
  generateSoulSaturday,
  generateLentenSaturday,
  generateTheodoreSaturday,
  generateAkathist_Saturday,
  generateLazarusSaturday,
  generateLentenSunday,
  generateLentenWeekday,
} = require('./calendar/generators/lent');

// Holy Week day generator extracted to calendar/generators/holy-week.js
// (Track D step 8f).
const { generateHolyWeekDay } = require('./calendar/generators/holy-week');

// Pre-Lenten Triodion Sunday + Meatfare Saturday Vespers generator extracted
// to calendar/generators/pre-lent.js (Track D step 8d).
const { generatePreLentenDay } = require('./calendar/generators/pre-lent');

// Bright Week day generator extracted to calendar/generators/bright-week.js
// (Track D step 8b).
const { generateBrightWeekDay } = require('./calendar/generators/bright-week');

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
  // ── Fixed tones for Pentecostarion Sundays ─────────────────────────────────
  // Each Pentecostarion Sunday has a fixed tone, not the regular Octoechos cycle.
  const PENT_SUNDAY_TONES = {
    'pentecostarion.week.2.sunday': 1, // Thomas Sunday
    'pentecostarion.week.3.sunday': 2, // Myrrhbearers
    'pentecostarion.week.4.sunday': 3, // Paralytic
    'pentecostarion.week.5.sunday': 4, // Samaritan Woman
    'pentecostarion.week.6.sunday': 5, // Blind Man
    'pentecostarion.week.7.sunday': 6, // Holy Fathers
  };
  if (PENT_SUNDAY_TONES[litKey] !== undefined) {
    tone = PENT_SUNDAY_TONES[litKey];
  }

  // ── Paschal greeting window: Pascha day through Pascha leavetaking ────────
  // "Christ is risen" is sung at the start of services from Pascha (+0)
  // through the Tuesday before Ascension (+38). After +38 (Pascha leavetaking)
  // it ceases until next Pascha. This applies to weekdays too, not just
  // Pentecostarion Sundays.
  const [py, pm, pd]  = dateStr.split('-').map(Number);
  const dateObj       = new Date(Date.UTC(py, pm - 1, pd));
  const pascha        = calculatePascha(py);
  const daysSincePascha = Math.floor((dateObj - pascha) / DAY_MS);
  const isPaschalGreeting = daysSincePascha >= 0 && daysSincePascha <= 38;

  // ── Saturday: ordinary-time Great Vespers ──────────────────────────────────
  if (dow === 'saturday') {
    const entry = generateOrdinaryTimeSaturday(dateStr, tone);
    entry.liturgicalContext.season = 'pentecostarion';
    entry._meta.note = entry._meta.note.replace('ordinaryTime', 'pentecostarion');
    if (isPaschalGreeting) entry.vespers.paschalOpening = true;
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
  // Pentecost and Ascension are served as All-Night Vigil (Great Vespers with
  // Entrance + Litya + Blessing of Bread) per OCA rubric. The Litya stichera
  // for these feasts already exist in the Pentecostarion DB block table.
  const isNamedFeast = litKey in FEAST_NAMES;
  const isGreat      = dow === 'sunday' || isNamedFeast;
  const VIGIL_PENT_FEASTS = new Set([
    'pentecostarion.pentecost',
    'pentecostarion.ascension',
  ]);
  const isVigilFeast = VIGIL_PENT_FEASTS.has(litKey);
  const serviceType  = isVigilFeast ? 'all-night-vigil'
                     : isGreat       ? 'greatVespers'
                     :                 'dailyVespers';
  const tk           = `tone${tone}`;

  // ── Prokeimenon ────────────────────────────────────────────────────────────
  // Thomas Sunday uses "Who is so great a God" (great prokeimenon).
  // Ascension uses "Our God is in heaven" (great prokeimenon).
  // Pentecost Vigil (Saturday evening) uses the regular Saturday Great
  // Prokeimenon "The Lord is King" Tone 6 per the OCA service-text bulletin;
  // "Who is so great a god as our God" Tone 7 is served at the SUNDAY-evening
  // Kneeling Vespers (/api/kneeling-vespers), not at this Saturday-eve vigil.
  // Other Sundays / named feasts: Saturday Great Prokeimenon (from Octoechos)
  // Regular weekdays: appointed weekday prokeimenon
  let prokeimenon;
  if (litKey === 'pentecostarion.week.2.sunday') {
    prokeimenon = { pattern: 'great', key: 'whoIsSoGreat' };
  } else if (litKey === 'pentecostarion.ascension') {
    prokeimenon = { pattern: 'great', key: 'ourGodIsInHeaven' };
  } else if (isGreat) {
    prokeimenon = { ...SATURDAY_GREAT_VESPERS_PROKEIMENON };
  } else {
    prokeimenon = vespersDailyProkeimenon(dow);
  }

  // ── Lord I Call stichera slots ────────────────────────────────────────────
  // Pentecostarion Sunday Great Vespers: 10 stichera total. Most Sundays use
  // 7 resurrectional + 3 feast idiomela. Holy Fathers Sunday is special:
  // 3 resurrectional + 3 Ascension idiomela + 4 Fathers idiomela. Thomas /
  // Ascension / Pentecost are 10 all from feast.
  // Source: OCA rubrics for Pentecostarion Sunday Great Vespers.
  const PENT_SUNDAY_LIC_LAYOUT = {
    'pentecostarion.week.2.sunday': [{ count: 10, category: 'feastIdiomela', source: 'db', label: 'Stichera' }],
    'pentecostarion.week.3.sunday': [{ count: 7, source: 'octoechos' }, { count: 3, category: 'feastIdiomela', source: 'db', label: 'Stichera' }],
    'pentecostarion.week.4.sunday': [{ count: 7, source: 'octoechos' }, { count: 3, category: 'feastIdiomela', source: 'db', label: 'Stichera' }],
    'pentecostarion.week.5.sunday': [{ count: 7, source: 'octoechos' }, { count: 3, category: 'feastIdiomela', source: 'db', label: 'Stichera' }],
    'pentecostarion.week.6.sunday': [{ count: 7, source: 'octoechos' }, { count: 3, category: 'feastIdiomela', source: 'db', label: 'Stichera' }],
    'pentecostarion.week.7.sunday': [
      { count: 3, source: 'octoechos' },
      { count: 3, category: 'ascensionIdiomela', source: 'db', label: 'For the Ascension' },
      { count: 4, category: 'fatherIdiomela',    source: 'db', label: 'For the Fathers'   },
    ],
    'pentecostarion.ascension':     [{ count: 10, category: 'feastIdiomela', source: 'db', label: 'Stichera' }],
    'pentecostarion.pentecost':     [{ count: 10, category: 'feastIdiomela', source: 'db', label: 'Stichera' }],
  };
  // Sundays/named feasts in Pentecostarion: 10 stichera per the Sunday's
  // rubric (see PENT_SUNDAY_LIC_LAYOUT above). Weekday Daily Vespers: 6
  // stichera, pulling day-of-week-specific Octoechos content (e.g. for
  // Thursday Vespers the Apostles/St. Nicholas themed stichera in the
  // week's tone). Menaion stichera are injected at runtime by the server.
  const totalStichera = (dow === 'sunday' && litKey in PENT_SUNDAY_TONES) ? 10 : 6;
  // octoechos.json weekday vespers keys are keyed by sung-evening day, not
  // liturgical day. Monday-evening Vespers (sung Mon eve, opens Tue
  // liturgically) lives at `monday.vespers`. The calendar entry's `dow` is the
  // liturgical day, so look up under the PREVIOUS day for the correct theme.
  const vespersSungEve = VESPERS_SUNG_EVE[dow] || dow;
  const weekdayKey    = `${tk}.${vespersSungEve}.vespers.lordICall`;
  const layout        = PENT_SUNDAY_LIC_LAYOUT[litKey]
    || [{ count: totalStichera, source: 'octoechos', key: weekdayKey, label: 'Octoechos' }];
  const allVerses     = Array.from({ length: totalStichera }, (_, i) => totalStichera - i);
  const licSlots      = [];
  let cursor = 0;
  for (const part of layout) {
    const verseSlice = allVerses.slice(cursor, cursor + part.count);
    if (verseSlice.length === 0) break;
    if (part.source === 'octoechos') {
      // Sundays use Saturday-evening resurrectional content; weekdays use
      // the day-of-week-specific Octoechos key passed in `part.key`.
      const octoKey = part.key || `${tk}.saturday.vespers.lordICall.resurrectional`;
      licSlots.push({
        verses: verseSlice, count: part.count,
        source: 'octoechos', key: octoKey,
        tone, label: part.label || 'Resurrectional',
      });
    } else {
      licSlots.push({
        verses: verseSlice, count: part.count,
        source: 'db', key: `${litKey}.vespers.lordICall`,
        // Select by category so the slot pulls the right idiomela
        // regardless of where they live in the source's flat hymns array.
        category: part.category,
        tone, label: part.label || 'Stichera',
      });
    }
    cursor += part.count;
  }

  // Glory: feast doxastichon from DB; Now and ever: Dogmatikon from Octoechos.
  const licGlory = { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone };

  // "Now and ever": Dogmatikon of the tone
  const nowSlot = { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Theotokion — Dogmatikon' };

  // ── Aposticha ────────────────────────────────────────────────────────────
  // Pentecostarion Sunday aposticha (OCA rubric): 1 Resurrectional + Paschal stichera
  // with Psalm 67 verses. Glory: Pentecostarion, Now and ever: "This is the day…"
  // Major feasts (Thomas, Ascension, Pentecost): all aposticha from DB.
  // Holy Fathers Sunday (week 7) is AFTER Apodosis of Pascha (Pascha+38), so
  // Paschal aposticha no longer apply — uses regular Octoechos pattern
  // (1 idiomelon + 3 resurrectional with Ps 92 verses) which is stored in DB.
  const isPentSunday = dow === 'sunday' && litKey in PENT_SUNDAY_TONES;
  const DB_FULL_APOSTICHA = new Set([
    'pentecostarion.week.2.sunday',   // Thomas Sunday
    'pentecostarion.week.7.sunday',   // Holy Fathers (after Apodosis of Pascha)
    'pentecostarion.ascension',        // Ascension
    'pentecostarion.pentecost',        // Pentecost
  ]);
  const useDbAposticha = DB_FULL_APOSTICHA.has(litKey);

  // How many stichera the DB has for this litKey (varies by feast). Holy
  // Fathers Sunday has 4 (1 resurrectional idiomelon + 3 with Ps. 92 verses);
  // Thomas/Ascension/Pentecost have 3.
  const DB_APOSTICHA_HYMN_COUNT = {
    'pentecostarion.week.2.sunday': 3,
    'pentecostarion.week.7.sunday': 4,
    'pentecostarion.ascension':     3,
    'pentecostarion.pentecost':     3,
  };

  let apostichaSlots, apostichaGlory, apostichaNow;
  if (useDbAposticha) {
    // Each slot must point to a specific hymn index (hymns.0, hymns.1, …) —
    // otherwise the resolver returns hymns[0] for every slot and the first
    // sticheron is repeated.
    const count = DB_APOSTICHA_HYMN_COUNT[litKey] ?? 3;
    apostichaSlots = Array.from({ length: count }, (_, i) => ({
      position: i + 1,
      source: 'db',
      key: `${litKey}.vespers.aposticha.hymns.${i}`,
      tone,
      label: 'Sticheron',
    }));
    apostichaGlory = { source: 'db', key: `${litKey}.vespers.aposticha.glory`, tone };
    apostichaNow = { source: 'db', key: `${litKey}.vespers.aposticha.now`, tone, label: 'Theotokion' };
  } else if (isPentSunday) {
    // 1 Resurrectional idiomelon + 4 Paschal stichera (with Ps 67 verses)
    apostichaSlots = [
      { position: 1, source: 'octoechos', key: `${tk}.saturday.vespers.aposticha.hymns.0`, tone, label: 'Resurrectional Idiomelon' },
      { position: 2, source: 'fixed', key: 'paschalAposticha.1', tone: 5, label: 'Paschal Sticheron' },
      { position: 3, source: 'fixed', key: 'paschalAposticha.2', tone: 5, label: 'Paschal Sticheron' },
      { position: 4, source: 'fixed', key: 'paschalAposticha.3', tone: 5, label: 'Paschal Sticheron' },
      { position: 5, source: 'fixed', key: 'paschalAposticha.4', tone: 5, label: 'Paschal Sticheron' },
    ];
    apostichaGlory = { source: 'db', key: `${litKey}.vespers.aposticha.glory`, tone };
    // "Now and ever": "This is the day of Resurrection..." + "Christ is risen" ×1
    apostichaNow = { source: 'fixed', key: 'paschalAposticha.now', label: 'Paschal' };
  } else {
    // Weekday Pentecostarion: use day-of-week-specific Octoechos aposticha.
    // (Sundays/named feasts are handled by the branches above.)
    // See VESPERS_SUNG_EVE — data is keyed by sung-evening day, not liturgical.
    const apostBase = `${tk}.${VESPERS_SUNG_EVE[dow] || dow}.vespers.aposticha`;
    apostichaSlots = [
      { position: 1, source: 'octoechos', key: `${apostBase}.hymns.0`, tone, label: 'Aposticha' },
      { position: 2, repeatPrevious: true },
      { position: 3, repeatPrevious: true },
    ];
    apostichaGlory = null;
    apostichaNow = { source: 'octoechos', key: `${apostBase}.theotokion`, tone, label: 'Theotokion' };
  }

  return {
    _meta: {
      generated:   true,
      generatedAt: nowIso(),
      note:        `Auto-generated ${name}. Tone ${tone}. Variable texts (source:'db') keyed by '${litKey}'.`,
    },
    date:      dateStr,
    dayOfWeek: dow,
    liturgicalContext: { season: 'pentecostarion', tone, toneSource: isPentSunday ? 'pentecostarionFixed' : 'octoechosCycle' },
    commemorations: [],
    vespers: {
      serviceType,
      rubricNote: name,
      paschalOpening: isPaschalGreeting,  // "Christ is risen" before Psalm 103 (through Pascha leavetaking)
      isPentecostarionSunday: isPentSunday, // suppress Menaion injection
      // Paschal aposticha (Ps 67 verses + Paschal stichera) only while the Paschal
      // greeting is in effect. After Apodosis (Pascha+38) — i.e. Holy Fathers
      // Sunday at Pascha+42 — the regular Saturday Vespers aposticha is used.
      paschalAposticha: isPentSunday && isPaschalGreeting,
      // Three OT prophecies for the Holy Fathers (read at Great Vespers before
      // the Litya). Scripture text is enriched from orthocal in the server route.
      // Source: OCA 2026-0524-tt.docx.
      otReadings: litKey === 'pentecostarion.week.7.sunday'
        ? [
            { order: 1, book: 'Genesis',     pericope: '14:14-20' },
            { order: 2, book: 'Deuteronomy', pericope: '1:8-11, 15-17' },
            { order: 3, book: 'Deuteronomy', pericope: '10:14-21' },
          ]
        : litKey === 'pentecostarion.pentecost'
        ? [
            { order: 1, book: 'Numbers',  pericope: '11:16-17, 24-29' },
            { order: 2, book: 'Joel',     pericope: '2:23-32' },
            { order: 3, book: 'Ezekiel',  pericope: '36:24-28' },
          ]
        : litKey === 'pentecostarion.ascension'
        ? [
            { order: 1, book: 'Isaiah',    pericope: '2:2-3' },
            { order: 2, book: 'Isaiah',    pericope: '62:10-12; 63:1-3, 7-9' },
            { order: 3, book: 'Zechariah', pericope: '14:4, 8-11' },
          ]
        : null,
      lordICall: {
        tone,
        totalStichera,
        slots:  licSlots,
        glory:  licGlory,
        now:    nowSlot,
      },
      prokeimenon,
      // Litya stichera for vigil-served Pentecostarion feasts.
      // Texts live in fixed-texts/vespers-fixed.json under `pentecostarionLitya`
      // (Sergius English Pentecostarion translation; OCA service-text docx
      // ships only an abbreviated set). See [[project-pent-litya-coverage]].
      ...(isVigilFeast ? (() => {
        const slug = litKey === 'pentecostarion.pentecost' ? 'pentecost'
                   : litKey === 'pentecostarion.ascension' ? 'ascension'
                   : null;
        if (!slug) return {};
        const counts = { pentecost: 3, ascension: 6 };
        const n = counts[slug];
        return {
          litya: {
            slots: Array.from({ length: n }, (_, i) => ({
              position: i + 1,
              source: 'fixed',
              key: `pentecostarionLitya.${slug}.stichera.${i}`,
              label: 'Litya Sticheron',
            })),
            now: {
              source: 'fixed',
              key: `pentecostarionLitya.${slug}.now`,
              label: 'Glory/Both-now doxastichon',
              combinesGloryNow: true,
            },
          },
        };
      })() : {}),
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
            // Holy Fathers Sunday (week 7): Resurrection + DB Glory (Fathers T8) + DB Now (Ascension T4).
            // The DB has the proper Now-and-ever theotokion for the day, which
            // supersedes the Saturday Vespers dismissal theotokion during the
            // Ascension afterfeast.
            return [
              { order: 1,          tone, source: 'octoechos', key: `${tk}.saturday.vespers.troparion`, label: 'Resurrectional Troparion' },
              { position: 'glory', tone, source: 'db',        key: dbKey,                              label: 'Feast Troparion' },
              { position: 'now',   tone, source: 'db',        key: dbKey,                              label: 'Feast Theotokion' },
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
function generateCalendarEntry(dateStr, style = 'new') {
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
  const feastKey = getGreatFeastKey(date, style);
  if (feastKey && !['palmSunday', 'ascension', 'pentecost', 'pascha'].includes(feastKey)) {
    return generateGreatFeastVespers(dateStr, dow, tone, feastKey, season);
  }

  // ── Vigil-rank saints override ordinary day logic ──────────────────────────
  // These feasts get an All-Night Vigil with Litya and Blessing of Bread.
  const feastRank = getFeastRank(date, style);
  if (feastRank === 'vigil') {
    return generateVigilFeastVespers(dateStr, dow, tone);
  }

  // ── Ordinary time ──────────────────────────────────────────────────────────
  if (season === 'ordinaryTime') {
    if (dow === 'saturday') return generateOrdinaryTimeSaturday(dateStr, tone, 'saturday');
    if (dow === 'sunday')   return generateOrdinaryTimeSaturday(dateStr, tone, 'sunday');
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

  // ── Fallback ───────────────────────────────────────────────────────────────
  return null;
}

// Liturgy-day predicates extracted to calendar/liturgy-day.js (Track D step 5)
const {
  getLiturgyVariant,
  getTrisagionSubstitution,
  isLiturgyServed,
  isPresanctifiedDay,
} = require('./calendar/liturgy-day');

// Holy Week special-service predicates extracted to
// calendar/holy-week-services.js (Track D step 6).
const {
  isBridegroomMatins,
  isPassionGospelsDay,
  isLamentationsDay,
  isVesperalLiturgyDay,
  isRoyalHoursDay,
  isBurialVespersDay,
} = require('./calendar/holy-week-services');

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  JULIAN_OFFSET_DAYS,
  fixedFeastDate,
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
  isBurialVespersDay,
  getEothinon,
  generateCalendarEntry,
  VESPERS_SUNG_EVE,
};
