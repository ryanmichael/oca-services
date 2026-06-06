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

      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      const pascha = calculatePascha(d.getUTCFullYear());
      const isPaschaDay = d.getUTCFullYear() === pascha.getUTCFullYear()
        && d.getUTCMonth() === pascha.getUTCMonth()
        && d.getUTCDate() === pascha.getUTCDate();

      if (!isPaschaDay) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Holy Pascha Collection is only available on Pascha Sunday.',
          date,
        }));
        return;
      }

      (async () => {
        try {
          const allBlocks = [];
          const serviceTitle = (n, title) => ({
            id: `pascha-title-${n}`,
            section: title,
            type: 'rubric',
            speaker: null,
            text: title,
            label: 'service-title',
          });

          // Each sub-service assembler uses its own id namespace (e.g. multiple
          // `dis-amen` blocks), so prefix per-service ids when bundling.
          const namespace = (prefix, blocks) =>
            blocks.map(b => b.id ? { ...b, id: `${prefix}-${b.id}` } : b);

          // ── Part 1: Midnight Office ──
          allBlocks.push(serviceTitle(1, 'The Midnight Office'));
          const moBlocks = assembleMidnightOffice(midnightOfficeFixed);
          allBlocks.push(...namespace('mo', moBlocks));

          // ── Part 2: Paschal Matins ──
          allBlocks.push(serviceTitle(2, 'Paschal Matins'));
          const matinsBlocks = assemblePaschalMatins(paschalMatinsFixed);
          allBlocks.push(...namespace('pm', matinsBlocks));

          // ── Part 3: Paschal Hours ──
          allBlocks.push(serviceTitle(3, 'The Paschal Hours'));
          const hoursBlocks = assemblePaschalHours(paschalHoursFixed);
          allBlocks.push(...namespace('ph', hoursBlocks));

          // ── Part 4: Paschal Liturgy ──
          allBlocks.push(serviceTitle(4, 'The Paschal Divine Liturgy'));
          let calendarEntry = getCalendarEntry(date);
          if (calendarEntry && !calendarEntry.liturgy) {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources) };
          }
          if (calendarEntry?.liturgy) {
            const litTranslation = resolveTranslation(q);
            const litBlocks = assembleLiturgy(calendarEntry, getLiturgyFixed(litTranslation), sources,
              { rubrics: getOverlayRubrics(litTranslation) });
            allBlocks.push(...namespace('pl', litBlocks));
          }

          // Pronoun switching
          if (pronoun === 'yy') {
            for (const block of allBlocks) {
              if (block.text)  block.text  = applyYouYour(block.text);
              if (block.label) block.label = applyYouYour(block.label);
            }
          }

          if (format === 'html') {
            renderServiceHTML(res, allBlocks, 'Holy Pascha Collection', `${formatDate(date)} · The Holy Pascha`, pronoun);
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            date,
            serviceType:     'pascha-collection',
            serviceName:     'Holy Pascha Collection',
            season:          'brightWeek',
            liturgicalLabel: 'The Holy Pascha — Resurrection of Christ',
            blocks:          allBlocks,
          }));
        } catch (err) {
          console.error('pascha-collection error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      })();

}

module.exports = handle;
