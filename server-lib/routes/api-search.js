'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

function handle(req, res, ctx) {
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  const {
    sources, fixedTexts, liturgyFixed, presanctifiedFixed,
    paschalHoursFixed, midnightOfficeFixed, paschalMatinsFixed,
    passionGospelsFixed, bridegroomMatinsFixed, lamentationsFixed,
    vesperalLiturgyFixed, kneelingVespersFixed, royalHoursFixed,
    matinsFixed,
    parseQuery, escHtml, formatDate, serveStatic, loadJSON,
    getCalendarEntry, getNextDateStr,
    getMenaionRanked, getSticheraDay, getMenaionDay, getMenaionDayList,
    getGeneralMenaionTexts, GENERAL_MENAION_FALLBACK,
    GREAT_FEAST_VARIANTS, PENTECOSTARION_SUNDAY_OVERRIDES,
    LITURGICAL_DAY_LABELS, DAY_PATRONS,
    buildMatinsSpec, buildLiturgyFromOrthocal,
    buildDbSource, getDbBlocks, mapDbBlocks,
    openDb, ensureOrthocalCacheTable, fetchOrthocalDay,
    fixedTextRegistry, getOverlayFixed, getLiturgyFixed, getOverlayRubrics,
    getTranslationManifests, tagBlocksWithOverlay, diffOverlay, resolveTranslation,
    assembleForDate, applyYouYour, getDayLabel,
    HOME_CSS, renderHomePage, getCollectedDates,
    formatAssemblyWarning, renderErrorPage, renderServiceHTML,
    buildDashboardData, formatSticheraSource,
    assembleVespers, assembleLiturgy, assemblePresanctified, assemblePaschalHours,
    assembleMidnightOffice, assemblePaschalMatins, assembleBridegroomMatins,
    assemblePassionGospels, assembleLamentations, assembleVesperalLiturgy,
    assembleRoyalHours, assembleMatins, resolveSource,
    generateCalendarEntry, getLiturgicalSeason, getDayOfWeek, getLiturgicalKey,
    getLiturgyVariant, getTone, getTrisagionSubstitution, isLiturgyServed,
    isPresanctifiedDay, isBridegroomMatins, isPassionGospelsDay, isLamentationsDay,
    isVesperalLiturgyDay, isRoyalHoursDay, isBurialVespersDay,
    getWeekOfLent, calculatePascha, getGreatFeastKey, isSoulSaturday, getEothinon,
    renderService, renderVespers, getMatinsKathismata, deduplicateBySource,
  } = ctx;

      const q = parseQuery(url);
      const query = (q.q || '').trim();
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (query.length < 2) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }

      let results = [];
      try {
        const db = openDb();
        if (db) {
          // Find matching commemorations, deduplicate by title across months
          const rows = db.prepare(`
            SELECT id, month, day, title, rank
            FROM commemorations
            WHERE title LIKE ?
            ORDER BY rank DESC, month, day
            LIMIT 40
          `).all(`%${query}%`);

          // Compute 2026 date and check service availability
          const seen = new Set();
          for (const row of rows) {
            const key = row.title.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const mm = String(row.month).padStart(2, '0');
            const dd = String(row.day).padStart(2, '0');
            // Find the nearest upcoming Saturday on or after this calendar date in 2026
            // that falls within a Saturday window, or just use the calendar date
            const dateStr = `2026-${mm}-${dd}`;
            // Find what Saturday this day falls on (Vespers is on Saturday)
            const date = new Date(`${dateStr}T12:00:00`);
            const dow = date.getDay(); // 0=Sun
            // For search results, show the calendar date; Great Vespers is Saturday night
            // so if the feast is on a Sunday, Vespers is Saturday night before (subtract 1 day)
            let serviceDate = dateStr;
            if (dow === 0) {
              // Sunday feast — Vespers was Saturday evening
              const sat = new Date(date);
              sat.setDate(sat.getDate() - 1);
              serviceDate = sat.toISOString().slice(0, 10);
            }

            const entry = getCalendarEntry(serviceDate);
            const svcType = entry?.vespers?.serviceType || null;
            const hasService = !!(svcType);

            results.push({
              id:          serviceDate,
              title:       row.title,
              dateStr:     serviceDate,
              svcType:     svcType || 'greatVespers',
              displayDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
              available:   hasService,
            });
          }
        }
      } catch (err) {
        console.error('/api/search error:', err);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));

}

module.exports = handle;
