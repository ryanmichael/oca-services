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
      // Cascade any Octoechos overlay for the active stack (e.g. Myrrh-bearers)
      // so every octoechos read below picks up the parish's chosen translation.
      const reqSources  = { ...sources, octoechos: resolveOctoechos(sources, translation) };

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      (async () => {
      // ── Vespers date-shift ─────────────────────────────────────────────────
      // Vespers is the first service of the next liturgical day.  The API date
      // represents the civil evening the service is served; the liturgical
      // content comes from the *next* calendar date.
      //
      // Exception: Burial Vespers (Holy Friday afternoon) uses the day's own
      // texts — it is NOT the evening vespers that begins the next day.
      // Resolved here rather than below, because the Vespers entry itself is
      // shaped by the parish's Litya policy before assembly sees it.
      const overlayRubrics = getOverlayRubrics(translation);
      const dayEntry = getCalendarEntry(date, style, { rubrics: overlayRubrics });
      const isBurialVespers = dayEntry?.vespers?.serviceKey === 'burialVespers';
      const vespersDate = isBurialVespers ? date : getNextDateStr(date);

      // For Lenten weekday Vespers, enrich prokeimenon entries with pericopes from orthocal API.
      // For vigil-rank Sundays with OT prophecies (e.g. Holy Fathers), enrich
      // otReadings with full scripture text from orthocal.
      let entryOverride = null;
      try {
        const baseEntry = getCalendarEntry(vespersDate, style, { rubrics: overlayRubrics });
        if (baseEntry?.vespers?.otReadings?.length > 0) {
          const orthocalData = await fetchOrthocalDay(vespersDate);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          const enrichedReadings = baseEntry.vespers.otReadings.map((r, i) => {
            const match = vesperReadings[i];
            if (match?.passage?.length) {
              const text = match.passage.map(p => p.content).join(' ');
              return { ...r, text };
            }
            return r;
          });
          entryOverride = {
            ...baseEntry,
            vespers: { ...baseEntry.vespers, otReadings: enrichedReadings },
          };
        }
        if (baseEntry?.liturgicalContext?.season === 'greatLent' &&
            baseEntry?.vespers?.serviceType === 'dailyVespers') {
          const orthocalData = await fetchOrthocalDay(vespersDate);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          if (vesperReadings.length > 0) {
            // Deep-clone just the prokeimenon entries so we don't mutate the shared calendar entry
            const entries = (baseEntry.vespers?.prokeimenon?.entries || []).map(e => {
              // API returns book:"OT" for all Vespers readings; match by book name in display field
              const match = vesperReadings.find(r =>
                r.display && e.reading?.book &&
                r.display.toLowerCase().startsWith(e.reading.book.toLowerCase())
              );
              if (match && match.display) {
                // Extract pericope from display (e.g. "Genesis 10.32-11.9" → "10:32–11:9")
                const raw = match.display.replace(/^[A-Za-z ]+/, '').trim();
                // Normalize: first dot between digits becomes colon, subsequent dot becomes em-dash start
                const pericope = raw.replace(/(\d+)\.(\d+)-(\d+)\.(\d+)/, '$1:$2–$3:$4')
                                    .replace(/(\d+)\.(\d+)/, '$1:$2');
                return { ...e, reading: { ...e.reading, pericope } };
              }
              return e;
            });
            entryOverride = {
              ...baseEntry,
              vespers: {
                ...baseEntry.vespers,
                prokeimenon: { ...baseEntry.vespers.prokeimenon, entries },
              },
            };
          }
        }
      } catch (err) {
        console.warn('Orthocal pericope fetch failed (non-fatal):', err.message);
      }

      const vespersFixedResolved = translation
        ? (getOverlayFixed('vespers', translation) || fixedTexts)
        : fixedTexts;
      let result;
      try {
        result = assembleForDate(vespersDate, pronoun, entryOverride, vespersFixedResolved, reqSources, style,
          { rubrics: overlayRubrics });
      } catch (err) {
        console.error('assembleForDate error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No service available for this date.', date }));
        return;
      }

      const { blocks, calendarEntry, serviceTitle, tone } = result;
      const season = calendarEntry.liturgicalContext?.season || null;
      const dow    = calendarEntry.dayOfWeek || null;
      const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);

      // Use calendar entry commemorations if present; otherwise fall back to Menaion DB
      let commemorations = calendarEntry.commemorations || [];
      if (commemorations.length === 0) {
        const [vy, vm, vd] = vespersDate.split('-').map(Number);
        const civilDate    = new Date(Date.UTC(vy, vm - 1, vd));
        const adj          = ctx.fixedFeastDate(civilDate, style);
        const mm = adj.getUTCMonth() + 1;
        const dd = adj.getUTCDate();
        const dayList = getMenaionDayList(mm, dd);
        if (dayList) {
          commemorations = dayList.commemorations.map((title, i) => ({
            title,
            isPrincipal: i === 0,
            tone: null,
            hasStichera: false,
          }));
        }
      }

      // Relabel 'db' source to the actual liturgical book for dev-mode display
      const dbSourceLabel = season === 'pentecostarion' ? 'pentecostarion'
        : season === 'brightWeek' ? 'pentecostarion'
        : (season === 'greatLent' || season === 'holyWeek' || season === 'preLenten') ? 'triodion'
        : 'db';
      for (const b of blocks) {
        if (b.source === 'db') b.source = dbSourceLabel;
        if (!b.provenance) b.provenance = 'OCA';
      }

      if (format === 'html') {
        const toneLabel = tone ? ` · Tone ${tone}` : '';
        renderServiceHTML(res, blocks, serviceTitle, `${formatDate(date)}${toneLabel}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        vespersDate,
        serviceType:      calendarEntry.vespers?.serviceType || 'greatVespers',
        serviceName:      serviceTitle,
        tone,
        season,
        liturgicalLabel,
        commemorations,
        translation:      translation || null,
        style,
        blocks,
      }));
      })().catch(err => {
        console.error('/api/service async error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

}

module.exports = handle;
