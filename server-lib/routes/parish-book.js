'use strict';

// Parish Book — the bound book of a service's fixed text, plus the weekly
// insert carrying what changes. Spec: features/parish-book.md
//
//   GET /parish-book?parish=P&edition=E            the book (reading order)
//   GET /parish-book?parish=P&date=YYYY-MM-DD      this week's insert
//   GET /api/parish-book?parish=P                  editions + their frozen fingerprints
//   GET /api/parish-book/book?parish=P&edition=E   the frozen book layout
//   GET /api/parish-book/insert?parish=P&date=D    the insert for one date
//
// The book is served from its FROZEN layout (parish-books/<P>/<E>.book.json),
// never re-derived per request: copies of it sit in the narthex, and the
// insert has to agree with what is printed in them, not with what the
// derivation would produce today. Drift is a build-time check.

const path = require('path');
const { serveStatic } = require('../_shared/serve-static');
const E = require('../parish-book/editions');
const { splitService } = require('../parish-book/split');
const { getService } = require('../parish-book/service-source');

const ROOT = path.resolve(__dirname, '..', '..');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(body));
}

function q(req) { return new URL(req.url, 'http://x').searchParams; }

/** The insert for one date: find the edition that claims it, cut it against
 *  that edition's frozen book. Exported for the contract test. */
async function insertFor(ctx, parish, date) {
  const editions = E.listEditions(parish).filter(e => E.onWeekday(e, date));
  if (!editions.length) return { fits: false, reason: 'no Parish Book edition serves this day of the week' };
  // All editions of one parish/service share the service + translation, so
  // one assembly answers every edition's membership test.
  let svc;
  try { svc = await getService(ctx, editions[0], date); }
  catch (e) { return { fits: false, reason: e.message, status: e.status }; }

  const meta = {
    date, liturgicalLabel: svc.liturgicalLabel, season: svc.season,
    tone: svc.tone, serviceName: svc.serviceName,
  };
  const edition = editions.find(e => E.claims(e, date, svc));
  if (!edition) {
    // Say WHY when the only thing in the way is the antiphons: "not in
    // ordinaryTime" would be false on a Feast of the Lord in ordinary time.
    const festal = editions.some(e => e.membership?.antiphons && svc.antiphons !== e.membership.antiphons
      && E.claims({ ...e, membership: { ...e.membership, antiphons: undefined } }, date, svc));
    // Likewise a dated seasonal layer (Liturgy #2): the book prints the
    // standing texts, so that week is a full-booklet week by decision.
    const layers = (svc.seasonalLayers || []).map(l => l.id);
    const seasonal = layers.length && editions.some(e =>
      E.claims({ ...e, membership: { ...e.membership, seasonalLayer: layers.slice().sort().join(',') } }, date, svc));
    return { fits: false, ...meta, reason: festal
      ? `the feast's own antiphons replace the Beatitudes the book prints`
      : seasonal
      ? `the parish sings its seasonal set (${layers.join(', ')}) this week, not the texts the book prints — print the full booklet`
      : `no edition of this parish's book covers ${svc.serviceName} in ${svc.season}` };
  }
  const book = E.loadBook(parish, edition.id);
  if (!book) return { fits: false, ...meta, edition: edition.id, reason: 'this edition has not been built yet' };
  const r = splitService(svc.blocks, book);
  if (!r.fits) {
    return { fits: false, ...meta, edition: edition.id, fingerprint: book.fingerprint, misfit: r.misfit,
      reason: 'this Sunday does not fit the printed book — print the full booklet' };
  }
  return {
    fits: true, ...meta,
    parish, parishName: edition.parishName,
    edition: edition.id, editionTitle: edition.title, fingerprint: book.fingerprint,
    citationsOnly: edition.citationsOnly || null,
    resumeAt: book.stretches.map(st => ({ stretch: st.id, section: resumeSection(book, st.id) })),
    stretches: r.stretches, also: r.also,
  };
}

/** The section the reader returns to in the book after a stretch. */
function resumeSection(book, stretchId) {
  const i = book.items.findIndex(it => it.kind === 'resume' && it.stretch === stretchId);
  for (let k = i + 1; k < book.items.length; k++) {
    if (book.items[k].kind === 'block') return book.items[k].block.section;
  }
  return null;
}

function handle(req, res, ctx) {
  const pathname = req.url.split('?')[0];
  const p = q(req);
  const parish = p.get('parish') || '';

  if (pathname === '/parish-book') {
    return serveStatic(res, path.join(ROOT, 'public', 'parish-book.html'), 'text/html', req);
  }

  if (pathname === '/api/parish-book') {
    try {
      const eds = E.listEditions(parish).map(e => {
        const b = E.loadBook(parish, e.id);
        return { id: e.id, title: e.title, subtitle: e.subtitle, service: e.service,
          fingerprint: b?.fingerprint || null, builtFrom: b?.builtFrom?.commit || null };
      });
      return json(res, 200, { parish, editions: eds });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (pathname === '/api/parish-book/book') {
    try {
      const edition = E.loadEdition(parish, p.get('edition') || '');
      const book = E.loadBook(parish, edition.id);
      if (!book) return json(res, 404, { error: 'edition not built' });
      return json(res, 200, { ...book, parishName: edition.parishName, title: edition.title,
        subtitle: edition.subtitle, resumeAt: book.stretches.map(st => ({ stretch: st.id, section: resumeSection(book, st.id) })) });
    } catch (e) { return json(res, 404, { error: e.message }); }
  }

  if (pathname === '/api/parish-book/insert') {
    const date = p.get('date') || '';
    if (!DATE.test(date)) return json(res, 400, { error: 'date=YYYY-MM-DD required' });
    insertFor(ctx, parish, date)
      .then(r => json(res, 200, r))
      .catch(e => json(res, 500, { error: e.message }));
    return;
  }

  json(res, 404, { error: 'not found' });
}

module.exports = handle;
module.exports.insertFor = insertFor;
