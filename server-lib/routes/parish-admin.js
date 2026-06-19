'use strict';

// Parish admin settings — HTML page + JSON API.
//
// Routes handled here (matched by prefix in server-lib/routes/index.js):
//   GET  /parish-admin/<slug>            → HTML settings page (auth required)
//   GET  /parish-admin/<slug>/settings   → JSON of current settings
//   POST /parish-admin/<slug>/settings   → JSON save (writes DB, refreshes overlay)
//
// Auth: see server-lib/parishes/auth.js. Token in ?token=, on success becomes
// HttpOnly cookie; the route then 302-redirects to the clean URL.

const fs   = require('fs');
const path = require('path');
const { openDb, openDbWrite }   = require('../cache/sqlite');
const { authenticate, checkAndRecordWrite } = require('../parishes/auth');
const { refreshParishOverlay } = require('../parishes');

const ROOT       = path.resolve(__dirname, '..', '..');
const PAGE_HTML  = path.join(ROOT, 'public', 'parish-admin.html');

// Subset of parish_settings columns clients may write. Everything else
// (parish_id, created_at, jurisdiction, extends_chain) is admin-managed.
const WRITABLE_FIELDS = [
  'name', 'city',
  'primate_name', 'ruling_hierarch_name',
  'patron_natural_key', 'patron_title',
  'rubric_confess_first',
  'rubric_omit_pre_trisagion_litany',
  'rubric_include_lesser_saints',
  'rubric_include_second_gospel',
  'rubric_include_second_koinonikon',
  'rubric_omit_catechumens_seasons',
  'rubric_paschal_communion_year_round',
];

const BOOL_FIELDS = new Set([
  'rubric_confess_first', 'rubric_omit_pre_trisagion_litany',
  'rubric_include_lesser_saints', 'rubric_include_second_gospel',
  'rubric_include_second_koinonikon', 'rubric_paschal_communion_year_round',
]);

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{2,49}$/;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function sendHtml(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
}

function sendText(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => {
      buf += c;
      if (buf.length > 64 * 1024) {
        req.destroy();
        reject(new Error('payload too large'));
      }
    });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

function parseSlug(pathname) {
  const m = /^\/parish-admin\/([^/?]+)(\/[^?]*)?$/.exec(pathname);
  if (!m) return null;
  const slug = m[1];
  if (!SLUG_REGEX.test(slug)) return null;
  return { slug, subpath: m[2] || '' };
}

function fetchSettingsRow(parishId) {
  const db = openDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT * FROM parish_settings WHERE parish_id = ?').get(parishId);
    if (!row) return null;
    const picks = db.prepare(
      'SELECT variant_key, variant_id FROM parish_variant_picks WHERE parish_id = ?'
    ).all(parishId);
    return { row, picks };
  } finally {
    db.close();
  }
}

function handleGetSettings(parishId, res) {
  const data = fetchSettingsRow(parishId);
  if (!data) return send(res, 404, { error: 'parish_not_found' });
  return send(res, 200, {
    parish_id:            data.row.parish_id,
    name:                 data.row.name,
    city:                 data.row.city,
    jurisdiction:         data.row.jurisdiction,
    primate_name:         data.row.primate_name,
    ruling_hierarch_name: data.row.ruling_hierarch_name,
    patron_natural_key:   data.row.patron_natural_key,
    patron_title:         data.row.patron_title,
    rubric_confess_first:                !!data.row.rubric_confess_first,
    rubric_omit_pre_trisagion_litany:    !!data.row.rubric_omit_pre_trisagion_litany,
    rubric_include_lesser_saints:        !!data.row.rubric_include_lesser_saints,
    rubric_include_second_gospel:        !!data.row.rubric_include_second_gospel,
    rubric_include_second_koinonikon:    !!data.row.rubric_include_second_koinonikon,
    rubric_omit_catechumens_seasons:     data.row.rubric_omit_catechumens_seasons || '',
    rubric_paschal_communion_year_round: !!data.row.rubric_paschal_communion_year_round,
    variant_picks: data.picks,
    updated_at: data.row.updated_at,
  });
}

async function handlePostSettings(parishId, req, res) {
  if (!checkAndRecordWrite(parishId)) {
    return send(res, 429, { error: 'rate_limited' });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return send(res, 413, { error: 'payload_too_large' }); }

  let payload;
  try { payload = JSON.parse(body); }
  catch (e) { return send(res, 400, { error: 'invalid_json' }); }

  const db = openDbWrite();
  if (!db) return send(res, 500, { error: 'db_unavailable' });
  try {
    const existing = db.prepare('SELECT * FROM parish_settings WHERE parish_id = ?').get(parishId);
    if (!existing) return send(res, 404, { error: 'parish_not_found' });

    const updates = {};
    for (const field of WRITABLE_FIELDS) {
      if (!(field in payload)) continue;
      let v = payload[field];
      if (BOOL_FIELDS.has(field)) v = v ? 1 : 0;
      if (typeof v === 'string' && v.length > 2000) {
        return send(res, 400, { error: 'field_too_long', field });
      }
      updates[field] = v;
    }
    if (Object.keys(updates).length === 0 && !('variant_picks' in payload)) {
      return send(res, 200, { ok: true, changed: 0 });
    }

    const now = Date.now();
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    db.exec('BEGIN');
    try {
      if (setClause) {
        db.prepare(`UPDATE parish_settings SET ${setClause}, updated_at = ? WHERE parish_id = ?`)
          .run(...values, now, parishId);
      } else {
        db.prepare('UPDATE parish_settings SET updated_at = ? WHERE parish_id = ?').run(now, parishId);
      }

      const histStmt = db.prepare(`
        INSERT INTO parish_settings_history (parish_id, changed_at, actor, field, old_value, new_value)
        VALUES (?, ?, 'parish-admin', ?, ?, ?)
      `);
      for (const [field, v] of Object.entries(updates)) {
        if (existing[field] !== v) histStmt.run(parishId, now, field, String(existing[field] ?? ''), String(v ?? ''));
      }

      if (Array.isArray(payload.variant_picks)) {
        db.prepare('DELETE FROM parish_variant_picks WHERE parish_id = ?').run(parishId);
        const pickStmt = db.prepare(
          'INSERT INTO parish_variant_picks (parish_id, variant_key, variant_id) VALUES (?, ?, ?)'
        );
        for (const p of payload.variant_picks) {
          if (p && typeof p.variant_key === 'string' && typeof p.variant_id === 'string') {
            pickStmt.run(parishId, p.variant_key, p.variant_id);
          }
        }
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    refreshParishOverlay(parishId);
    return send(res, 200, { ok: true, changed: Object.keys(updates).length, updated_at: now });
  } catch (err) {
    return send(res, 500, { error: 'save_failed', detail: err.message });
  } finally {
    db.close();
  }
}

function handle(req, res, _ctx) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parsed = parseSlug(url.pathname);
  if (!parsed) return sendText(res, 400, 'Invalid parish slug.');

  const parishId = parsed.slug;
  // Confirm parish exists (so 401 vs 404 reflects reality).
  if (!fetchSettingsRow(parishId)) {
    return sendText(res, 404, 'No such parish.');
  }

  const auth = authenticate(req, parishId);
  if (!auth.authenticated) {
    return sendText(res, 401, 'Unauthorized. Use the link your administrator provided.');
  }

  // First-visit: just-set cookie + 302 to clean URL.
  if (auth.redirectClean) {
    res.writeHead(302, {
      Location: `/parish-admin/${parishId}${parsed.subpath || ''}`,
      'Set-Cookie': auth.setCookie,
    });
    return res.end();
  }

  // Routing.
  if (parsed.subpath === '/settings') {
    if (req.method === 'GET')  return handleGetSettings(parishId, res);
    if (req.method === 'POST') return handlePostSettings(parishId, req, res);
    return send(res, 405, { error: 'method_not_allowed' });
  }
  if (parsed.subpath === '' || parsed.subpath === '/') {
    // Serve the settings page HTML.
    let html;
    try { html = fs.readFileSync(PAGE_HTML, 'utf8'); }
    catch (_) { return sendText(res, 500, 'Settings UI is unavailable.'); }
    return sendHtml(res, 200, html);
  }
  return sendText(res, 404, 'Not found.');
}

module.exports = handle;
