'use strict';

// Routes dispatcher. Maps pathname → route handler. Each handler has the
// signature `(req, res, ctx) => void`; ctx carries all the boot-time state
// (sources + 11 fixed-text objects + helpers exposed via destructure).
//
// The 5xx fallback at the bottom mirrors the original handleRequest:
// any uncaught error inside a route gets converted to an HTML error page.

const { captureException, requestLogger } = require('../observability');

const home                = require('./home');
const favicon             = require('./favicon');
const publicAssets        = require('./public-assets');
const apiService          = require('./api-service');
const apiEducationModules        = require('./api-education-modules');
const apiEducationModulesVespers = require('./api-education-modules-vespers');
const apiTranslations     = require('./api-translations');
const apiTranslationsDiff = require('./api-translations-diff');
const parishAdmin         = require('./parish-admin');
const apiLiturgy          = require('./api-liturgy');
const apiTypika           = require('./api-typika');
const apiPresanctified    = require('./api-presanctified');
const apiBridegroomMatins = require('./api-bridegroom-matins');
const apiMatins           = require('./api-matins');
const apiPassionGospels   = require('./api-passion-gospels');
const apiRoyalHours       = require('./api-royal-hours');
const apiLamentations     = require('./api-lamentations');
const apiVesperalLiturgy  = require('./api-vesperal-liturgy');
const apiKneelingVespers  = require('./api-kneeling-vespers');
const apiPaschalHours     = require('./api-paschal-hours');
const apiPaschaCollection = require('./api-pascha-collection');
const apiChoirPrep        = require('./api-choir-prep');
const apiDays             = require('./api-days');
const apiSearch           = require('./api-search');
const servicePage         = require('./service-page');
const apiSticheraDay      = require('./api-stichera-day');
const apiMenaionDay       = require('./api-menaion-day');
const apiDashboard        = require('./api-dashboard');
const dashboardPage       = require('./dashboard-page');

const STICHERA_RE = /^\/api\/stichera\/(\d{1,2})\/(\d{1,2})$/;
const MENAION_RE  = /^\/api\/menaion\/(\d{1,2})\/(\d{1,2})$/;

// Per-jurisdiction route prefixes (e.g. /oca/api/service, /rocor/api/matins).
// Strips the prefix and injects `?translation=<jurisdiction>` as the default,
// so every existing route resolves unchanged. An explicit ?translation= in the
// query wins over the prefix.
const JURISDICTION_PREFIX_RE = /^\/(oca|rocor|antiochian|serbian|georgian)(\/[^?]*)?(\?.*)?$/;

function rewriteJurisdictionPrefix(req) {
  const m = JURISDICTION_PREFIX_RE.exec(req.url || '');
  if (!m) return;
  const jurisdiction = m[1];
  const rest         = m[2] || '/';
  const qs           = m[3] || '';
  if (qs && /[?&]translation=/.test(qs)) {
    req.url = `${rest}${qs}`;
  } else {
    const sep = qs ? '&' : '?';
    req.url = `${rest}${qs}${sep}translation=${jurisdiction}`;
  }
}

function dispatch(req, res, ctx) {
  rewriteJurisdictionPrefix(req);
  requestLogger(req, res);
  const url      = req.url || '/';
  const pathname = url.split('?')[0];

  // Liveness probe — answer fast, no boot-state dependency. Railway uptime
  // and external monitors hit this.
  if (pathname === '/healthz' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  try {
    if (pathname === '/')                                         return home(req, res, ctx);
    if (pathname === '/favicon.svg')                              return favicon(req, res, ctx);
    if (pathname.startsWith('/styles/') || pathname.startsWith('/scripts/'))
                                                                  return publicAssets(req, res, ctx);
    if (pathname === '/api/service')                              return apiService(req, res, ctx);
    if (pathname === '/api/education-modules')                    return apiEducationModules(req, res, ctx);
    if (pathname === '/api/education-modules-vespers')            return apiEducationModulesVespers(req, res, ctx);
    if (pathname.startsWith('/parish-admin/'))                    return parishAdmin(req, res, ctx);
    if (pathname === '/api/translations')                         return apiTranslations(req, res, ctx);
    if (pathname.startsWith('/api/translations/') && pathname.endsWith('/diff'))
                                                                  return apiTranslationsDiff(req, res, ctx);
    if (pathname === '/api/liturgy')                              return apiLiturgy(req, res, ctx);
    if (pathname === '/api/typika')                               return apiTypika(req, res, ctx);
    if (pathname === '/api/presanctified')                        return apiPresanctified(req, res, ctx);
    if (pathname === '/api/bridegroom-matins')                    return apiBridegroomMatins(req, res, ctx);
    if (pathname === '/api/matins')                               return apiMatins(req, res, ctx);
    if (pathname === '/api/passion-gospels')                      return apiPassionGospels(req, res, ctx);
    if (pathname === '/api/royal-hours')                          return apiRoyalHours(req, res, ctx);
    if (pathname === '/api/lamentations')                         return apiLamentations(req, res, ctx);
    if (pathname === '/api/vesperal-liturgy')                     return apiVesperalLiturgy(req, res, ctx);
    if (pathname === '/api/kneeling-vespers')                     return apiKneelingVespers(req, res, ctx);
    if (pathname === '/api/paschal-hours')                        return apiPaschalHours(req, res, ctx);
    if (pathname === '/api/pascha-collection')                    return apiPaschaCollection(req, res, ctx);
    if (pathname === '/api/choir-prep')                           return apiChoirPrep(req, res, ctx);
    if (pathname === '/api/days')                                 return apiDays(req, res, ctx);
    if (pathname === '/api/search')                               return apiSearch(req, res, ctx);
    if (pathname === '/service')                                  return servicePage(req, res, ctx);
    if (STICHERA_RE.test(pathname))                               return apiSticheraDay(req, res, ctx);
    if (MENAION_RE.test(pathname))                                return apiMenaionDay(req, res, ctx);
    if (pathname === '/api/dashboard')                            return apiDashboard(req, res, ctx);
    if (pathname === '/dashboard')                                return dashboardPage(req, res, ctx);

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    captureException(err, { route: pathname, query: (req.url || '').split('?')[1] || '' });
    const { renderErrorPage } = ctx;
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderErrorPage(`Internal error: ${err.message}`));
  }
}

module.exports = { dispatch };
