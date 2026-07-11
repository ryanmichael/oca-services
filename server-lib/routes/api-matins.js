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
    getTranslationManifests, tagBlocksWithOverlay, diffOverlay, resolveTranslation, resolveStyle,
    resolveOctoechos,
    assembleForDate, applyYouYour, resolvePronoun, getDayLabel,
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
      const format  = (q.format  || '').trim().toLowerCase();
      const translation = resolveTranslation(q);
      // Register: explicit ?pronoun wins; else the parish/overlay defaultPronoun; else 'tt'.
      const pronoun = resolvePronoun(q, getOverlayRubrics(translation));
      const style       = resolveStyle(q, translation);
      // Cascade any Octoechos overlay for the active stack (e.g. Myrrh-bearers).
      const reqSources  = { ...sources, octoechos: resolveOctoechos(sources, translation) };

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      (async () => {
      const d      = new Date(date + 'T12:00:00Z');
      const dow    = getDayOfWeek(d);
      const season = getLiturgicalSeason(d);
      const tone   = getTone(d);

      // ── Bright Week: Matins = Paschal Matins (Pascha through Bright Saturday) ──
      if (season === 'brightWeek') {
        let blocks;
        try {
          blocks = assemblePaschalMatins(paschalMatinsFixed);
        } catch (err) {
          console.error('assemblePaschalMatins error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }
        if (format === 'html') {
          renderServiceHTML(res, blocks, 'Paschal Matins', formatDate(date), pronoun);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType: 'matins',
          serviceName: 'Paschal Matins',
          season,
          blocks,
        }));
        return;
      }

      // Build the matins spec from available data
      const matinsSpec = buildMatinsSpec(date, d, dow, season, tone, reqSources, style);

      // Enrich Matins Gospel with full scripture text from orthocal API
      if (matinsSpec?.gospel && !matinsSpec.gospel.text) {
        try {
          const orthocalData = await fetchOrthocalDay(date);
          const matinsReading = (orthocalData.readings || []).find(
            r => r.source && r.source.includes('Matins Gospel')
          );
          if (matinsReading?.passage?.length) {
            matinsSpec.gospel.text = matinsReading.passage.map(v => v.content).join('\n\n');
            matinsSpec.gospel._source = 'orthocal';
          }
        } catch (err) {
          console.warn('Matins gospel enrichment failed (non-fatal):', err.message);
        }
      }

      if (!matinsSpec) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'No Matins data available for this date. Currently supported: Sundays (all tones) and great feasts with menaion data.',
          date,
        }));
        return;
      }

      const calendarDay = {
        date,
        dayOfWeek: dow,
        liturgicalContext: { season, tone },
        matins: matinsSpec,
      };

      const overlayRubrics = getOverlayRubrics(translation);

      let blocks;
      try {
        blocks = assembleMatins(calendarDay, matinsFixed, fixedTexts, reqSources, { rubrics: overlayRubrics });
      } catch (err) {
        console.error('assembleMatins error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        const toneLabel = tone ? ` · Tone ${tone}` : '';
        renderServiceHTML(res, blocks, 'Matins (Orthros)', `${formatDate(date)}${toneLabel}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'matins',
        serviceName:    'Matins (Orthros)',
        tone,
        season,
        translation:    translation || null,
        style,
        blocks,
      }));
      })();

}

module.exports = handle;
