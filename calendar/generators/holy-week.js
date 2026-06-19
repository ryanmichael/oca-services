/**
 * Holy Week day Vespers generator.
 *
 * Dispatches per-day from a DAY_CONFIG table. All variable slots are
 * DB-sourced via the stable holyWeek.{dow} key.
 *
 * Extracted from calendar-rules.js as Track D Step 8f.
 */

'use strict';

const {
  nowIso,
  SATURDAY_GREAT_VESPERS_PROKEIMENON,
  vespersDailyProkeimenon,
} = require('../vespers-shared');

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
      prokeimenon: { ...SATURDAY_GREAT_VESPERS_PROKEIMENON },
      customPalmSunday: true,
    },
    // Holy Mon–Thu use the standard civil-eve weekday prokeimenon, same as
    // every other Daily Vespers generator (vespersDailyProkeimenon). Previous
    // hardcoded liturgical-day values (monday/tuesday/wednesday/thursday)
    // appeared to be the same copy-paste bug shape as the other 5 sites fixed
    // under aef1f6f, not a deliberate Holy Week divergence. Conclusion drawn
    // 2026-06-16 without an OCA Holy Week order source on hand (the
    // reference/orders/ DOCXs jump Palm Sunday → Antipascha; the parsed
    // Presanctified DOCXs don't include a Daily-Vespers prokeimenon since
    // Presanctified replaces it). Mitigating factor: Holy Mon/Tue/Wed actual
    // parish service is Presanctified (with its own pre-reading prokeimena);
    // Holy Thu is Vesperal Liturgy of St Basil — so the Daily Vespers form
    // rendered here is reference content, not what's sung. Verify at Holy
    // Week 2027 against a parish-bulletin source and revisit if these need
    // to flip back.
    monday: {
      name:        'Holy Monday',
      serviceType: 'dailyVespers',
      rubricNote:  'Holy Monday — Daily Vespers',
      prokeimenon: vespersDailyProkeimenon('monday'),
      apostichaGloryOnly: true,
    },
    tuesday: {
      name:        'Holy Tuesday',
      serviceType: 'dailyVespers',
      rubricNote:  'Holy Tuesday — Daily Vespers',
      prokeimenon: vespersDailyProkeimenon('tuesday'),
      apostichaGloryOnly: true,
    },
    wednesday: {
      name:        'Holy Wednesday',
      serviceType: 'dailyVespers',
      rubricNote:  'Holy Wednesday — Daily Vespers',
      prokeimenon: vespersDailyProkeimenon('wednesday'),
      apostichaGloryOnly: true,
    },
    thursday: {
      name:        'Great and Holy Thursday',
      serviceType: 'dailyVespers',
      rubricNote:  'Great and Holy Thursday — Vespers (primary morning service: Liturgy of St. Basil)',
      prokeimenon: vespersDailyProkeimenon('thursday'),
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
              verses: [{ text: 'My God, My God, look upon me! Why hast Thou forsaken me?' }],
              psalmRef: 'Ps. 21:18',
            },
          },
          {
            order: 2, book: 'Job', pericope: '42:12–17', label: 'Second Reading',
            prokeimenon: {
              tone: 4,
              refrain: 'Judge, O Lord, those who wrong me; fight against those who fight against me!',
              verses: [{ text: 'They rewarded me evil for good; My soul is forlorn.' }],
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
      prokeimenon: { ...SATURDAY_GREAT_VESPERS_PROKEIMENON },
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
    prokeimenon: vespersDailyProkeimenon(dow),
  };

  // ── Holy Friday: fully wired from triodion JSON ─────────────────────────
  if (cfg.customCalendarEntry) {
    const triKey = 'holyWeek.friday';
    return {
      _meta: {
        generated:   true,
        generatedAt: nowIso(),
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
        generatedAt: nowIso(),
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
      generatedAt: nowIso(),
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

module.exports = { generateHolyWeekDay };
