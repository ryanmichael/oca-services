'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const { getMenaionPatron } = require('../sources/menaion');

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
      const format  = (q.format  || '').trim().toLowerCase();
      const translation = resolveTranslation(q);
      const style       = resolveStyle(q, translation);

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      {
        const d = new Date(date + 'T12:00:00Z');
        if (!isLiturgyServed(d, style)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No Divine Liturgy is served on this date.', date }));
          return;
        }
      }

      (async () => {
        let calendarEntry = getCalendarEntry(date, style);
        if (!calendarEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No liturgy available for this date.', date }));
          return;
        }

        const liturgyFixedResolved = getLiturgyFixed(translation);
        const overlayRubrics       = getOverlayRubrics(translation);

        // Lesser-saints toggle: query param wins; otherwise fall back to the
        // overlay's rubric setting; otherwise default to false (hidden).
        // Parishes that always commemorate every saint at Liturgy can set
        // rubrics.troparia.includeLesserSaints = true in their manifest.
        const includeLesserSaints = (() => {
          if (q.lesserSaints === 'show' || q.lesserSaints === 'true' || q.lesserSaints === '1') return true;
          if (q.lesserSaints === 'hide' || q.lesserSaints === 'false' || q.lesserSaints === '0') return false;
          return !!overlayRubrics?.troparia?.includeLesserSaints;
        })();

        // Second-Gospel toggle: same shape. Standard OCA practice reads only
        // one Gospel at Liturgy even when a feast Gospel is appointed. Parishes
        // that read both can set rubrics.readings.includeSecondGospel = true.
        // (Both Epistles always render — Epistle doubling is the norm.)
        const includeSecondGospel = (() => {
          if (q.secondGospel === 'show' || q.secondGospel === 'true' || q.secondGospel === '1') return true;
          if (q.secondGospel === 'hide' || q.secondGospel === 'false' || q.secondGospel === '0') return false;
          return !!overlayRubrics?.readings?.includeSecondGospel;
        })();

        if (!calendarEntry.liturgy) {
          try {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources, style,
                { includeLesserSaints, includeSecondGospel }) };
          } catch (err) {
            console.error(`Orthocal API error for ${date}:`, err.message);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Liturgy data unavailable for this date.', date }));
            return;
          }
        }

        // Patron-of-temple troparion injection. Always appended to the troparia
        // list when not feast-only; the choir/reader skips if not commemorating.
        // Patron's KONTAKION is handled by the Sunday-kontakia restructure below
        // (it gets dropped when a principal-feast kontakion claims the Glory slot).
        let patronKontakion = null;
        if (overlayRubrics?.temple?.commemorationId && calendarEntry.liturgy) {
          const lit = calendarEntry.liturgy;
          const feastOnly = lit.feastOnly;
          if (!feastOnly && Array.isArray(lit.troparia)) {
            const patron = getMenaionPatron(overlayRubrics.temple.commemorationId);
            if (patron?.troparion) {
              lit.troparia = [...lit.troparia, {
                tone: patron.troparion.tone,
                rubric: `Troparion of the Patron of the Temple, ${overlayRubrics.temple.title}, Tone ${patron.troparion.tone}:`,
                text: patron.troparion.text,
              }];
            }
            if (patron?.kontakion) {
              patronKontakion = {
                tone: patron.kontakion.tone,
                rubric: `Kontakion of the Patron of the Temple, ${overlayRubrics.temple.title}, Tone ${patron.kontakion.tone}:`,
                text: patron.kontakion.text,
              };
            }
          }
        }

        // Sunday Liturgy kontakia restructure. Standard OCA shape:
        //   Glory: → Kontakion of the principal saint (or patron, if no menaion saint)
        //   Now:   → Theotokion-Kontakion ("Protection of Christians...")
        // The Resurrection kontakion is dropped — the Sunday is carried by the
        // Resurrection troparion. On Sundays with neither a menaion kontakion
        // nor a patron, falls back to the Resurrection kontakion alone.
        // Weekdays, Great Feasts, and feast-only days are left unchanged.
        if (calendarEntry.liturgy && Array.isArray(calendarEntry.liturgy.kontakia)
            && !calendarEntry.liturgy.feastOnly) {
          const d = new Date(date + 'T12:00:00Z');
          const isSundayLocal = d.getUTCDay() === 0;
          if (isSundayLocal) {
            const lit = calendarEntry.liturgy;
            const resK    = lit.kontakia.find(k => /Resurrection/i.test(k.rubric || ''));
            const saintKs = lit.kontakia.filter(k => k !== resK);
            const gloryK  = saintKs[0] || patronKontakion;
            if (gloryK) {
              const theo = liturgyFixedResolved['kontakion-theotokion'];
              const theoK = theo ? {
                tone:   theo.tone,
                rubric: theo.rubric,
                text:   theo.text,
                connector: 'Now and ever, and unto ages of ages. Amen.',
              } : null;
              lit.kontakia = [
                { ...gloryK, connector: 'Glory to the Father, and to the Son, and to the Holy Spirit.' },
                ...(theoK ? [theoK] : []),
              ];
            } else if (resK) {
              lit.kontakia = [{ ...resK, connector: null }];
            }
          }
        }

        let blocks;
        try {
          blocks = assembleLiturgy(calendarEntry, liturgyFixedResolved, sources,
            { rubrics: overlayRubrics });
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
          style,
          blocks,
        }));
      })().catch(err => {
        console.error('Liturgy route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

}

module.exports = handle;
