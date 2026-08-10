/**
 * Top-level calendar entry fan-out.
 *
 * Single entry point that switches on (date, style) and dispatches to the
 * appropriate season/feast generator. This is the only module that knows
 * about *all* generators; each generator module is independent.
 *
 * Extracted from calendar-rules.js as Track D Step 9 (final step).
 */

'use strict';

const {
  getDayOfWeek,
  getLiturgicalSeason,
  getWeekOfLent,
  getLentenSaturdayNumber,
  isSoulSaturday,
  getLiturgicalKey,
} = require('./seasons');
const { getTone } = require('./cycle');
const { getGreatFeastKey, getFeastRank, fixedFeastDate } = require('./fixed-feasts');

const fs   = require('fs');
const path = require('path');

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// Vigil- and Polyeleos-rank saints are appointed three Old Testament paremias at
// Great Vespers. The renderer (assemblers/vespers-parts/ot-readings.js) and the
// orthocal text-enrichment (server-lib/routes/api-service.js) both already
// existed, but nothing ever put `otReadings` on a fixed-date entry — only the
// pentecostarion generator set it, so every polyeleos saint's paremias were
// silently absent. The season generators are deliberately menaion-free, so the
// attachment happens here, after dispatch.
//
// Enrichment in api-service.js runs before assembly and only fills in scripture
// TEXT for readings already declared, so the references have to be on the entry
// by the time it returns — which is why this can't live in for-date.js with the
// rest of the menaion injection.
//
// Surfaced 2026-08-07 auditing 8-09 (St. Herman of Alaska): the three Wisdom
// readings the OCA order appoints were missing from the Vespers render entirely.
function attachPolyeleosParemias(entry, date, style) {
  if (!entry?.vespers || entry.vespers.otReadings) return entry;
  const rank = getFeastRank(date, style);
  if (rank !== 'polyeleos' && rank !== 'vigil') return entry;

  const adj  = fixedFeastDate(date, style);
  const file = `${MONTH_NAMES[adj.getUTCMonth()]}-${String(adj.getUTCDate()).padStart(2, '0')}.json`;
  const p    = path.resolve(__dirname, '..', 'variable-sources', 'menaion', file);
  if (!fs.existsSync(p)) return entry;

  try {
    const readings = JSON.parse(fs.readFileSync(p, 'utf8'))?.vespers?.otReadings;
    if (Array.isArray(readings) && readings.length) {
      // Menaion files carry { book, reference: "Wisdom of Solomon 3:1-9" }; the
      // renderer and the pentecostarion generator use { order, book, pericope }.
      // Normalize here so neither the renderer nor the five menaion files that
      // declare readings have to change. Without `order` the three readings
      // would also collide on identical block ids.
      entry.vespers = {
        ...entry.vespers,
        otReadings: readings.map((r, i) => ({
          order:    r.order ?? i + 1,
          book:     r.book,
          pericope: r.pericope
            ?? String(r.reference || '').replace(r.book, '').trim()
            ?? '',
        })),
      };
    }
  } catch { /* malformed menaion file — leave the entry alone */ }
  return entry;
}

const {
  generateOrdinaryTimeWeekday,
  generateOrdinaryTimeSaturday,
} = require('./generators/ordinary-time');
const {
  generateGreatFeastVespers,
  generateVigilFeastVespers,
} = require('./generators/great-feast');
const {
  generateSoulSaturday,
  generateLentenSaturday,
  generateLentenSunday,
  generateLentenWeekday,
} = require('./generators/lent');
const { generateHolyWeekDay } = require('./generators/holy-week');
const { generatePreLentenDay } = require('./generators/pre-lent');
const { generateBrightWeekDay } = require('./generators/bright-week');
const { generatePentecostarionDay } = require('./generators/pentecostarion');

/**
 * Generates a calendar entry object for a given date, or returns null
 * if the date/season is not yet supported.
 *
 * @param {string} dateStr  "YYYY-MM-DD"
 * @returns {Object|null}
 */
function generateCalendarEntry(dateStr, style = 'new') {
  const [y0, m0, d0] = dateStr.split('-').map(Number);
  return attachPolyeleosParemias(
    dispatchCalendarEntry(dateStr, style),
    new Date(Date.UTC(y0, m0 - 1, d0)),
    style,
  );
}

function dispatchCalendarEntry(dateStr, style = 'new') {
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
  //
  // NOT ON A SUNDAY. The vigil generator ships `slots: []` with no Octoechos
  // slot at all, so on a Sunday it erased the Resurrection outright: 2026-11-08
  // (Synaxis of the Archangels) and 2026-12-06 (St Nicholas) both rendered NINE
  // Lord-I-Call hymns, every one of them the saint's, and no resurrectional
  // stichera whatever. A vigil-rank saint never displaces the Resurrection on a
  // Sunday; he shares the day with it.
  //
  // Three OCA order documents, three different saints, all agree on the shape:
  //   2025-0629 Peter and Paul   4 stichera of the Resurrection + 6 of the Apostles
  //   2022-1009 St Tikhon        4 of the Resurrection + 6 of St Tikhon
  //   2023-1001 the Protection   4 of the Resurrection + 6 of the Protection
  // with "Glory… <saint>" and "Now and ever… Dogmatic Theotokion" of the tone.
  //
  // Falling through to the Sunday generator produces exactly that with no
  // further arithmetic: it sets totalStichera 10, and `isSundayGreatVespers`
  // already caps the Menaion at 6, which leaves 4 for the Resurrection.
  //
  // What is lost is the Litya, which the Sunday generator has no block for. Both
  // saint's-day orders print it as "[Litya]" — bracketed, meaning "commonly
  // omitted in parish practice" — so omitting it is defensible; a parish that
  // serves one needs the Litya-policy work that this rank/practice coupling is
  // still waiting on.
  const feastRank = getFeastRank(date, style);
  if (feastRank === 'vigil' && dow !== 'sunday') {
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

module.exports = { generateCalendarEntry };
