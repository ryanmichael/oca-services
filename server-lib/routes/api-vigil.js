'use strict';

// GET /api/vigil?date=YYYY-MM-DD
//
// The All-Night Vigil served as ONE service: Great Vespers followed immediately
// by Matins. Before this route the two halves were only reachable separately —
// /api/service?service=vespers on the civil evening, /api/matins on the next
// day — so the UI's "All-Night Vigil" row served the Vespers half alone, under
// a full Vespers dismissal, and simply stopped where Matins should begin.
// Reported 2026-09-08 by the user after attending the vigil.
//
// Date convention follows the Vespers date-shift: `date` is the CIVIL EVENING
// the vigil is served (Mon 2026-09-07), the Vespers content comes from the next
// liturgical day (09-08), and the Matins half is that same liturgical day.
// So one date parameter drives both halves — callers pass the evening, exactly
// as they already do for /api/service.
//
// The First Hour, which the OCA order appends ("The First Hour follows
// immediately"), is NOT included: the four prayers it needs — "Thou Who at all
// times…", "O Christ, the true Light…", the concluding kontakion and the small
// dismissal — are in no local source, and the project does not author
// liturgical text from memory. Tracked as a source gap; see
// audit rule D20-vigil-includes-matins.

function handle(req, res, ctx) {
  const url = req.url || '/';

  const {
    sources, fixedTexts, matinsFixed,
    parseQuery, formatDate,
    getCalendarEntry, getNextDateStr,
    buildMatinsSpec, fetchOrthocalDay,
    getOverlayFixed, getOverlayRubrics,
    resolveTranslation, resolveStyle, resolveOctoechos,
    assembleForDate, assembleMatins, applyYouYour, resolvePronoun,
    getDayLabel, renderServiceHTML,
    getLiturgicalSeason, getDayOfWeek, getTone,
  } = ctx;

  const q           = parseQuery(url);
  const date        = (q.date || '').trim();
  const format      = (q.format || '').trim().toLowerCase();
  const translation = resolveTranslation(q);
  const pronoun     = resolvePronoun(q, getOverlayRubrics(translation));
  const style       = resolveStyle(q, translation);
  const reqSources  = { ...sources, octoechos: resolveOctoechos(sources, translation) };

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
    return;
  }

  (async () => {
    const overlayRubrics = getOverlayRubrics(translation);
    const vespersDate    = getNextDateStr(date);
    const vespersEntry   = getCalendarEntry(vespersDate, style, { rubrics: overlayRubrics });

    // Only serve this route where a vigil is actually appointed. Anything else
    // must go to /api/service or /api/matins so the caller cannot silently get
    // a "vigil" that is really an ordinary Vespers glued to an ordinary Matins.
    if (vespersEntry?.vespers?.serviceType !== 'all-night-vigil') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'No All-Night Vigil is appointed for this evening.',
        date,
        hint:  'Use /api/service?service=vespers for the evening service, and /api/matins for Matins.',
      }));
      return;
    }

    const allBlocks = [];
    const serviceTitle = (n, title) => ({
      id: `vigil-title-${n}`, section: title, type: 'rubric',
      speaker: null, text: title, label: 'service-title',
    });
    // Both halves emit their own id namespaces (each has a `dis-amen`, a
    // `trisagion`, and so on), so prefix per-half when bundling.
    const namespace = (prefix, blocks) =>
      blocks.map(b => (b.id ? { ...b, id: `${prefix}-${b.id}` } : b));

    // ── Part 1: Great Vespers ────────────────────────────────────────────────
    // Enrich the OT lessons with scripture text, exactly as /api/service does —
    // a Great Feast vigil is precisely the case that has them.
    let entryOverride = null;
    try {
      if (vespersEntry?.vespers?.otReadings?.length > 0) {
        const orthocalData = await fetchOrthocalDay(vespersDate);
        const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
        entryOverride = {
          ...vespersEntry,
          vespers: {
            ...vespersEntry.vespers,
            otReadings: vespersEntry.vespers.otReadings.map((r, i) => {
              const match = vesperReadings[i];
              return match?.passage?.length
                ? { ...r, text: match.passage.map(p => p.content).join(' ') }
                : r;
            }),
          },
        };
      }
    } catch (err) {
      console.warn('Vigil OT enrichment failed (non-fatal):', err.message);
    }

    const vespersFixedResolved = translation
      ? (getOverlayFixed('vespers', translation) || fixedTexts)
      : fixedTexts;

    let vespersResult;
    try {
      vespersResult = assembleForDate(vespersDate, pronoun, entryOverride,
        vespersFixedResolved, reqSources, style, { rubrics: overlayRubrics });
    } catch (err) {
      console.error('vigil: assembleForDate error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    if (!vespersResult) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No Vespers available for this date.', date }));
      return;
    }

    const { blocks: vespersBlocks, calendarEntry, tone } = vespersResult;
    allBlocks.push(serviceTitle(1, 'Great Vespers'));
    allBlocks.push(...namespace('gv', vespersBlocks));

    // ── Part 2: Matins ───────────────────────────────────────────────────────
    // Matins of the liturgical day the vigil enters — the same date the Vespers
    // half drew its content from.
    const md      = new Date(vespersDate + 'T12:00:00Z');
    const mdow    = getDayOfWeek(md);
    const mseason = getLiturgicalSeason(md);
    const mtone   = getTone(md);

    const matinsSpec = buildMatinsSpec(vespersDate, md, mdow, mseason, mtone, reqSources, style);
    if (matinsSpec) {
      // Tell the Matins assembler it is being served AT A VIGIL: it then skips
      // the Typical Beginning and opens at the Six Psalms, because Vespers has
      // already begun the service. That branch predates this route.
      matinsSpec.serviceType = 'all-night-vigil';

      // A Vigil has ONE dismissal, at the very end. Great Vespers gives none of
      // its own, so the dismissal spec the Vespers half just computed — festal
      // introit, day patron, saints — belongs to the Matins dismissal that
      // closes the vigil. Without this hand-off the festal introit vanishes
      // from the whole service: it left the Vespers half with the dismissal and
      // Matins would fall back to the "[Proper Dismissal for the day]"
      // placeholder. Caught by contract INV-8 on 2026-08-05 (Transfiguration
      // eve) while making this change.
      matinsSpec.dismissal = vespersResult.calendarEntry?.vespers?.dismissal || null;

      if (matinsSpec.gospel && !matinsSpec.gospel.text) {
        try {
          const orthocalData  = await fetchOrthocalDay(vespersDate);
          const matinsReading = (orthocalData.readings || []).find(
            r => r.source && r.source.includes('Matins Gospel'));
          if (matinsReading?.passage?.length) {
            matinsSpec.gospel.text   = matinsReading.passage.map(v => v.content).join('\n\n');
            matinsSpec.gospel._source = 'orthocal';
          }
        } catch (err) {
          console.warn('Vigil Matins gospel enrichment failed (non-fatal):', err.message);
        }
      }

      const matinsDay = {
        date: vespersDate,
        dayOfWeek: mdow,
        liturgicalContext: { season: mseason, tone: mtone },
        matins: matinsSpec,
      };

      try {
        const matinsBlocks = assembleMatins(matinsDay, matinsFixed, fixedTexts, reqSources,
          { rubrics: overlayRubrics });
        allBlocks.push(serviceTitle(2, 'Matins'));
        allBlocks.push(...namespace('mt', matinsBlocks));
      } catch (err) {
        console.error('vigil: assembleMatins error:', err);
        allBlocks.push(serviceTitle(2, 'Matins'));
        allBlocks.push({
          id: 'vigil-matins-error', section: 'Matins', type: 'rubric', speaker: null,
          text: '[Matins could not be assembled for this date.]',
        });
      }
    } else {
      // Surfaced rather than swallowed: a vigil without its Matins half is the
      // exact defect this route exists to fix.
      allBlocks.push(serviceTitle(2, 'Matins'));
      allBlocks.push({
        id: 'vigil-matins-missing', section: 'Matins', type: 'rubric', speaker: null,
        text: '[No Matins data is available for this date.]',
      });
    }

    if (pronoun === 'yy') {
      for (const block of allBlocks) {
        if (block.text)  block.text  = applyYouYour(block.text);
        if (block.label) block.label = applyYouYour(block.label);
      }
    }

    const season          = calendarEntry.liturgicalContext?.season || null;
    const dow             = calendarEntry.dayOfWeek || null;
    const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);

    for (const b of allBlocks) {
      if (!b.provenance) b.provenance = 'OCA';
    }

    if (format === 'html') {
      const toneLabel = tone ? ` · Tone ${tone}` : '';
      renderServiceHTML(res, allBlocks, 'All-Night Vigil',
        `${formatDate(date)} (eve)${toneLabel}`, pronoun);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      date,
      vespersDate,
      serviceType:     'all-night-vigil',
      serviceName:     'All-Night Vigil',
      tone,
      season,
      liturgicalLabel,
      commemorations:  calendarEntry.commemorations || [],
      translation:     translation || null,
      style,
      blocks:          allBlocks,
    }));
  })().catch((err) => {
    console.error('api-vigil error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

module.exports = handle;
