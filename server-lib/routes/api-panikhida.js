'use strict';

/**
 * GET /api/panikhida
 *
 * The Panikhida is not calendar-bound, so `date` is optional and only used
 * for the page heading and the Bright Week guard. Query:
 *   names=John,Mary     names of the departed (comma-separated; optional)
 *   gender=m|f          for a single name — picks his/her; default m
 *   canon=full|brief    full = 8 heirmoi; brief = Odes III, VI, IX (default full)
 *   psalm90=0           omit Psalm 90 and its preamble
 *   pronoun=tt|yy, translation=<id>, format=html — as on every other route
 */
function handle(req, res, ctx) {
  const url = req.url || '/';
  const {
    panikhidaFixed, parseQuery, formatDate,
    getOverlayFixed, tagBlocksWithOverlay, resolveTranslation,
    assemblePanikhida, applyYouYour, renderServiceHTML,
    getLiturgicalSeason,
  } = ctx;

  const q       = parseQuery(url);
  const date    = (q.date || '').trim();
  const pronoun = (['tt', 'yy'].includes(q.pronoun) ? q.pronoun : 'tt');
  const format  = (q.format || '').trim().toLowerCase();
  const canon   = q.canon === 'brief' ? 'brief' : 'full';
  const gender  = q.gender === 'f' ? 'f' : 'm';
  const psalm90 = !(q.psalm90 === '0' || q.psalm90 === 'false');
  const names   = (q.names || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
  const translation = resolveTranslation(q);

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid date parameter.' }));
    return;
  }

  // The Paschal Panikhida of Bright Week is a different order (paschal
  // canon, no Trisagion opening) and is not modeled. Refuse rather than
  // print the wrong service.
  if (date && getLiturgicalSeason(new Date(date + 'T12:00:00Z')) === 'brightWeek') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'During Bright Week the Panikhida is served in its Paschal form, which is not yet available.',
      date,
    }));
    return;
  }

  const fixed = getOverlayFixed('panikhida', translation) || panikhidaFixed;

  let blocks;
  try {
    blocks = assemblePanikhida(fixed, { names, gender, canon, psalm90 });
  } catch (err) {
    console.error('assemblePanikhida error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  tagBlocksWithOverlay(blocks, 'panikhida', translation);

  if (pronoun === 'yy') {
    for (const b of blocks) {
      if (b.text)  b.text  = applyYouYour(b.text);
      if (b.label) b.label = applyYouYour(b.label);
    }
  }

  const forWhom = names.length ? `for ${names.join(', ')}` : 'for the departed';
  const subtitle = date ? `${formatDate(date)} · ${forWhom}` : forWhom;

  if (format === 'html') {
    renderServiceHTML(res, blocks, 'Panikhida', subtitle, pronoun);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    date: date || null,
    serviceType:     'panikhida',
    serviceName:     'Panikhida',
    liturgicalLabel: forWhom,
    names, gender: names.length === 1 ? gender : null, canon, psalm90,
    translation: translation || null,
    blocks,
  }));
}

module.exports = handle;
