'use strict';

// GET /api/typika?date=YYYY-MM-DD[&as=typika|typika-crg][&format=html][&translation=...]
//
// Reader's Typika (?as=typika, default) or Reader's Typika with Communion of
// the Reserved Gifts (?as=typika-crg). Reuses the same calendar / Apostle /
// Gospel resolution as /api/liturgy — Orthocal-backed via buildLiturgyFromOrthocal.

function handle(req, res, ctx) {
  const {
    sources, fixedTexts, liturgyFixed, typikaFixed,
    parseQuery, formatDate,
    getCalendarEntry,
    buildLiturgyFromOrthocal, fetchOrthocalDay,
    getLiturgyFixed, resolveTranslation, resolveStyle,
    applyYouYour, tagBlocksWithOverlay,
    assembleTypika, renderServiceHTML, getDayLabel,
    getMenaionDayList, getOverlayRubrics,
  } = ctx;

  const url = req.url || '/';
  const q   = parseQuery(url);
  const date = (q.date || '').trim();
  const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
  const format  = (q.format  || '').trim().toLowerCase();
  const variant = (q.as === 'typika-crg' || q.as === 'crg') ? 'crg' : 'reader';
  const translation = resolveTranslation(q);
  const style       = resolveStyle(q, translation);

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
    return;
  }

  (async () => {
    let calendarEntry = getCalendarEntry(date, style);
    if (!calendarEntry) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No calendar entry for this date.', date }));
      return;
    }

    // Pull the same Liturgy spec used by /api/liturgy — Typika reuses every
    // variable proper (tone, troparia, kontakia, prokeimenon, Apostle,
    // alleluia, Gospel, communion hymn).
    if (!calendarEntry.liturgy) {
      try {
        const orthocalData = await fetchOrthocalDay(date);
        calendarEntry = { ...calendarEntry,
          liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources, style) };
      } catch (err) {
        console.error(`Orthocal API error for ${date}:`, err.message);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Calendar data unavailable for this date.', date }));
        return;
      }
    }

    const liturgyFixedResolved = getLiturgyFixed(translation);

    let blocks;
    try {
      blocks = assembleTypika(calendarEntry, liturgyFixedResolved, typikaFixed,
        fixedTexts, sources, { variant });
    } catch (err) {
      console.error('assembleTypika error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }

    tagBlocksWithOverlay(blocks, 'liturgy', translation);

    if (pronoun === 'yy') {
      for (const b of blocks) {
        if (b.text)  b.text  = applyYouYour(b.text);
        if (b.label) b.label = applyYouYour(b.label);
      }
    }

    const season = calendarEntry.liturgicalContext?.season || null;
    const tone   = calendarEntry.liturgicalContext?.tone ?? null;
    const dow    = calendarEntry.dayOfWeek || null;
    const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);
    let commemorations = calendarEntry.commemorations || [];
    if (commemorations.length === 0) {
      const [, mm, dd] = date.split('-').map(Number);
      const dayList = getMenaionDayList(mm, dd);
      if (dayList) {
        commemorations = dayList.commemorations.map((title, i) => ({
          title, isPrincipal: i === 0, tone: null, hasStichera: false,
        }));
      }
    }

    const serviceName = variant === 'crg'
      ? "Reader's Typika with Communion of the Reserved Gifts"
      : "Reader's Typika";

    if (format === 'html') {
      const toneLabel = tone ? ` · Tone ${tone}` : '';
      renderServiceHTML(res, blocks, serviceName, `${formatDate(date)}${toneLabel}`, pronoun);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      date,
      serviceType: 'typika',
      serviceVariant: variant,
      serviceName,
      tone, season,
      liturgicalLabel,
      commemorations,
      translation: translation || null,
      style,
      blocks,
    }));
  })().catch(err => {
    console.error('Typika route error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error.' }));
    }
  });
}

module.exports = handle;
