'use strict';

// Dashboard data builder: for each day in the year, computes presence/source
// of each liturgical layer (vespers, matins, liturgy, etc.) so the
// /api/dashboard endpoint can render a coverage matrix.

const {
  calculatePascha,
  getLiturgicalSeason,
  getTone,
  isBridegroomMatins,
  isBurialVespersDay,
  isLamentationsDay,
  isLiturgyServed,
  isPassionGospelsDay,
  isPresanctifiedDay,
  isRoyalHoursDay,
  isVesperalLiturgyDay,
} = require('../../calendar-rules');

const { openDb }                  = require('../cache/sqlite');
const { getCalendarEntry }        = require('../sources/calendar');
const { getMenaionDayList }       = require('../sources/menaion');
const { GENERAL_MENAION_FALLBACK } = require('../sources/general-menaion');
const { buildMatinsSpec }         = require('../sources/matins-spec');

/**
 * Builds coverage data for every day in the given year.
 * Returns an array of { date, season, tone, feast, hasService, score, primarySource, layers, services }.
 *
 * score: 0–1 composite coverage (calendar entry, octoechos, prokeimena, troparia, stichera)
 * primarySource: 'oca' | 'stSergius' | 'generic' | 'mixed' | null
 * layers: { calendarEntry, octoechos, prokeimena, troparia, stichera, aposticha, triodion }
 *         each: { present: bool, source: string|null }
 */
function buildDashboardData(year, sources, style = 'new') {
  const DAY_MS_LOCAL = 24 * 60 * 60 * 1000;
  const jan1  = new Date(Date.UTC(year, 0, 1));
  const dec31 = new Date(Date.UTC(year, 11, 31));

  // Batch-load Menaion DB data for the whole year
  let tropariaCounts = {};  // "MM-DD" → count
  let sticheraCounts = {};  // "MM-DD" → { count, sources }
  let generalMenaionTypes = {};  // "MM-DD" → saint_type if any
  try {
    const db = openDb();
    if (db) {
      // Count troparia per day
      const tropRows = db.prepare(`
        SELECT c.month, c.day, COUNT(DISTINCT t.commemoration_id) AS cnt
        FROM troparia t JOIN commemorations c ON c.id = t.commemoration_id
        WHERE t.type = 'troparion'
        GROUP BY c.month, c.day
      `).all();
      for (const r of tropRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        tropariaCounts[key] = r.cnt;
      }

      // Count stichera per day with source info and section breakdown
      const stichRows = db.prepare(`
        SELECT c.month, c.day, COUNT(*) AS cnt,
               GROUP_CONCAT(DISTINCT s.source) AS sources,
               GROUP_CONCAT(DISTINCT s.section) AS sections
        FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id
        GROUP BY c.month, c.day
      `).all();
      for (const r of stichRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        sticheraCounts[key] = { count: r.cnt, sources: r.sources || '', sections: r.sections || '' };
      }

      // Get saint_type for primary commemoration per day (for general menaion fallback detection)
      const gmRows = db.prepare(`
        SELECT month, day, saint_type FROM commemorations
        WHERE saint_type IS NOT NULL
        ORDER BY id
      `).all();
      for (const r of gmRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        if (!generalMenaionTypes[key]) generalMenaionTypes[key] = r.saint_type;
      }

      db.close();
    }
  } catch (err) {
    console.error('Dashboard DB query error:', err.message);
  }

  // Check which saint types have general menaion entries
  let gmAvailableTypes = new Set();
  try {
    const db = openDb();
    if (db) {
      const gmTypes = db.prepare(`SELECT DISTINCT saint_type FROM general_menaion`).all();
      for (const r of gmTypes) gmAvailableTypes.add(r.saint_type);
      // Add fallback mappings
      for (const [plural, singular] of Object.entries(GENERAL_MENAION_FALLBACK)) {
        if (gmAvailableTypes.has(singular)) gmAvailableTypes.add(plural);
      }
      db.close();
    }
  } catch (_) {}

  const result = [];
  let cur = new Date(jan1);

  while (cur <= dec31) {
    const dateStr = cur.toISOString().slice(0, 10);
    const [, mm, dd] = dateStr.split('-');
    const dayKey = `${mm}-${dd}`;
    const dowIdx = cur.getUTCDay();
    const dowStr = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];

    // Get calendar entry (cheap)
    const entry = getCalendarEntry(dateStr, style);
    const season = entry ? (entry.liturgicalContext?.season || null) : getLiturgicalSeason(cur);
    const tone = entry ? (entry.liturgicalContext?.tone ?? null) : null;

    const hasService = !!entry;
    const services = {
      greatVespers: entry?.vespers?.serviceType === 'greatVespers' && !entry?.vespers?.serviceKey,
      dailyVespers: entry?.vespers?.serviceType === 'dailyVespers',
      allNightVigil: entry?.vespers?.serviceType === 'all-night-vigil',
      burialVespers: isBurialVespersDay(cur),
      bridegroomMatins: isBridegroomMatins(cur),
      lamentations: isLamentationsDay(cur),
      vesperalLiturgy: isVesperalLiturgyDay(cur),
      royalHours: isRoyalHoursDay(cur),
      matins: !!buildMatinsSpec(dateStr, cur, dowStr, season, getTone(cur), sources, style),
      liturgy: !!(entry?.liturgy) || isLiturgyServed(cur, style),
      passionGospels: isPassionGospelsDay(cur),
      presanctified: isPresanctifiedDay(cur, style),
      paschalHours: getLiturgicalSeason(cur) === 'brightWeek',
      paschaCollection: (() => {
        const p = calculatePascha(cur.getUTCFullYear());
        return cur.getUTCMonth() === p.getUTCMonth() && cur.getUTCDate() === p.getUTCDate();
      })(),
    };

    // Feast name from Menaion DB
    let feast = null;
    try {
      const dayList = getMenaionDayList(parseInt(mm), parseInt(dd));
      if (dayList) feast = dayList.principal;
    } catch (_) {}

    // Coverage layers
    const hasTroparia  = !!tropariaCounts[dayKey];
    const stichInfo    = sticheraCounts[dayKey];
    const hasStichera  = !!stichInfo;
    const saintType    = generalMenaionTypes[dayKey];
    const hasGmFallback = saintType && gmAvailableTypes.has(saintType) && !hasStichera;

    // Determine sources used
    const sourcesUsed = new Set();
    if (hasStichera && stichInfo.sources) {
      for (const s of stichInfo.sources.split(',')) {
        if (s === 'oca-menaion') sourcesUsed.add('oca');
        else if (s.startsWith('stSergius')) sourcesUsed.add('stSergius');
        else if (s) sourcesUsed.add(s);
      }
    }
    if (hasGmFallback) sourcesUsed.add('generic');

    // Determine Octoechos presence (relevant for Saturday Great Vespers / Friday)
    const needsOctoechos = dowStr === 'saturday' || dowStr === 'friday';
    const hasOctoechos = hasService && needsOctoechos;
    // Prokeimena always available from JSON
    const hasProkeimena = hasService;
    // Triodion check — relevant for Lenten season
    const lentenSeasons = ['greatLent', 'preLenten', 'holyWeek', 'brightWeek', 'pentecostarion'];
    const needsTriodion = lentenSeasons.includes(season);
    const hasTriodion = needsTriodion ? (entry?.vespers?.lordICall?.slots?.some(s => s.source === 'db' || s.source === 'triodion') || false) : true;

    // Composite score — contextual weights based on what the service actually needs
    let score = 0;
    if (hasService) {
      // Saturdays: full 6-layer scoring; weekdays: skip octoechos weight and redistribute
      const isSat = needsOctoechos;
      const weights = isSat
        ? { calendar: 0.15, octoechos: 0.2, prokeimena: 0.1, troparia: 0.2, stichera: 0.25, triodion: 0.1 }
        : { calendar: 0.15, prokeimena: 0.1, troparia: 0.3, stichera: 0.35, triodion: 0.1 };
      score += weights.calendar; // always have calendar entry if hasService
      if (isSat && hasOctoechos) score += weights.octoechos;
      if (hasProkeimena) score += weights.prokeimena;
      if (hasTroparia)   score += weights.troparia;
      if (hasStichera || hasGmFallback) score += weights.stichera;
      if (hasTriodion)   score += weights.triodion;
    }

    // Liturgy content score — the liturgy is dynamically built from orthocal + Menaion DB,
    // so any day with liturgy served gets a base score; troparia/kontakia add more.
    const liturgyServed = services.liturgy;
    let liturgyScore = 0;
    if (liturgyServed) {
      liturgyScore = 0.5;                        // base: fixed texts + orthocal readings
      if (hasTroparia) liturgyScore += 0.25;     // saint troparia/kontakia from Menaion DB
      if (dowStr === 'sunday') liturgyScore += 0.25; // resurrectional content from Octoechos
      else if (hasTroparia) liturgyScore += 0.25; // weekday: troparia are the main variable
      liturgyScore = Math.min(liturgyScore, 1.0);
    }

    // Primary source
    let primarySource = null;
    if (sourcesUsed.size > 1) primarySource = 'mixed';
    else if (sourcesUsed.has('oca')) primarySource = 'oca';
    else if (sourcesUsed.has('stSergius')) primarySource = 'stSergius';
    else if (sourcesUsed.has('generic')) primarySource = 'generic';
    else if (hasService && hasTroparia) primarySource = 'oca'; // troparia from OCA scraper

    const layers = {};
    if (hasService) {
      layers.calendarEntry = { present: true, source: entry?._meta?.generated ? 'auto-generated' : 'hand-authored' };
      layers.octoechos     = { present: hasOctoechos, source: hasOctoechos ? 'OCA Obikhod' : null };
      layers.prokeimena    = { present: hasProkeimena, source: 'prokeimena.json' };
      layers.troparia      = { present: hasTroparia, source: hasTroparia ? 'OCA Menaion' : null };
      layers.stichera      = { present: hasStichera, source: hasStichera ? formatSticheraSource(stichInfo.sources) : (hasGmFallback ? 'General Menaion' : null) };
      if (hasGmFallback && !hasStichera) {
        layers.stichera.present = true;
        layers.stichera.source = 'General Menaion (fallback)';
      }
      layers.aposticha     = { present: hasStichera && stichInfo.sections?.includes('aposticha'), source: hasStichera && stichInfo.sections?.includes('aposticha') ? formatSticheraSource(stichInfo.sources) : null };
      if (needsTriodion) {
        layers.triodion = { present: hasTriodion, source: hasTriodion ? 'triodion JSON' : null };
      }
    }

    result.push({
      date: dateStr,
      dayOfWeek: dowStr,
      season,
      tone,
      feast,
      hasService,
      score: Math.round(score * 100) / 100,
      liturgyScore,
      primarySource,
      layers,
      services,
    });

    cur = new Date(cur.getTime() + DAY_MS_LOCAL);
  }

  return result;
}

function formatSticheraSource(sourcesStr) {
  if (!sourcesStr) return null;
  const parts = sourcesStr.split(',');
  const labels = parts.map(s => {
    if (s === 'oca-menaion') return 'OCA';
    if (s.startsWith('stSergius')) return 'St. Sergius';
    if (s === 'lambertsen') return 'Lambertsen Menaion';
    return s;
  });
  return [...new Set(labels)].join(' + ');
}

module.exports = { buildDashboardData, formatSticheraSource };
