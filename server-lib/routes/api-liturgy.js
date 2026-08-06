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

        // Second-Koinonikon (Communion Verse) toggle: tri-state, not boolean.
        // `undefined` (unset) is a distinct state from `false` — see the
        // opts.includeSecondKoinonikon contract in liturgy-from-orthocal.js.
        // Unset leaves the polyeleos+ saint's Communion Verse on and the
        // cocelebrated-overlay one off; an explicit false suppresses both.
        // Deliberately no `!!` here: coercing unset to false would silently
        // drop the saint's Communion Verse for every parish.
        const includeSecondKoinonikon = (() => {
          if (q.secondKoinonikon === 'show' || q.secondKoinonikon === 'true' || q.secondKoinonikon === '1') return true;
          if (q.secondKoinonikon === 'hide' || q.secondKoinonikon === 'false' || q.secondKoinonikon === '0') return false;
          const r = overlayRubrics?.readings?.includeSecondKoinonikon;
          return typeof r === 'boolean' ? r : undefined;
        })();

        if (!calendarEntry.liturgy) {
          try {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, reqSources, style,
                { includeLesserSaints, includeSecondGospel, includeSecondKoinonikon,
                  principalOverrides: overlayRubrics?.principalOverrides,
                  antiphonSet:        overlayRubrics?.antiphonSet }) };
          } catch (err) {
            console.error(`Orthocal API error for ${date}:`, err.message);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Liturgy data unavailable for this date.', date }));
            return;
          }
        }

        // Patron-of-temple troparion + kontakion injection.
        //
        // Troparion: on Sundays inserted between Resurrection troparion and the
        //   day's saint(s); otherwise appended. Reader/choir skips if patron
        //   isn't being commemorated.
        // Kontakion: held in `patronKontakion` for the Sunday-kontakia restructure
        //   below. The restructure decides whether the patron or the day's saint
        //   claims the Glory slot, based on the principal-feast signal.
        let patronKontakion = null;
        if (overlayRubrics?.temple?.commemorationId && calendarEntry.liturgy) {
          const lit = calendarEntry.liturgy;
          const feastOnly = lit.feastOnly;
          if (!feastOnly && Array.isArray(lit.troparia)) {
            const patron = getMenaionPatron(overlayRubrics.temple.commemorationId);
            if (patron?.troparion) {
              const patronTrop = {
                tone: patron.troparion.tone,
                rubric: `Troparion of the Patron of the Temple, ${overlayRubrics.temple.title}, Tone ${patron.troparion.tone}:`,
                text: patron.troparion.text,
              };
              const d = new Date(date + 'T12:00:00Z');
              const isSundayLocal = d.getUTCDay() === 0;
              const resIdx = isSundayLocal
                ? lit.troparia.findIndex(t => /Resurrection/i.test(t.rubric || ''))
                : -1;
              if (resIdx >= 0) {
                lit.troparia = [
                  ...lit.troparia.slice(0, resIdx + 1),
                  patronTrop,
                  ...lit.troparia.slice(resIdx + 1),
                ];
              } else {
                lit.troparia = [...lit.troparia, patronTrop];
              }
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

        // Sunday Liturgy kontakia restructure. Standard OCA shape (per the OCA
        // Order of Services, ordinary Sunday):
        //   Kontakion of the Resurrection, Tone N   (first — NOT dropped)
        //   Glory: → Kontakion of the principal commemoration / patron of temple
        //   Now:   → Theotokion-Kontakion ("Protection of Christians...")
        // Verified 2026-07-11 against oca.org OOS 2021-0829 (10th Sun after
        // Pentecost): the Resurrection kontakion leads. Glory-slot selection by rank:
        //   - Principal feast / polyeleos+ saint (signaled by
        //     `hasCocelebratedOverlay`): day's saint takes Glory; patron drops.
        //   - Simple-rank Sunday (no overlay): patron takes Glory when set;
        //     menaion saint kontakion is read but not Glory-tagged.
        //   - No principal kontakion and no patron: falls back to the
        //     Resurrection kontakion alone.
        // Weekdays, Great Feasts, and feast-only days are left unchanged.
        if (calendarEntry.liturgy && Array.isArray(calendarEntry.liturgy.kontakia)
            && !calendarEntry.liturgy.feastOnly) {
          const d = new Date(date + 'T12:00:00Z');
          const isSundayLocal = d.getUTCDay() === 0;
          if (isSundayLocal) {
            const lit = calendarEntry.liturgy;
            const resK    = lit.kontakia.find(k => /Resurrection/i.test(k.rubric || ''));
            const saintKs = lit.kontakia.filter(k => k !== resK);
            const principalSundayFeast = !!lit.hasCocelebratedOverlay;

            let gloryK = null;
            let extraK = null;  // saint kontakion read but not Glory-tagged
            if (principalSundayFeast && saintKs[0]) {
              gloryK = saintKs[0];
            } else if (patronKontakion) {
              gloryK = patronKontakion;
              if (saintKs[0]) extraK = saintKs[0];
            } else if (saintKs[0]) {
              gloryK = saintKs[0];
            }

            // Lenten commemoration Sundays (Cross week 3, Palamas 2, Climacus
            // 4, Mary of Egypt 5, and Sunday of Orthodoxy week 1) sing the
            // Sunday's own kontakion under a COMBINED "Glory... now and
            // ever..." connector — no separate Theotokion-Kontakion at Now.
            // OCA typikon treats the day's own kontakion as claiming both
            // slots. Detect by getWeekOfLent (returns "1".."5") — falls
            // through to the standard Sunday-restructure otherwise.
            const lentenWeek = getWeekOfLent(d);
            const isLentenCommemorationSunday =
              lentenWeek === 1 || lentenWeek === 2 || lentenWeek === 3
              || lentenWeek === 4 || lentenWeek === 5;

            if (gloryK && isLentenCommemorationSunday) {
              lit.kontakia = [
                ...(extraK ? [{ ...extraK, connector: null }] : []),
                { ...gloryK, connector: 'Glory to the Father, and to the Son, and to the Holy Spirit. Now and ever, and unto ages of ages. Amen.' },
              ];
            } else if (gloryK) {
              const theo = liturgyFixedResolved['kontakion-theotokion'];
              const theoK = theo ? {
                tone:   theo.tone,
                rubric: theo.rubric,
                text:   theo.text,
                connector: 'Now and ever, and unto ages of ages. Amen.',
                theotokion: true,
              } : null;
              lit.kontakia = [
                ...(resK ? [{ ...resK, connector: null }] : []),
                ...(extraK ? [{ ...extraK, connector: null }] : []),
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
          blocks = assembleLiturgy(calendarEntry, liturgyFixedResolved, reqSources,
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
