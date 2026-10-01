'use strict';

const fs   = require('fs');
const http = require('http');          // also a pre-split server.js global
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const { servicesForDay } = require('../search/service-catalog');
const choirAssets        = require('../search/choir-assets');

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
      const translation = resolveTranslation(q);
      const style       = resolveStyle(q, translation);

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      // Determine available services (same logic as /api/days, single date)
      const d = new Date(date + 'T12:00:00Z');
      const [, mm, dd] = date.split('-').map(Number);
      const dowIdx = d.getUTCDay();
      const dowStr = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];
      const entry  = getCalendarEntry(date, style);
      const season = entry ? (entry.liturgicalContext?.season || null) : null;
      const tone   = entry ? (entry.liturgicalContext?.tone ?? entry.vespers?.lordICall?.tone ?? null) : null;
      const liturgicalLabel = entry ? getDayLabel(entry, dowStr, season, entry.date) : null;

      // Feast + commemorations
      let commemorations = [];
      try {
        const dayList = getMenaionDayList(mm, dd);
        if (dayList) commemorations = dayList.commemorations;
      } catch (_) {}

      const svcMap = {
        greatVespers:    { key: 'greatVespers',    name: 'Great Vespers',                  endpoint: '/api/service' },
        dailyVespers:    { key: 'dailyVespers',    name: 'Daily Vespers',                  endpoint: '/api/service' },
        matins:          { key: 'matins',           name: 'Matins',                         endpoint: '/api/matins' },
        liturgy:         { key: 'liturgy',          name: 'Divine Liturgy',                 endpoint: '/api/liturgy' },
        presanctified:   { key: 'presanctified',    name: 'Presanctified Liturgy',          endpoint: '/api/presanctified' },
        bridegroomMatins:{ key: 'bridegroomMatins', name: 'Bridegroom Matins',              endpoint: '/api/bridegroom-matins' },
        passionGospels:  { key: 'passionGospels',   name: 'Twelve Passion Gospels',         endpoint: '/api/passion-gospels' },
        royalHours:      { key: 'royalHours',       name: 'Royal Hours',                    endpoint: '/api/royal-hours' },
        lamentations:    { key: 'lamentations',     name: 'The Lamentations',               endpoint: '/api/lamentations' },
        vesperalLiturgy: { key: 'vesperalLiturgy',  name: 'Vesperal Liturgy of St. Basil',  endpoint: '/api/vesperal-liturgy' },
        paschalHours:    { key: 'paschalHours',      name: 'Paschal Hours',                  endpoint: '/api/paschal-hours' },
        paschaCollection:{ key: 'paschaCollection',  name: 'Holy Pascha Collection',         endpoint: '/api/pascha-collection' },
        kneelingVespers: { key: 'kneelingVespers',   name: 'Kneeling Vespers of Pentecost',  endpoint: '/api/kneeling-vespers' },
        // A vigil is ONE service (Vespers + Matins). Omitting it meant an
        // all-night-vigil date silently offered neither half here.
        allNightVigil:   { key: 'allNightVigil',     name: 'All-Night Vigil',                endpoint: '/api/vigil' },
        burialVespers:   { key: 'burialVespers',     name: 'Vespers of Great Friday',        endpoint: '/api/service' },
      };

      // Which services are served — from service-catalog.js, the single source
      // shared with /api/days and /api/search. This route used to rebuild the
      // whole map inline, which is exactly the drift the catalog exists to
      // prevent: the inline copy had no allNightVigil, so a vigil date offered
      // neither Vespers nor Matins here.
      // Vespers date-shift: vespers served this evening belongs to tomorrow.
      const vespersEntry = getCalendarEntry(getNextDateStr(date), style);
      const available = servicesForDay({
        cur: d, dateStr: date, dow: dowStr, season, entry, vespersEntry, style, sources, ctx,
      });

      const toFetch = Object.entries(available)
        .filter(([, avail]) => avail)
        .map(([key]) => svcMap[key])
        .filter(Boolean);

      // Fetch each service via internal HTTP requests. Thread the translation
      // overlay + style through so all inner Liturgy/Vespers/etc. requests see them.
      const translationSuffix = translation ? `&translation=${encodeURIComponent(translation)}` : '';
      const styleSuffix       = style && style !== 'new' ? `&style=${style}` : '';
      const fetchInternal = (endpoint, dateStr, pron) => new Promise((resolve, reject) => {
        // PORT was a module global in the pre-split server.js and never made it
        // into this route, so every request here threw "PORT is not defined".
        // The listening socket knows the real port, and unlike req.headers.host
        // it stays correct behind a proxy.
        const port = req.socket?.localPort || process.env.PORT || 3000;
        const url = `http://127.0.0.1:${port}${endpoint}?date=${dateStr}&pronoun=${pron}${translationSuffix}${styleSuffix}`;
        http.get(url, (resp) => {
          let body = '';
          resp.on('data', chunk => body += chunk);
          resp.on('end', () => {
            try {
              if (resp.statusCode === 200) resolve(JSON.parse(body));
              else resolve(null);
            } catch (e) { resolve(null); }
          });
        }).on('error', () => resolve(null));
      });

      (async () => {
        try {
          const results = await Promise.all(
            toFetch.map(svc => fetchInternal(svc.endpoint, date, pronoun))
          );

          const services = [];
          for (let i = 0; i < toFetch.length; i++) {
            const data = results[i];
            if (!data || !data.blocks) continue;
            // The choir's own sheets for this service, from the asset index.
            // Metadata only — `available` says whether the PDF is on this
            // machine; in production it is false, since the packet scans are
            // gitignored. Redistribution is gated on asking the director.
            const svcKey      = toFetch[i].key;
            const contentDate = choirAssets.contentDateFor(date, svcKey);
            const music = choirAssets.musicForService(date, svcKey, {
              contentDate, tone: data.tone ?? tone,
            });
            // Per-hymn sheets that confidently match a rendered block are
            // attached to it; the rest stay listed here rather than vanishing.
            const { attached, unattached } = choirAssets.attachToBlocks(data.blocks, music.blocks);

            services.push({
              type: svcKey,
              name: data.serviceName || toFetch[i].name,
              blocks: data.blocks,
              contentDate,
              music: { ...music, blocks: unattached, attachedToBlocks: attached },
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            date,
            tone,
            season,
            liturgicalLabel,
            commemorations,
            services,
          }));
        } catch (err) {
          console.error('/api/choir-prep error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      })();

}

module.exports = handle;
