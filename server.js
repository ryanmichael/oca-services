/**
 * OCA Service Browser
 *
 * A minimal HTTP server for browsing assembled Vespers services.
 * Uses calendar-rules.js + assembler.js + renderer.js to render
 * a full service (fixed + variable texts) for any date.
 *
 * For regular Saturdays in ordinary time, services are generated
 * automatically. For Lenten/special dates, hand-authored calendar
 * entries are used if available.
 *
 * Usage:
 *   node server.js          — starts on http://localhost:3000
 *   node server.js --port 8080
 */

'use strict';

const http = require('node:http');
const fs   = require('fs');
const path = require('path');

const { assembleVespers, assembleLiturgy, assemblePresanctified, assemblePaschalHours, assembleMidnightOffice, assemblePaschalMatins, assembleBridegroomMatins, assemblePassionGospels, assembleLamentations, assembleVesperalLiturgy, assembleRoyalHours, assembleMatins, resolveSource } = require('./assembler');
const { generateCalendarEntry, getLiturgicalSeason, getDayOfWeek, getLiturgicalKey,
        getLiturgyVariant, getTone, getTrisagionSubstitution, isLiturgyServed,
        isPresanctifiedDay, isBridegroomMatins, isPassionGospelsDay, isLamentationsDay, isVesperalLiturgyDay, isRoyalHoursDay, isBurialVespersDay,
        getWeekOfLent, calculatePascha, getGreatFeastKey, isSoulSaturday,
        getEothinon } = require('./calendar-rules');
const { renderService, renderVespers }             = require('./renderer');
const { getMatinsKathismata }                    = require('./kathisma');
const { deduplicateBySource }                    = require('./oca-psalter');

const { loadJSON }       = require('./server-lib/_shared/load-json');
const { escHtml, formatDate } = require('./server-lib/_shared/html');
const { parseQuery }     = require('./server-lib/_shared/parse-query');
const { serveStatic }    = require('./server-lib/_shared/serve-static');

// Translation overlay subsystem. Each overlay lives at
// fixed-texts/translations/<id>/ as a manifest.json plus sparse <service>-fixed.json
// files. Selection priority: ?translation= query > LITURGY_TRANSLATION env > none.
// See server-lib/overlays/ for the cascade, drift, diff, rubrics, and registry layers.
const {
  fixedTextRegistry, registerBaseFixed,
  getOverlayFixed, getLiturgyFixed,
  getOverlayRubrics,
  getTranslationManifests,
  validateAllTranslations,
  tagBlocksWithOverlay, diffOverlay,
  resolveTranslation,
} = require('./server-lib/overlays');

// Variable-source resolvers (calendar entries, menaion, propers, matins-spec,
// liturgy-from-orthocal, db-source) and cache primitives (oca.db, orthocal cache).
const {
  loadSources,
  getCalendarEntry, getNextDateStr,
  getMenaionRanked, getSticheraDay, getMenaionDay, getMenaionDayList,
  GENERAL_MENAION_FALLBACK, getGeneralMenaionTexts,
  GREAT_FEAST_VARIANTS, PENTECOSTARION_SUNDAY_OVERRIDES, LITURGICAL_DAY_LABELS,
  DAY_PATRONS,
  buildMatinsSpec, buildLiturgyFromOrthocal,
  buildDbSource, getDbBlocks, mapDbBlocks,
} = require('./server-lib/sources');
const { openDb, ensureOrthocalCacheTable, fetchOrthocalDay } = require('./server-lib/cache');

// Assembly dispatchers + per-block transformations (pronoun substitution,
// day-label resolution, per-date Vespers entry point).
const { assembleForDate, applyYouYour, getDayLabel } = require('./server-lib/assemble');

// HTML render layer + dashboard data builder.
const {
  HOME_CSS, renderHomePage, getCollectedDates,
  formatAssemblyWarning, renderErrorPage,
  renderServiceHTML,
  buildDashboardData, formatSticheraSource,
} = require('./server-lib/render');

// ─── Config ───────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT    = portIdx !== -1 ? parseInt(args[portIdx + 1], 10)
              : process.env.PORT ? parseInt(process.env.PORT, 10)
              : 3000;





// ─── Request handler ──────────────────────────────────────────────────────────

// Pre-load sources once at startup
// (DAY_PATRONS now lives in daily-propers.json, loaded at module top.)

let sources;
try {
  sources = loadSources();
  console.log('Sources loaded: octoechos, prokeimena, menaion, triodion');
} catch (err) {
  console.error('Failed to load sources:', err.message);
  process.exit(1);
}

let fixedTexts;
try {
  fixedTexts = loadJSON('fixed-texts/vespers-fixed.json');
  registerBaseFixed('vespers', fixedTexts);
  console.log('Fixed texts loaded.');
} catch (err) {
  console.error('Failed to load fixed texts:', err.message);
  process.exit(1);
}

let liturgyFixed;
try {
  liturgyFixed = loadJSON('fixed-texts/liturgy-fixed.json');
  registerBaseFixed('liturgy', liturgyFixed);
  console.log('Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load liturgy fixed texts:', err.message);
  process.exit(1);
}

let presanctifiedFixed;
try {
  presanctifiedFixed = loadJSON('fixed-texts/presanctified-fixed.json');
  registerBaseFixed('presanctified', presanctifiedFixed);
  console.log('Presanctified fixed texts loaded.');
} catch (err) {
  console.error('Failed to load presanctified fixed texts:', err.message);
  process.exit(1);
}

// Defer translation validation until AFTER all base fixed-text files have
// registered, so drift warnings have a base to check against.
validateAllTranslations();

let paschalHoursFixed;
try {
  paschalHoursFixed = loadJSON('fixed-texts/paschal-hours-fixed.json');
  console.log('Paschal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Hours fixed texts:', err.message);
  process.exit(1);
}

let midnightOfficeFixed;
try {
  midnightOfficeFixed = loadJSON('fixed-texts/midnight-office-fixed.json');
  console.log('Midnight Office fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Midnight Office fixed texts:', err.message);
  process.exit(1);
}

let paschalMatinsFixed;
try {
  paschalMatinsFixed = loadJSON('fixed-texts/paschal-matins-fixed.json');
  console.log('Paschal Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Matins fixed texts:', err.message);
  process.exit(1);
}

let passionGospelsFixed;
try {
  passionGospelsFixed = loadJSON('fixed-texts/passion-gospels-fixed.json');
  console.log('Passion Gospels fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Passion Gospels fixed texts:', err.message);
  process.exit(1);
}

let bridegroomMatinsFixed;
try {
  bridegroomMatinsFixed = loadJSON('fixed-texts/bridegroom-matins-fixed.json');
  console.log('Bridegroom Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Bridegroom Matins fixed texts:', err.message);
  process.exit(1);
}

let lamentationsFixed;
try {
  lamentationsFixed = loadJSON('fixed-texts/lamentations-fixed.json');
  console.log('Lamentations fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Lamentations fixed texts:', err.message);
  process.exit(1);
}

let vesperalLiturgyFixed;
try {
  vesperalLiturgyFixed = loadJSON('fixed-texts/vesperal-liturgy-fixed.json');
  console.log('Vesperal Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Vesperal Liturgy fixed texts:', err.message);
  process.exit(1);
}

let kneelingVespersFixed;
try {
  kneelingVespersFixed = loadJSON('fixed-texts/kneeling-vespers-fixed.json');
  registerBaseFixed('kneeling-vespers', kneelingVespersFixed);
  console.log('Kneeling Vespers fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Kneeling Vespers fixed texts:', err.message);
  process.exit(1);
}

let royalHoursFixed;
try {
  royalHoursFixed = loadJSON('fixed-texts/royal-hours-fixed.json');
  console.log('Royal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Royal Hours fixed texts:', err.message);
  process.exit(1);
}

let matinsFixed;
try {
  matinsFixed = loadJSON('fixed-texts/matins-fixed.json');
  console.log('Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Matins fixed texts:', err.message);
  process.exit(1);
}

ensureOrthocalCacheTable();

function handleRequest(req, res) {
  const url      = req.url || '/';
  const pathname = url.split('?')[0];

  try {
    if (pathname === '/') {
      serveStatic(res, path.join(__dirname, 'public', 'index.html'), 'text/html');

    } else if (pathname === '/favicon.svg') {
      serveStatic(res, path.join(__dirname, 'public', 'favicon.svg'), 'image/svg+xml');

    } else if (pathname.startsWith('/styles/') || pathname.startsWith('/scripts/')) {
      const filePath = path.join(__dirname, 'public', pathname);
      const ext = path.extname(filePath);
      const ct = ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/plain';
      serveStatic(res, filePath, ct);

    } else if (pathname === '/api/service') {
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

      (async () => {
      // ── Vespers date-shift ─────────────────────────────────────────────────
      // Vespers is the first service of the next liturgical day.  The API date
      // represents the civil evening the service is served; the liturgical
      // content comes from the *next* calendar date.
      //
      // Exception: Burial Vespers (Holy Friday afternoon) uses the day's own
      // texts — it is NOT the evening vespers that begins the next day.
      const dayEntry = getCalendarEntry(date);
      const isBurialVespers = dayEntry?.vespers?.serviceKey === 'burialVespers';
      const vespersDate = isBurialVespers ? date : getNextDateStr(date);

      // For Lenten weekday Vespers, enrich prokeimenon entries with pericopes from orthocal API.
      // For vigil-rank Sundays with OT prophecies (e.g. Holy Fathers), enrich
      // otReadings with full scripture text from orthocal.
      let entryOverride = null;
      try {
        const baseEntry = getCalendarEntry(vespersDate);
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

      const translation = resolveTranslation(q);
      const vespersFixedResolved = translation
        ? (getOverlayFixed('vespers', translation) || fixedTexts)
        : fixedTexts;

      let result;
      try {
        result = assembleForDate(vespersDate, pronoun, entryOverride, vespersFixedResolved, sources);
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
        const [, mm, dd] = vespersDate.split('-').map(Number);
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
        blocks,
      }));
      })().catch(err => {
        console.error('/api/service async error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/education-modules') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'variable-sources', 'education-modules.json'), 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load education modules.' }));
      }

    } else if (pathname === '/api/education-modules-vespers') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'variable-sources', 'education-modules-vespers.json'), 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load vespers education modules.' }));
      }

    } else if (pathname === '/api/translations') {
      // Lists every available translation overlay with its manifest summary.
      // Front-end uses this to build the settings-panel picker.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        default: process.env.LITURGY_TRANSLATION || null,
        translations: getTranslationManifests(),
      }));

    } else if (pathname.startsWith('/api/translations/') && pathname.endsWith('/diff')) {
      // Returns the merged-vs-base diff for an overlay. Useful for confirming
      // overrides took effect and (during STS population) for cataloguing
      // which keys an overlay touches.
      // Path: /api/translations/<id>/diff?service=liturgy
      const id = pathname.slice('/api/translations/'.length, -'/diff'.length);
      const q = parseQuery(url);
      const service = (q.service || 'liturgy').trim();
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!fixedTextRegistry[service]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown service '${service}'. Available: ${Object.keys(fixedTextRegistry).join(', ')}` }));
        return;
      }
      const diffs = diffOverlay(service, id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        overlay: id,
        service,
        count: diffs.length,
        diffs,
      }));

    } else if (pathname === '/api/liturgy') {
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

      {
        const d = new Date(date + 'T12:00:00Z');
        if (!isLiturgyServed(d)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No Divine Liturgy is served on this date.', date }));
          return;
        }
      }

      (async () => {
        let calendarEntry = getCalendarEntry(date);
        if (!calendarEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No liturgy available for this date.', date }));
          return;
        }

        if (!calendarEntry.liturgy) {
          try {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources) };
          } catch (err) {
            console.error(`Orthocal API error for ${date}:`, err.message);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Liturgy data unavailable for this date.', date }));
            return;
          }
        }

        const translation = resolveTranslation(q);
        const liturgyFixedResolved = getLiturgyFixed(translation);

        let blocks;
        try {
          blocks = assembleLiturgy(calendarEntry, liturgyFixedResolved, sources,
            { rubrics: getOverlayRubrics(translation) });
        } catch (err) {
          console.error('assembleLiturgy error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        // Tag blocks whose text came from the active overlay (must happen
        // BEFORE pronoun substitution, which would change the strings and
        // defeat the match).
        tagBlocksWithOverlay(blocks, 'liturgy', translation);

        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }

        const season = calendarEntry.liturgicalContext?.season || null;
        const tone   = calendarEntry.liturgicalContext?.tone ?? null;
        const dow    = calendarEntry.dayOfWeek || null;
        const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);
        let commemorations  = calendarEntry.commemorations || [];
        if (commemorations.length === 0) {
          const [, mm, dd] = date.split('-').map(Number);
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

        const variantName = calendarEntry.liturgy.variant === 'basil'
          ? 'Liturgy of St. Basil the Great'
          : 'Liturgy of St. John Chrysostom';
        const serviceName = `Divine Liturgy — ${variantName}`;

        if (format === 'html') {
          const toneLabel = tone ? ` · Tone ${tone}` : '';
          renderServiceHTML(res, blocks, serviceName, `${formatDate(date)}${toneLabel}`, pronoun);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType:    'liturgy',
          serviceName,
          tone,
          season,
          liturgicalLabel,
          commemorations,
          translation: translation || null,
          blocks,
        }));
      })().catch(err => {
        console.error('Liturgy route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/presanctified') {
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

      {
        const d = new Date(date + 'T12:00:00Z');
        if (!isPresanctifiedDay(d)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'The Liturgy of the Presanctified Gifts is not served on this date.',
            date,
          }));
          return;
        }
      }

      (async () => {
        let calendarEntry = getCalendarEntry(date);
        if (!calendarEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No calendar entry for this date.', date }));
          return;
        }

        // Enrich prokeimenon entries with pericopes from orthocal API
        try {
          const orthocalData = await fetchOrthocalDay(date);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          if (vesperReadings.length > 0 && calendarEntry.vespers?.prokeimenon?.entries) {
            const entries = calendarEntry.vespers.prokeimenon.entries.map(e => {
              const match = vesperReadings.find(r =>
                r.display && e.reading?.book &&
                r.display.toLowerCase().startsWith(e.reading.book.toLowerCase())
              );
              if (match && match.display) {
                const raw = match.display.replace(/^[A-Za-z ]+/, '').trim();
                const pericope = raw.replace(/(\d+)\.(\d+)-(\d+)\.(\d+)/, '$1:$2–$3:$4')
                                    .replace(/(\d+)\.(\d+)/, '$1:$2');
                return { ...e, reading: { ...e.reading, pericope } };
              }
              return e;
            });
            calendarEntry = {
              ...calendarEntry,
              vespers: {
                ...calendarEntry.vespers,
                prokeimenon: { ...calendarEntry.vespers.prokeimenon, entries },
              },
            };
          }
        } catch (err) {
          console.warn('Presanctified: orthocal pericope fetch failed (non-fatal):', err.message);
        }

        // Inject DB-sourced variable texts
        const dbSource = buildDbSource(date, pronoun);
        const assemblerSources = { ...sources, db: dbSource };

        const translation = resolveTranslation(q);
        const liturgyFixedResolved = getOverlayFixed('liturgy', translation);
        const presanctifiedFixedResolved = getOverlayFixed('presanctified', translation);

        let blocks;
        try {
          blocks = assemblePresanctified(calendarEntry, fixedTexts, liturgyFixedResolved, presanctifiedFixedResolved, assemblerSources);
        } catch (err) {
          console.error('assemblePresanctified error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        // Tag blocks from overlay overrides (both liturgy and presanctified
        // bases, since Presanctified borrows from both). Must run before
        // pronoun substitution.
        tagBlocksWithOverlay(blocks, 'liturgy', translation);
        tagBlocksWithOverlay(blocks, 'presanctified', translation);

        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }

        const season = calendarEntry.liturgicalContext?.season || null;
        const tone   = calendarEntry.liturgicalContext?.tone ?? null;
        const dow    = calendarEntry.dayOfWeek || null;
        const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);
        const commemorations  = calendarEntry.commemorations || [];

        // Relabel 'db' source
        for (const b of blocks) {
          if (b.source === 'db') b.source = 'triodion';
          if (!b.provenance) b.provenance = 'OCA';
        }

        if (format === 'html') {
          const toneLabel = tone ? ` · Tone ${tone}` : '';
          renderServiceHTML(res, blocks, 'Liturgy of the Presanctified Gifts', `${formatDate(date)}${toneLabel}`, pronoun);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType:    'presanctified',
          serviceName:    'Liturgy of the Presanctified Gifts',
          tone,
          season,
          liturgicalLabel,
          commemorations,
          translation: translation || null,
          blocks,
        }));
      })().catch(err => {
        console.error('Presanctified route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/bridegroom-matins') {
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
      if (!isBridegroomMatins(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bridegroom Matins is only served on the evenings of Palm Sunday through Holy Wednesday.',
          date,
        }));
        return;
      }

      // API date = civil evening; content from NEXT liturgical day
      const nextDay = new Date(d);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const night = getDayOfWeek(nextDay);  // monday, tuesday, wednesday, or thursday
      const NIGHT_NAMES = LITURGICAL_DAY_LABELS.bridegroomMatinsNights;

      let blocks;
      try {
        blocks = assembleBridegroomMatins(bridegroomMatinsFixed, night);
      } catch (err) {
        console.error('assembleBridegroomMatins error:', err);
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
        renderServiceHTML(res, blocks, 'Bridegroom Matins', `${formatDate(date)} · ${NIGHT_NAMES[night] || 'Holy Week'}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'bridegroom-matins',
        serviceName:    'Bridegroom Matins',
        season:         'holyWeek',
        liturgicalLabel: NIGHT_NAMES[night] || 'Holy Week',
        blocks,
      }));

    } else if (pathname === '/api/matins') {
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
      const matinsSpec = buildMatinsSpec(date, d, dow, season, tone, sources);

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

      let blocks;
      try {
        blocks = assembleMatins(calendarDay, matinsFixed, fixedTexts, sources);
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
        blocks,
      }));
      })();

    } else if (pathname === '/api/passion-gospels') {
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
      if (!isPassionGospelsDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Service of the Twelve Passion Gospels is only served on Great Thursday evening.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assemblePassionGospels(passionGospelsFixed);
      } catch (err) {
        console.error('assemblePassionGospels error:', err);
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
        renderServiceHTML(res, blocks, 'The Twelve Passion Gospels', `${formatDate(date)} · Great and Holy Thursday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'passion-gospels',
        serviceName:    'The Twelve Passion Gospels',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Thursday',
        blocks,
      }));

    } else if (pathname === '/api/royal-hours') {
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
      if (!isRoyalHoursDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Royal Hours are only served on the morning of Great Friday.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assembleRoyalHours(royalHoursFixed);
      } catch (err) {
        console.error('assembleRoyalHours error:', err);
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
        renderServiceHTML(res, blocks, 'Royal Hours of Great Friday', `${formatDate(date)} · Great and Holy Friday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'royalHours',
        serviceName:    'Royal Hours of Great Friday',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Friday',
        blocks,
      }));

    } else if (pathname === '/api/lamentations') {
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
      if (!isLamentationsDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Lamentations service is only served on the evening of Great Friday.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assembleLamentations(lamentationsFixed, fixedTexts);
      } catch (err) {
        console.error('assembleLamentations error:', err);
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
        renderServiceHTML(res, blocks, 'The Lamentations', `${formatDate(date)} · Great and Holy Friday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'lamentations',
        serviceName:    'The Lamentations',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Friday',
        blocks,
      }));

    } else if (pathname === '/api/vesperal-liturgy') {
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
      if (!isVesperalLiturgyDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Vesperal Liturgy of St. Basil is only served on Great Saturday morning.',
          date,
        }));
        return;
      }

      const translation = resolveTranslation(q);
      const liturgyFixedResolved = getLiturgyFixed(translation);

      let blocks;
      try {
        blocks = assembleVesperalLiturgy(vesperalLiturgyFixed, fixedTexts, liturgyFixedResolved);
      } catch (err) {
        console.error('assembleVesperalLiturgy error:', err);
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
        renderServiceHTML(res, blocks, 'Vesperal Liturgy of St. Basil', `${formatDate(date)} · Great and Holy Saturday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'vesperal-liturgy',
        serviceName:    'Vesperal Liturgy of St. Basil',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Saturday',
        blocks,
      }));

    } else if (pathname === '/api/kneeling-vespers') {
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

      // Kneeling Vespers is served on the evening of Pentecost Sunday only
      // (Pascha + 49). It uses the same Pentecost vespers propers as the
      // Saturday-evening Vigil, with three sets of St. Basil's Kneeling
      // Prayers inserted at the prescribed points.
      const d = new Date(date + 'T00:00:00Z');
      const pascha = calculatePascha(d.getUTCFullYear());
      const DAY_MS = 24 * 60 * 60 * 1000;
      const daysSincePascha = Math.round((d - pascha) / DAY_MS);
      if (daysSincePascha !== 49) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Kneeling Vespers is only served on Pentecost Sunday.',
          date,
        }));
        return;
      }

      // Assemble the Pentecost Sunday vespers content (same call as the
      // Saturday-evening Vigil, with the Pentecost-day liturgical entry).
      // OCA-strict Kneeling Vespers has no OT readings, so we do not enrich
      // them; the OT Readings section is stripped below along with the other
      // Vigil-only artifacts (Kathisma, Litya, Bread Blessing).
      (async () => {
      const entryOverride = null;

      let result;
      try {
        result = assembleForDate(date, pronoun, entryOverride, fixedTexts, sources);
      } catch (err) {
        console.error('assembleForDate (kneeling-vespers) error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      if (!result) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to assemble Pentecost vespers content.' }));
        return;
      }

      const { blocks: baseBlocks, calendarEntry, tone } = result;

      // Relabel 'db' source for dev-mode display (mirrors /api/service)
      for (const b of baseBlocks) {
        if (b.source === 'db') b.source = 'pentecostarion';
        if (!b.provenance) b.provenance = 'OCA';
      }

      // ── Replace Lord-I-Call stichera with Kneeling-Vespers propers ─────
      // Saturday-eve Vigil LIC (Tone 1+2 idiomela + Tone 8 "Come, O people")
      // falls through; OCA Day-of-Holy-Spirit Vespers prescribes Tone 4
      // idiomela ("Today in the city of David…" etc., on 6 with each
      // repeated) + Tone 6 "O heavenly King" doxastichon.
      {
        const kvLic = PENTECOSTARION_SUNDAY_OVERRIDES[49]?.kneelingVespers?.lordICall;
        if (kvLic?.stichera?.length === 3) {
          const psalm129 = fixedTexts?.lordICall?.psalmVerses?.psalm129?.verses || [];
          const psalm116 = fixedTexts?.lordICall?.psalmVerses?.psalm116?.verses || [];
          const findVerse = (n) => {
            const v = [...psalm129, ...psalm116].find(x => x.number === n);
            return v ? v.text : '';
          };
          const verseTexts = [6, 5, 4, 3, 2, 1].map(findVerse);
          const pairs = [
            [verseTexts[0], kvLic.stichera[0], false],
            [verseTexts[1], kvLic.stichera[0], true],
            [verseTexts[2], kvLic.stichera[1], false],
            [verseTexts[3], kvLic.stichera[1], true],
            [verseTexts[4], kvLic.stichera[2], false],
            [verseTexts[5], kvLic.stichera[2], true],
          ];
          const licBlocks = [];
          pairs.forEach(([verseText, sticheron, isRepeat], i) => {
            const verseNum = 6 - i;
            licBlocks.push({
              id: `kv-lic-v${verseNum}`, section: 'Lord, I Have Cried',
              type: 'verse', speaker: 'reader',
              text: `V. (${verseNum}) ${verseText}`,
            });
            licBlocks.push({
              id: `kv-lic-s${i + 1}${isRepeat ? '-r' : ''}`, section: 'Lord, I Have Cried',
              type: 'hymn', speaker: 'choir', text: sticheron.text, tone: sticheron.tone,
              source: 'pentecostarion', label: sticheron.label || 'Idiomelon',
              provenance: 'OCA',
            });
          });
          licBlocks.push({
            id: 'kv-lic-glory', section: 'Lord, I Have Cried', type: 'doxology',
            speaker: null, text: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.',
          });
          licBlocks.push({
            id: 'kv-lic-dox', section: 'Lord, I Have Cried', type: 'hymn',
            speaker: 'choir', text: kvLic.doxastichon.text, tone: kvLic.doxastichon.tone,
            source: 'pentecostarion', label: kvLic.doxastichon.label, provenance: 'OCA',
          });
          // Replace from the first verse/hymn block of LIC through the last LIC block.
          let licStart = -1, licEnd = -1;
          baseBlocks.forEach((b, i) => {
            if (b.section === 'Lord, I Have Cried' && (b.type === 'verse' || b.type === 'hymn' || b.type === 'doxology')) {
              if (licStart === -1) licStart = i;
              licEnd = i;
            }
          });
          if (licStart >= 0) {
            baseBlocks.splice(licStart, licEnd - licStart + 1, ...licBlocks);
          }
        }
      }

      // ── Replace Evening Prokeimenon with Great Prokeimenon Tone 7 ──────
      // OCA prescribes "Who is so great a God as our God?" (Ps. 76) for the
      // Day of Holy Spirit eve, not the Sunday "The Lord is king" (Ps. 92).
      {
        const kvProk = PENTECOSTARION_SUNDAY_OVERRIDES[49]?.kneelingVespers?.prokeimenon;
        if (kvProk?.refrain) {
          const section = 'Evening Prokeimenon';
          const pBlocks = [
            { id: 'kv-prok-intro', section, type: 'prayer', speaker: 'priest',
              text: 'Let us attend. Peace be unto all.' },
            { id: 'kv-prok-resp', section, type: 'response', speaker: 'choir',
              text: 'And to thy spirit.' },
            { id: 'kv-prok-announce', section, type: 'rubric', speaker: 'deacon',
              text: `The great prokeimenon in Tone ${kvProk.tone}.` },
            { id: 'kv-prok-refrain', section, type: 'hymn', speaker: 'choir',
              text: kvProk.refrain, tone: kvProk.tone },
          ];
          kvProk.verses.forEach((v, i) => {
            pBlocks.push({ id: `kv-prok-v${i}`, section, type: 'verse', speaker: 'deacon', text: v });
            pBlocks.push({ id: `kv-prok-refrain-r${i}`, section, type: 'hymn', speaker: 'choir',
              text: kvProk.refrain, tone: kvProk.tone });
          });
          pBlocks.push({ id: 'kv-prok-final', section, type: 'hymn', speaker: 'choir',
            text: kvProk.refrain, tone: kvProk.tone });
          let pkStart = -1, pkEnd = -1;
          baseBlocks.forEach((b, i) => {
            if (b.section === 'Evening Prokeimenon') {
              if (pkStart === -1) pkStart = i;
              pkEnd = i;
            }
          });
          if (pkStart >= 0) {
            baseBlocks.splice(pkStart, pkEnd - pkStart + 1, ...pBlocks);
          }
        }
      }

      // ── Replace Aposticha with Kneeling-Vespers-specific propers ───────
      // The Saturday-eve Vigil aposticha (Tone 6 "The nations did not
      // know…" + Tone 8 "The arrogance of the tower…") falls through from
      // the same-day calendar entry; but for Sunday-evening Kneeling
      // Vespers the Pentecostarion prescribes a distinct set — three Tone-3
      // stichera with Ps. 50:10–11 verses + Tone-8 "Come, O people" (Leo
      // the Master) doxastichon. See pentecostarion-sunday-overrides.json[49].kneelingVespers.aposticha.
      {
        const kvAposticha = PENTECOSTARION_SUNDAY_OVERRIDES[49]?.kneelingVespers?.aposticha;
        if (kvAposticha?.stichera?.length) {
          const apostBlocks = [];
          kvAposticha.stichera.forEach((s, i) => {
            if (i > 0 && kvAposticha.verses?.[i - 1]) {
              apostBlocks.push({
                id: `kv-apost-v${i}`, section: 'Aposticha', type: 'verse', speaker: 'reader',
                text: `V. ${kvAposticha.verses[i - 1]}`,
              });
            }
            apostBlocks.push({
              id: `kv-apost-s${i + 1}`, section: 'Aposticha', type: 'hymn', speaker: 'choir',
              text: s.text, tone: s.tone, source: 'pentecostarion',
              label: s.label || 'Sticheron', provenance: 'OCA',
            });
          });
          apostBlocks.push({
            id: 'kv-apost-glory', section: 'Aposticha', type: 'doxology', speaker: null,
            text: 'Glory to the Father, and to the Son, and to the Holy Spirit.',
          });
          apostBlocks.push({
            id: 'kv-apost-now', section: 'Aposticha', type: 'doxology', speaker: null,
            text: 'Now and ever and unto ages of ages. Amen.',
          });
          apostBlocks.push({
            id: 'kv-apost-dox', section: 'Aposticha', type: 'hymn', speaker: 'choir',
            text: kvAposticha.doxastichon.text, tone: kvAposticha.doxastichon.tone,
            source: 'pentecostarion', label: kvAposticha.doxastichon.label, provenance: 'OCA',
          });
          const apostStart = baseBlocks.findIndex(b => b.section === 'Aposticha');
          let apostEnd = -1;
          baseBlocks.forEach((b, i) => { if (b.section === 'Aposticha') apostEnd = i; });
          if (apostStart >= 0) {
            baseBlocks.splice(apostStart, apostEnd - apostStart + 1, ...apostBlocks);
          }
        }
      }

      // ── Strip Vigil-only artifacts (OCA-strict Kneeling Vespers shape) ──
      // assembleForDate() returns the Saturday-eve Vigil structure for the
      // Pentecost-day calendar entry. OCA's 2026-0601 docx prescribes a
      // daily-vespers shape with kneeling-prayer insertions — no Kathisma,
      // Litya, Bread Blessing, or OT readings. Vouchsafe also belongs in a
      // different position (between 2nd and 3rd Kneeling Prayer rather than
      // after the Litany of Fervent Supplication) — extract it here and
      // re-splice below. See project_kneeling_vespers_order_audit.md.
      const STRIP_SECTIONS = new Set([
        'Old Testament Readings',
        'The Litya',
        'Blessing of Bread',
      ]);
      // Remove Kathisma + its trailing Little Litany as a contiguous block
      // (other Little Litany instances elsewhere in the service must be kept).
      {
        const kStart = baseBlocks.findIndex(b => b.section === 'Kathisma');
        if (kStart >= 0) {
          let kEnd = kStart;
          while (kEnd + 1 < baseBlocks.length &&
                 (baseBlocks[kEnd + 1].section === 'Kathisma' ||
                  baseBlocks[kEnd + 1].section === 'Little Litany')) {
            kEnd++;
          }
          baseBlocks.splice(kStart, kEnd - kStart + 1);
        }
      }
      // Extract Vouchsafe blocks (re-spliced below between 2nd and 3rd Kneeling).
      const vouchsafeBlocks = [];
      for (let i = baseBlocks.length - 1; i >= 0; i--) {
        if (baseBlocks[i].section === 'Vouchsafe, O Lord') {
          vouchsafeBlocks.unshift(baseBlocks[i]);
          baseBlocks.splice(i, 1);
        }
      }
      // Remove the rest of the strip list.
      for (let i = baseBlocks.length - 1; i >= 0; i--) {
        if (STRIP_SECTIONS.has(baseBlocks[i].section)) {
          baseBlocks.splice(i, 1);
        }
      }
      // Collapse the Vigil thrice-troparion to a single hymn.
      // Vigil pattern emits the festal troparion 3× with a "sung thrice"
      // rubric; OCA Kneeling Vespers prints it once (daily-vespers shape).
      {
        const tropIdx = [];
        baseBlocks.forEach((b, i) => {
          if (b.section === 'Troparia') tropIdx.push(i);
        });
        if (tropIdx.length) {
          const trop = baseBlocks.slice(tropIdx[0], tropIdx[tropIdx.length - 1] + 1);
          const hymns = trop.filter(b => b.type === 'hymn');
          if (hymns.length > 1) {
            // Keep one hymn per distinct text; drop the thrice-rubric.
            const seenText = new Set();
            const kept = trop.filter(b => {
              if (b.type === 'rubric' && /thrice|three times/i.test(b.text || '')) return false;
              if (b.type === 'hymn') {
                if (seenText.has(b.text)) return false;
                seenText.add(b.text);
              }
              return true;
            });
            baseBlocks.splice(tropIdx[0], tropIdx[tropIdx.length - 1] - tropIdx[0] + 1, ...kept);
          }
        }
      }

      // ── Build the three Kneeling Prayer groups as ServiceBlocks ────────
      // Resolve translation overlay: prayer texts live in overlay files
      // (e.g. sts-sluzhebnik/kneeling-vespers-fixed.json) because the base
      // file ships only universal rubrics + placeholders.
      const translation = resolveTranslation(q);
      const kv = getOverlayFixed('kneeling-vespers', translation) || kneelingVespersFixed;
      const r  = kv.rubrics;
      function buildSet(setKey, sectionName, prayerKeys, includeIntroNotice) {
        const out = [];
        if (includeIntroNotice) {
          out.push({
            id: `kn-${setKey}-notice`, section: sectionName, type: 'rubric',
            speaker: null, text: r.kneelingNotice,
          });
        }
        out.push({
          id: `kn-${setKey}-heading`, section: sectionName, type: 'rubric',
          speaker: null, text: kv[setKey].heading,
        });
        out.push({
          id: `kn-${setKey}-bid`, section: sectionName, type: 'prayer',
          speaker: 'deacon', text: r.deaconBidsKneeling,
        });
        out.push({
          id: `kn-${setKey}-bid-resp`, section: sectionName, type: 'response',
          speaker: 'choir', text: 'Lord, have mercy.',
        });
        prayerKeys.forEach((pk, i) => {
          if (i > 0) {
            out.push({
              id: `kn-${setKey}-adds-${i}`, section: sectionName, type: 'rubric',
              speaker: null, text: r.andHeAdds,
            });
          }
          out.push({
            id: `kn-${setKey}-${pk}`, section: sectionName, type: 'prayer',
            speaker: 'priest', text: kv[setKey][pk],
          });
        });
        out.push({
          id: `kn-${setKey}-rise`, section: sectionName, type: 'prayer',
          speaker: 'deacon', text: r.deaconBidsRising,
        });
        out.push({
          id: `kn-${setKey}-rise-resp`, section: sectionName, type: 'response',
          speaker: 'choir', text: r.deaconBidsRisingResponse,
        });
        return out;
      }

      const set1Blocks = buildSet('set1', 'First Kneeling', ['firstPrayer','secondPrayer'], true);
      const set2Blocks = buildSet('set2', 'Second Kneeling', ['firstPrayer','secondPrayer'], false);
      const set3Blocks = buildSet('set3', 'Third Kneeling', ['firstPrayer','secondPrayer','thirdPrayer'], false);

      // Splice each set in *before* the named section's first block.
      // OCA-strict order (per 2026-0601-texts-tt.docx):
      //   Set1 → Fervent Supplication → Set2 → Vouchsafe → Set3 → Completion → Aposticha
      // We extracted Vouchsafe above; re-insert it between Sets 2 and 3,
      // both placed before the Completion litany.
      function insertBeforeSection(arr, sectionName, inserted) {
        const idx = arr.findIndex(b => b.section === sectionName);
        if (idx === -1) return arr.concat(inserted); // fallback: append
        return arr.slice(0, idx).concat(inserted, arr.slice(idx));
      }
      let blocks = baseBlocks;
      blocks = insertBeforeSection(blocks, 'Litany of Fervent Supplication', set1Blocks);
      blocks = insertBeforeSection(blocks, 'Litany of Completion',
        [...set2Blocks, ...vouchsafeBlocks, ...set3Blocks]);

      // Tag blocks whose text came from the overlay (for dev-mode attribution).
      tagBlocksWithOverlay(blocks, 'kneeling-vespers', translation);

      const season = calendarEntry.liturgicalContext?.season || 'pentecostarion';
      const dow    = calendarEntry.dayOfWeek || null;
      const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date)
                              || 'The Descent of the Holy Spirit (Pentecost)';
      const commemorations = calendarEntry.commemorations || [];

      if (format === 'html') {
        const toneLabel = tone ? ` · Tone ${tone}` : '';
        renderServiceHTML(res, blocks,
          'Kneeling Vespers of Pentecost',
          `${formatDate(date)}${toneLabel}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:     'kneelingVespers',
        serviceName:     'Kneeling Vespers of Pentecost',
        tone,
        season,
        liturgicalLabel,
        commemorations,
        blocks,
      }));
      })();

    } else if (pathname === '/api/paschal-hours') {
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
      const season = getLiturgicalSeason(d);
      if (season !== 'brightWeek') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Paschal Hours are only served during Bright Week (Pascha through Bright Saturday).',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assemblePaschalHours(paschalHoursFixed);
      } catch (err) {
        console.error('assemblePaschalHours error:', err);
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

      const dow = getDayOfWeek(d);
      const NAMES = {
        sunday: 'Holy Pascha', monday: 'Bright Monday', tuesday: 'Bright Tuesday',
        wednesday: 'Bright Wednesday', thursday: 'Bright Thursday',
        friday: 'Bright Friday', saturday: 'Bright Saturday',
      };

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Paschal Hours', `${formatDate(date)} · ${NAMES[dow] || 'Bright Week'}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'paschal-hours',
        serviceName:    'The Paschal Hours',
        season:         'brightWeek',
        liturgicalLabel: NAMES[dow] || 'Bright Week',
        blocks,
      }));

    } else if (pathname === '/api/pascha-collection') {
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

    } else if (pathname === '/api/choir-prep') {
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

    } else if (pathname === '/api/days') {
      const q    = parseQuery(url);
      const from = (q.from || '').trim();
      const to   = (q.to   || '').trim();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid from/to parameters.' }));
        return;
      }

      const [fy, fm, fd] = from.split('-').map(Number);
      const [ty, tm, td] = to.split('-').map(Number);
      const startDate = new Date(Date.UTC(fy, fm - 1, fd));
      const endDate   = new Date(Date.UTC(ty, tm - 1, td));

      if (endDate < startDate) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '"to" must be on or after "from".' }));
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const MONTH_NAMES_FULL = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
      const DOW_NAMES_UPPER  = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
      const DAY_MS_LOCAL     = 24 * 60 * 60 * 1000;

      const result = [];
      let cur = new Date(startDate);
      while (cur <= endDate) {
        const dateStr = cur.toISOString().slice(0, 10);
        const [, mm, dd] = dateStr.split('-').map(Number);
        const dowIdx  = cur.getUTCDay();
        const dowStr  = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];

        // Get calendar entry (cheap — no assembly)
        const entry  = getCalendarEntry(dateStr);
        const season = entry ? (entry.liturgicalContext?.season || null) : null;
        const tone   = entry ? (entry.liturgicalContext?.tone ?? entry.vespers?.lordICall?.tone ?? null) : null;
        const liturgicalLabel = entry ? getDayLabel(entry, dowStr, season, entry.date) : null;

        // Vespers date-shift: vespers served on this evening belongs to
        // the *next* liturgical day, so look up tomorrow's calendar entry.
        const vespersDateStr = getNextDateStr(dateStr);
        const vespersEntry   = getCalendarEntry(vespersDateStr);

        // Feast + commemorations list from Menaion DB
        let feast = null;
        let commemorations = [];
        try {
          const dayList = getMenaionDayList(mm, dd);
          if (dayList) {
            feast          = dayList.principal;
            commemorations = dayList.commemorations;
          }
        } catch (_) {}

        const services = {
          greatVespers: vespersEntry?.vespers?.serviceType === 'greatVespers' && !vespersEntry?.vespers?.serviceKey,
          dailyVespers: vespersEntry?.vespers?.serviceType === 'dailyVespers',
          allNightVigil: vespersEntry?.vespers?.serviceType === 'all-night-vigil',
          burialVespers: isBurialVespersDay(cur),
      bridegroomMatins: isBridegroomMatins(cur),
          lamentations: isLamentationsDay(cur),
          vesperalLiturgy: isVesperalLiturgyDay(cur),
          royalHours: isRoyalHoursDay(cur),
          passionGospels: isPassionGospelsDay(cur),
          matins:  !!buildMatinsSpec(dateStr, cur, dowStr, season, getTone(cur), sources),
          liturgy: !!(entry?.liturgy) || isLiturgyServed(cur),
          presanctified: isPresanctifiedDay(cur),
          paschalHours: getLiturgicalSeason(cur) === 'brightWeek',
          paschaCollection: (() => {
            const p = calculatePascha(cur.getUTCFullYear());
            return cur.getUTCMonth() === p.getUTCMonth() && cur.getUTCDate() === p.getUTCDate();
          })(),
          kneelingVespers: (() => {
            const p = calculatePascha(cur.getUTCFullYear());
            return Math.round((cur - p) / DAY_MS_LOCAL) === 49;
          })(),
        };

        result.push({
          date:           dateStr,
          dayOfWeek:      dowStr,
          displayDay:     DOW_NAMES_UPPER[dowIdx],
          displayDate:    `${MONTH_NAMES_FULL[mm - 1]} ${dd}`,
          isToday:        dateStr === today,
          season,
          tone,
          feast,
          commemorations,
          liturgicalLabel,
          services,
        });

        cur = new Date(cur.getTime() + DAY_MS_LOCAL);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } else if (pathname === '/api/search') {
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

    } else if (pathname === '/service') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (q.pronoun || 'tt').trim();

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage('Invalid or missing date parameter.'));
        return;
      }

      // Vespers date-shift: content belongs to the next liturgical day
      const vespersDate = getNextDateStr(date);

      // Try assembleForDate first
      let assembleResult;
      try {
        assembleResult = assembleForDate(vespersDate, pronoun, null, fixedTexts, sources);
      } catch (err) {
        console.error('Assembly error:', err);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(`Assembly error: ${err.message}`));
        return;
      }

      if (!assembleResult) {
        // Fall back to DB-collected texts (variable sections only)
        const dbBlocks = getDbBlocks(date, pronoun);
        if (dbBlocks.length > 0) {
          const blocks = mapDbBlocks(dbBlocks);
          const html = renderVespers(blocks, {
            title: 'Vespers (Collected Texts)',
            date:  formatDate(date),
          });
          const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
          const notice = `<div style="font-family:sans-serif;font-size:9.5pt;padding:8px 40px;background:#e8f4fb;border-bottom:1px solid #a0c8e0;color:#1a4a6a;">
  ℹ Showing collected variable texts only — fixed liturgy (litanies, psalms, prayers) not yet available for this season.
</div>`;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html.replace('<body>', '<body>' + backBar + notice));
          return;
        }

        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(Date.UTC(year, month - 1, day));
        const season  = getLiturgicalSeason(dateObj);
        const dow     = getDayOfWeek(dateObj);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(
          `No service available for ${formatDate(date)}.`,
          `This is a ${dow} in the ${season} season. ` +
          `Automatic generation is currently supported for Saturdays in ordinary time only. ` +
          `Add a hand-authored calendar file to support this date.`
        ));
        return;
      }

      const { blocks, calendarEntry, serviceTitle, tone } = assembleResult;
      const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
      const isGenerated  = calendarEntry._meta?.generated;
      const toneLabel    = tone ? ` · Tone ${tone}` : '';

      const html = renderVespers(blocks, {
        title: serviceTitle,
        date:  `${formatDate(date)}${toneLabel}${pronounLabel}`,
      });

      const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;

      // Format assembly warnings into human-readable messages
      const rawWarnings = blocks._warnings || [];
      const warningMessages = rawWarnings.map(w => formatAssemblyWarning(w.source, w.key)).filter(Boolean);
      const uniqueWarnings = [...new Set(warningMessages)];

      const warningBanner = uniqueWarnings.length > 0
        ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:10px 40px;background:#fff3cd;border-bottom:2px solid #e6ac00;color:#6b4800;">
             <strong>⚠ Some portions of this service are incomplete:</strong>
             <ul style="margin:4px 0 0 16px;padding:0;">${uniqueWarnings.map(m => `<li>${m}</li>`).join('')}</ul>
           </div>`
        : '';

      const injected = html.replace('<body>', '<body>' + backBar + warningBanner);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);

    } else if (/^\/api\/stichera\/(\d{1,2})\/(\d{1,2})$/.test(pathname)) {
      const [, m, d] = pathname.match(/^\/api\/stichera\/(\d{1,2})\/(\d{1,2})$/);
      const month = parseInt(m, 10);
      const day   = parseInt(d, 10);
      const data  = getSticheraDay(month, day);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No stichera found', month, day }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ month, day, commemorations: data }, null, 2));

    } else if (/^\/api\/menaion\/(\d{1,2})\/(\d{1,2})$/.test(pathname)) {
      const [, m, d] = pathname.match(/^\/api\/menaion\/(\d{1,2})\/(\d{1,2})$/);
      const month = parseInt(m, 10);
      const day   = parseInt(d, 10);
      const data  = getMenaionDay(month, day);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No commemorations found', month, day }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ month, day, commemorations: data }, null, 2));

    } else if (pathname === '/api/dashboard') {
      const q    = parseQuery(url);
      const year = parseInt(q.year, 10) || 2026;

      res.setHeader('Access-Control-Allow-Origin', '*');

      const result = buildDashboardData(year, sources);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } else if (pathname === '/dashboard') {
      serveStatic(res, path.join(__dirname, 'public', 'dashboard.html'), 'text/html');

    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderErrorPage(`Internal error: ${err.message}`));
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`OCA Service Browser running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
