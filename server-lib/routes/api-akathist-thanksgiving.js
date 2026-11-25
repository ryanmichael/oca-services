'use strict';

/**
 * GET /api/akathist-thanksgiving
 *
 * The Akathist of Thanksgiving ("Glory to God for All Things"). Fixed text;
 * `date` is used only for the heading. It is LISTED on the week view for the
 * Wednesday and Thursday of US Thanksgiving week (server-lib/search/
 * service-catalog.js) but renders for any date, so search can open it too.
 * Query:
 *   date=YYYY-MM-DD       heading only (optional)
 *   beginning=0           omit the opening prayers
 *   pronoun=tt|yy, translation=<id>, format=html — as on every other route
 */
function handle(req, res, ctx) {
  const url = req.url || '/';
  const {
    akathistThanksgivingFixed, fixedTexts, parseQuery, formatDate,
    getOverlayFixed, tagBlocksWithOverlay, resolveTranslation,
    assembleAkathistThanksgiving, applyYouYour, renderServiceHTML,
  } = ctx;

  const q         = parseQuery(url);
  const date      = (q.date || '').trim();
  const pronoun   = (['tt', 'yy'].includes(q.pronoun) ? q.pronoun : 'tt');
  const format    = (q.format || '').trim().toLowerCase();
  const beginning = !(q.beginning === '0' || q.beginning === 'false');
  const translation = resolveTranslation(q);

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid date parameter.' }));
    return;
  }

  const fixed   = getOverlayFixed('akathist-thanksgiving', translation) || akathistThanksgivingFixed;
  const vespers = getOverlayFixed('vespers', translation) || fixedTexts;

  let blocks;
  try {
    blocks = assembleAkathistThanksgiving(fixed, vespers, { beginning });
  } catch (err) {
    console.error('assembleAkathistThanksgiving error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  tagBlocksWithOverlay(blocks, 'akathist-thanksgiving', translation);

  if (pronoun === 'yy') {
    for (const b of blocks) {
      if (b.text)  b.text  = applyYouYour(b.text);
      if (b.label) b.label = applyYouYour(b.label);
    }
  }

  const name     = 'Akathist of Thanksgiving';
  const subtitle = (fixed._meta && fixed._meta.subtitle) || 'Glory to God for All Things';

  if (format === 'html') {
    renderServiceHTML(res, blocks, name, date ? `${formatDate(date)} · ${subtitle}` : subtitle, pronoun);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    date: date || null,
    serviceType:     'akathistThanksgiving',
    serviceName:     name,
    liturgicalLabel: subtitle,
    beginning,
    translation: translation || null,
    blocks,
  }));
}

module.exports = handle;
