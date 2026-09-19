'use strict';

/**
 * The searchable service catalog — one entry per service the app can render.
 *
 * Two jobs share this file so they cannot drift apart:
 *   1. `/api/days` asks each entry `isServed(day)` to build the per-date
 *      `services` map that drives the home-page week list.
 *   2. `/api/search` matches a query against `keywords` and, for date-bound
 *      services, scans forward with the same `isServed` to report the next
 *      date the service is actually sung.
 *
 * Entry shape:
 *   key         — the client's svcType (what app.js switches on)
 *   name        — display name
 *   description — one line for the search result
 *   keywords    — lower-case search terms beyond the name itself
 *   kind        — 'date' (opens on a date) | 'form' (opens a form view)
 *   isServed(d) — date-kind only. d = { cur: Date(UTC noon), dateStr, dow,
 *                 season, entry, vespersEntry, style, sources, ctx }
 *   searchable  — false hides an entry from search but keeps it in /api/days
 *                 (the Typika variants share a row with the Liturgy)
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const daysFromPascha = (d) => {
  const p = d.ctx.calculatePascha(d.cur.getUTCFullYear());
  return Math.round((d.cur - p) / DAY_MS);
};

const SERVICE_CATALOG = [
  {
    key: 'greatVespers', name: 'Great Vespers', kind: 'date',
    description: 'Saturday evening and the eve of feasts, with the Entrance and Kathisma.',
    keywords: ['vespers', 'evening', 'saturday night', 'lord i call', 'lord i have cried'],
    isServed: (d) => d.vespersEntry?.vespers?.serviceType === 'greatVespers' && !d.vespersEntry?.vespers?.serviceKey,
  },
  {
    key: 'dailyVespers', name: 'Daily Vespers', kind: 'date',
    description: 'Weekday evening service without the Entrance.',
    keywords: ['vespers', 'evening', 'weekday'],
    isServed: (d) => d.vespersEntry?.vespers?.serviceType === 'dailyVespers',
  },
  {
    key: 'allNightVigil', name: 'All-Night Vigil', kind: 'date',
    description: 'Great Vespers and Matins served as one service on the eve of a great feast or Sunday.',
    keywords: ['vigil', 'all night', 'all-night', 'vsenoshchnaya', 'litya', 'blessing of loaves'],
    isServed: (d) => d.vespersEntry?.vespers?.serviceType === 'all-night-vigil',
  },
  {
    key: 'burialVespers', name: 'Vespers of Great Friday', kind: 'date',
    description: 'The Burial Vespers of Great and Holy Friday, with the bringing out of the Shroud.',
    keywords: ['burial', 'shroud', 'epitaphios', 'plashchanitsa', 'holy friday', 'great friday', 'good friday', 'unnailing'],
    isServed: (d) => d.ctx.isBurialVespersDay(d.cur),
  },
  {
    key: 'matins', name: 'Matins', kind: 'date',
    description: 'The morning office — Six Psalms, canon, praises and Great Doxology.',
    keywords: ['matins', 'orthros', 'morning', 'six psalms', 'canon', 'polyeleos'],
    isServed: (d) => !!d.ctx.buildMatinsSpec(d.dateStr, d.cur, d.dow, d.season, d.ctx.getTone(d.cur), d.sources, d.style),
  },
  {
    key: 'liturgy', name: 'Divine Liturgy', kind: 'date',
    description: 'The Eucharistic Liturgy of St. John Chrysostom or St. Basil.',
    keywords: ['liturgy', 'eucharist', 'communion', 'chrysostom', 'basil', 'antiphons', 'beatitudes'],
    isServed: (d) => !!(d.entry?.liturgy) || d.ctx.isLiturgyServed(d.cur, d.style),
  },
  {
    key: 'typika', name: "Reader's Typika", kind: 'date',
    description: 'Lay-led service of the Typika when no priest is present; also with deacon or Reserved Gifts.',
    keywords: ['typika', 'reader', 'readers service', 'obednitsa', 'no priest', 'lay led', 'reserved gifts'],
    isServed: (d) => !!(d.entry?.liturgy) || d.ctx.isLiturgyServed(d.cur, d.style),
    inDays: false,   // rides the Liturgy row via the TYPE picker; not its own /api/days flag
  },
  {
    key: 'presanctified', name: 'Presanctified Liturgy', kind: 'date',
    description: 'Lenten Wednesday and Friday evening Liturgy of the Presanctified Gifts.',
    keywords: ['presanctified', 'lent', 'lenten', 'wednesday', 'friday', 'let my prayer arise', 'gregory'],
    isServed: (d) => d.ctx.isPresanctifiedDay(d.cur, d.style),
  },
  {
    key: 'bridegroomMatins', name: 'Bridegroom Matins', kind: 'date',
    description: 'Matins of Holy Monday, Tuesday and Wednesday — “Behold, the Bridegroom comes at midnight.”',
    keywords: ['bridegroom', 'holy week', 'holy monday', 'holy tuesday', 'holy wednesday', 'behold the bridegroom'],
    isServed: (d) => d.ctx.isBridegroomMatins(d.cur),
  },
  {
    key: 'passionGospels', name: 'Twelve Passion Gospels', kind: 'date',
    description: 'Matins of Great Friday, served Thursday evening, with the twelve Gospel readings.',
    keywords: ['passion', 'twelve gospels', '12 gospels', 'holy thursday', 'great thursday', 'crucifixion', 'today he who hung'],
    isServed: (d) => d.ctx.isPassionGospelsDay(d.cur),
  },
  {
    key: 'royalHours', name: 'Royal Hours of Great Friday', kind: 'date',
    description: 'The First, Third, Sixth and Ninth Hours read together on Great Friday morning.',
    keywords: ['royal hours', 'hours', 'great friday', 'holy friday', 'good friday'],
    isServed: (d) => d.ctx.isRoyalHoursDay(d.cur),
  },
  {
    key: 'lamentations', name: 'The Lamentations', kind: 'date',
    description: 'Matins of Great Saturday, served Friday evening — the Praises before the Tomb.',
    keywords: ['lamentations', 'praises', 'tomb', 'holy saturday', 'great saturday', 'epitaphios', 'noble joseph'],
    isServed: (d) => d.ctx.isLamentationsDay(d.cur),
  },
  {
    key: 'vesperalLiturgy', name: 'Vesperal Liturgy of St. Basil', kind: 'date',
    description: 'Vespers with the Liturgy of St. Basil — Great Saturday, and the eves of Nativity and Theophany.',
    keywords: ['vesperal', 'basil', 'holy saturday', 'great saturday', 'fifteen readings', 'arise o god'],
    isServed: (d) => d.ctx.isVesperalLiturgyDay(d.cur),
  },
  {
    key: 'paschaCollection', name: 'Holy Pascha Collection', kind: 'date',
    description: 'Midnight Office, Paschal Matins and the Paschal Liturgy as one night.',
    keywords: ['pascha', 'easter', 'paschal', 'midnight office', 'christ is risen', 'resurrection night', 'procession'],
    isServed: (d) => {
      const p = d.ctx.calculatePascha(d.cur.getUTCFullYear());
      return d.cur.getUTCMonth() === p.getUTCMonth() && d.cur.getUTCDate() === p.getUTCDate();
    },
  },
  {
    key: 'paschalHours', name: 'Paschal Hours', kind: 'date',
    description: 'The sung Hours that replace the read Hours through Bright Week.',
    keywords: ['paschal hours', 'bright week', 'hours', 'pascha', 'easter week'],
    isServed: (d) => d.ctx.getLiturgicalSeason(d.cur) === 'brightWeek',
  },
  {
    key: 'kneelingVespers', name: 'Kneeling Vespers of Pentecost', kind: 'date',
    description: 'Vespers of Pentecost Sunday with the three Kneeling Prayers.',
    keywords: ['kneeling', 'pentecost', 'trinity sunday', 'kneeling prayers', 'holy spirit', 'gonyklisia'],
    isServed: (d) => daysFromPascha(d) === 49,
  },
  {
    key: 'panikhida', name: 'Panikhida', kind: 'form',
    description: 'Memorial service for the departed — enter the names; any day except Bright Week.',
    keywords: ['panikhida', 'pannikhida', 'panihida', 'memorial', 'requiem', 'departed', 'repose', 'reposed',
               'funeral', 'parastas', 'memory eternal', 'with the saints give rest', 'dead', 'death', 'anniversary',
               'forty days', '40 days', 'trisagion for the departed', 'mnemosyno', 'soul'],
    form: 'panikhida',
  },
];

/** Shape the per-date context every `isServed` predicate reads. */
function dayContext(ctx, cur, style, sources) {
  const dateStr = cur.toISOString().slice(0, 10);
  const dow = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][cur.getUTCDay()];
  const entry = ctx.getCalendarEntry(dateStr, style);
  const vespersEntry = ctx.getCalendarEntry(ctx.getNextDateStr(dateStr), style);
  const season = entry ? (entry.liturgicalContext?.season || null) : null;
  return { cur, dateStr, dow, season, entry, vespersEntry, style, sources, ctx };
}

/** The `services` map /api/days emits for one date. */
function servicesForDay(d) {
  const out = {};
  for (const s of SERVICE_CATALOG) {
    if (s.kind !== 'date' || s.inDays === false) continue;
    out[s.key] = !!s.isServed(d);
  }
  return out;
}

const norm = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();

/**
 * Does this catalog entry match the query? Whole-query substring against the
 * name or any keyword, or every query word a prefix of some word in them.
 */
function matches(entry, query) {
  const q = norm(query);
  if (q.length < 2) return false;
  const hay = [entry.name, ...entry.keywords].map(norm);
  if (hay.some(h => h.includes(q))) return true;
  const words = new Set(hay.flatMap(h => h.split(' ')));
  return q.split(' ').every(t => [...words].some(w => w.startsWith(t)));
}

/**
 * First date on/after `from` (UTC noon) on which the service is served,
 * scanning up to `horizonDays` ahead. Null if none in range.
 */
function nextServed(entry, ctx, from, style, sources, horizonDays = 400) {
  let cur = new Date(from);
  for (let i = 0; i < horizonDays; i++) {
    if (entry.isServed(dayContext(ctx, cur, style, sources))) return cur.toISOString().slice(0, 10);
    cur = new Date(cur.getTime() + DAY_MS);
  }
  return null;
}

/** Search hits for a query, ready to serialize. */
function searchServices(query, ctx, { style = 'new', sources = null, from = null } = {}) {
  const start = from || new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00Z');
  const hits = [];
  for (const s of SERVICE_CATALOG) {
    if (s.searchable === false || !matches(s, query)) continue;
    const hit = { key: s.key, name: s.name, description: s.description, kind: s.kind };
    if (s.kind === 'form') {
      hit.form = s.form;
    } else {
      hit.nextDate = nextServed(s, ctx, start, style, sources);
      hit.svcType  = s.key;
    }
    hits.push(hit);
  }
  return hits;
}

module.exports = { SERVICE_CATALOG, dayContext, servicesForDay, searchServices, matches, nextServed };
