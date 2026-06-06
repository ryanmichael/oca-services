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
      const entry  = getCalendarEntry(date);
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
      };

      // Build available services list
      // Vespers date-shift: vespers served this evening belongs to tomorrow
      const vespersEntry = getCalendarEntry(getNextDateStr(date));
      const available = {
        greatVespers:    vespersEntry?.vespers?.serviceType === 'greatVespers' && !vespersEntry?.vespers?.serviceKey,
        dailyVespers:    vespersEntry?.vespers?.serviceType === 'dailyVespers',
        bridegroomMatins: isBridegroomMatins(d),
        lamentations:    isLamentationsDay(d),
        vesperalLiturgy: isVesperalLiturgyDay(d),
        royalHours:      isRoyalHoursDay(d),
        passionGospels:  isPassionGospelsDay(d),
        matins:          !!buildMatinsSpec(date, d, dowStr, season, getTone(d), sources),
        liturgy:         !!(entry?.liturgy) || isLiturgyServed(d),
        presanctified:   isPresanctifiedDay(d),
        paschalHours:    getLiturgicalSeason(d) === 'brightWeek',
        paschaCollection: (() => {
          const p = calculatePascha(d.getUTCFullYear());
          return d.getUTCMonth() === p.getUTCMonth() && d.getUTCDate() === p.getUTCDate();
        })(),
        kneelingVespers: (() => {
          const p = calculatePascha(d.getUTCFullYear());
          const DAY = 86400000;
          const midnight = new Date(date + 'T00:00:00Z');
          return Math.round((midnight - p) / DAY) === 49;
        })(),
      };

      const toFetch = Object.entries(available)
        .filter(([, avail]) => avail)
        .map(([key]) => svcMap[key])
        .filter(Boolean);

      // Fetch each service via internal HTTP requests. Thread the translation
      // overlay through so all inner Liturgy/Vespers/etc. requests see it.
      const translation = resolveTranslation(q);
      const translationSuffix = translation ? `&translation=${encodeURIComponent(translation)}` : '';
      const fetchInternal = (endpoint, dateStr, pron) => new Promise((resolve, reject) => {
        const url = `http://localhost:${PORT}${endpoint}?date=${dateStr}&pronoun=${pron}${translationSuffix}`;
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
            services.push({
              type: toFetch[i].key,
              name: data.serviceName || toFetch[i].name,
              blocks: data.blocks,
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
