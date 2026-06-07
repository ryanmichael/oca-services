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
    getLiturgyFixed, getOverlayFixed, resolveTranslation, resolveStyle,
    applyYouYour, tagBlocksWithOverlay,
    assembleTypika, renderServiceHTML, getDayLabel,
    getMenaionDayList, getOverlayRubrics,
    calculatePascha,
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
    const typikaFixedResolved  = getOverlayFixed('typika',  translation) || typikaFixed;
    const vespersFixedResolved = getOverlayFixed('vespers', translation) || fixedTexts;

    // "O Heavenly King" is omitted from Ascension (Pascha + 39) through the
    // eve of Pentecost (Pascha + 48). spec.paschalOpening already covers
    // Pascha + 0..38; this catches the awkward 10-day window after.
    const DAY_MS = 86400000;
    const dObj = new Date(date + 'T12:00:00Z');
    const pascha = calculatePascha(dObj.getUTCFullYear());
    const days = Math.round((dObj - pascha) / DAY_MS);
    const omitHeavenlyKing = days >= 39 && days <= 48;

    let blocks;
    try {
      blocks = assembleTypika(calendarEntry, liturgyFixedResolved, typikaFixedResolved,
        vespersFixedResolved, sources, { variant, omitHeavenlyKing });
    } catch (err) {
      console.error('assembleTypika error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }

    // Tag blocks against each of the three fixed-text sources Typika draws from
    // (liturgy: antiphons, Creed, Lord's Prayer, Psalm 33; typika: opening,
    // beatitude refrains, after-Gospel, CRG; vespers: Heavenly King, Trisagion
    // sequence, mostHolyTrinity). Whichever cascade introduced the string wins.
    tagBlocksWithOverlay(blocks, 'liturgy', translation);
    tagBlocksWithOverlay(blocks, 'typika',  translation);
    tagBlocksWithOverlay(blocks, 'vespers', translation);

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
