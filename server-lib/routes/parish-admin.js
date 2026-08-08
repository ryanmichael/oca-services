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
const { slugify } = require('../parishes/patron-resolver');
const {
  loadRegistry,
  getRubricPicks,
  setRubricPick,
  coerce,
} = require('../parishes/rubric-registry');
const { loadPracticeLibrary } = require('../practice/library');
const { loadVariantLibrary }  = require('../variants');
const { readPracticePicks }   = require('../parishes');

const ROOT       = path.resolve(__dirname, '..', '..');
const PAGE_HTML  = path.join(ROOT, 'public', 'parish-admin.html');

// Identity/clergy/patron fields — typed columns, not registry-driven.
const NON_RUBRIC_WRITABLE = [
  'name', 'city',
  'primate_name', 'ruling_hierarch_name',
  'primate_short', 'ruling_hierarch_short',
  'patron_natural_key', 'patron_title',
];

// Subset of parish_settings columns clients may write. Derived from the
// rubric registry's dbColumn entries plus the identity/clergy fields above.
function writableFields() {
  const reg = loadRegistry();
  const rubricCols = Object.values(reg.rubrics).map(d => d.dbColumn);
  return [...NON_RUBRIC_WRITABLE, ...rubricCols];
}

function boolFields() {
  const reg = loadRegistry();
  const out = new Set();
  for (const def of Object.values(reg.rubrics)) {
    if (def.type === 'boolean') out.add(def.dbColumn);
  }
  return out;
}

// Map dbColumn → rubric id, for the dual-write path during the registry
// bake-in period. Once the typed columns are dropped, dual-write goes away.
function dbColumnToRubricId() {
  const reg = loadRegistry();
  const out = {};
  for (const [id, def] of Object.entries(reg.rubrics)) out[def.dbColumn] = id;
  return out;
}

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
    const rubricPicks = getRubricPicks(db, parishId);
    const practicePicks = readPracticePicks(db, parishId);
    return { row, picks, rubricPicks, practicePicks };
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
    primate_name:          data.row.primate_name,
    ruling_hierarch_name:  data.row.ruling_hierarch_name,
    primate_short:         data.row.primate_short,
    ruling_hierarch_short: data.row.ruling_hierarch_short,
    patron_natural_key:   data.row.patron_natural_key,
    patron_title:         data.row.patron_title,
    rubric_confess_first:                !!data.row.rubric_confess_first,
    rubric_omit_pre_trisagion_litany:    !!data.row.rubric_omit_pre_trisagion_litany,
    rubric_include_lesser_saints:        !!data.row.rubric_include_lesser_saints,
    rubric_include_second_gospel:        !!data.row.rubric_include_second_gospel,
    rubric_include_second_koinonikon:    !!data.row.rubric_include_second_koinonikon,
    rubric_omit_catechumens_seasons:     data.row.rubric_omit_catechumens_seasons || '',
    rubric_paschal_communion_year_round: !!data.row.rubric_paschal_communion_year_round,
    rubric_beatitudes_reader_led:        !!data.row.rubric_beatitudes_reader_led,
    rubric_faithful_litany_2_long:       !!data.row.rubric_faithful_litany_2_long,
    variant_picks:  data.picks,
    practice_picks: data.practicePicks,
    rubric_picks:   data.rubricPicks,
    updated_at: data.row.updated_at,
  });
}

function handleGetRegistry(res) {
  return send(res, 200, loadRegistry());
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

    const WRITABLE_FIELDS = writableFields();
    const BOOL_FIELDS     = boolFields();
    const COL_TO_RUBRIC   = dbColumnToRubricId();

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
    if (Object.keys(updates).length === 0
        && !('variant_picks' in payload) && !('practice_picks' in payload)
        && !('rubric_picks' in payload)) {
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

      // Dual-write to parish_rubrics for every typed rubric column we just
      // updated. Temporary safety net while the registry path bakes in;
      // remove once the typed columns are dropped (separate PR).
      for (const [field, v] of Object.entries(updates)) {
        const rubricId = COL_TO_RUBRIC[field];
        if (!rubricId) continue;
        setRubricPick(db, parishId, rubricId, v);
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
      // Registry-only rubrics — those with no typed column on parish_settings.
      // The column-backed ones still travel as `rubric_*` fields above and are
      // dual-written; these have nowhere else to live, so without this path they
      // are settable only by hand in the DB. Three already existed unsettable
      // (hoursPrecedeService, licNoLeadingRepeat, gloryAfterLittleLitany).
      if (Array.isArray(payload.rubric_picks)) {
        const reg = loadRegistry().rubrics || {};
        for (const rp of payload.rubric_picks) {
          if (!rp || typeof rp.rubric_id !== 'string') continue;
          const def = reg[rp.rubric_id];
          if (!def || def.dbColumn) continue;   // unknown, or column-backed
          setRubricPick(db, parishId, rp.rubric_id, rp.value);
        }
      }

      if (Array.isArray(payload.practice_picks)) {
        db.prepare('DELETE FROM parish_practice_picks WHERE parish_id = ?').run(parishId);
        const ppStmt = db.prepare(
          'INSERT INTO parish_practice_picks (parish_id, practice_key, preset_id) VALUES (?, ?, ?)'
        );
        for (const p of payload.practice_picks) {
          if (p && typeof p.practice_key === 'string' && typeof p.preset_id === 'string') {
            ppStmt.run(parishId, p.practice_key, p.preset_id);
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

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function handleVariantsList(url, res) {
  const key = (url.searchParams.get('key') || '').trim();
  if (!key) return send(res, 400, { error: 'missing_key' });
  const { loadVariantLibrary } = require('../variants');
  const reg = loadVariantLibrary();
  const entry = reg[key];
  if (!entry) return send(res, 404, { error: 'unknown_key' });
  // Return only id/label/deprecated — the value payload can be large and
  // is irrelevant to the picker.
  const variants = entry.all
    .filter(v => !v.deprecated)
    .map(v => ({ id: v.id, label: v.label }));
  return send(res, 200, { key, target: entry.target, variants });
}

function handlePatronSearch(url, res) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return send(res, 200, { results: [] });

  const db = openDb();
  if (!db) return send(res, 500, { error: 'db_unavailable' });
  try {
    const rows = db.prepare(`
      SELECT id, month, day, title FROM commemorations
      WHERE title LIKE ? COLLATE NOCASE
      ORDER BY month, day, length(title)
      LIMIT 10
    `).all(`%${q}%`);

    const results = rows.map(r => {
      // Decode common HTML entities the title field can contain (e.g. &ldquo;)
      const clean = String(r.title)
        .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
        .replace(/&lsquo;/g, '‘').replace(/&rsquo;/g, '’')
        .replace(/&aelig;/g, 'æ').replace(/&AElig;/g, 'Æ')
        .replace(/&eacute;/g, 'é').replace(/&Eacute;/g, 'É')
        .replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
        .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
        .replace(/&amp;/g, '&');
      const mm = String(r.month).padStart(2, '0');
      const dd = String(r.day).padStart(2, '0');
      return {
        naturalKey: `${mm}-${dd}/${slugify(clean)}`,
        title:      clean,
        feastLabel: `${MONTH_NAMES[r.month]} ${r.day}`,
      };
    });
    return send(res, 200, { results });
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
  if (parsed.subpath === '/patron-search') {
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    return handlePatronSearch(url, res);
  }
  if (parsed.subpath === '/variants') {
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
    return handleVariantsList(url, res);
  }
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

function serveRegistry(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  return handleGetRegistry(res);
}

/** The pick catalog the settings page renders its dropdowns from.
 *
 *  Both libraries in one payload, each entry carrying the service it belongs to
 *  so the page can slot it under the right tab. This exists so the UI stops
 *  drifting from the data: before it, dropdowns were hand-written HTML and only
 *  three of five variant keys had one — Tyler's trilingual Trisagion was live in
 *  production and invisible in their own settings page. Adding a library file
 *  now adds its control automatically.
 *
 *  Deprecated options are included but flagged, so a parish already pinned to
 *  one keeps seeing its current choice rather than a blank select. */
function servePickLibrary(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });

  const shape = (registry) =>
    Object.values(registry)
      // Drop keys with nothing selectable — every option deprecated. Keeps the
      // superseded `typical-antiphon-1` text variant (short-4-verse, retired by
      // c95da45) out of the page now that the abridgement is a practice preset.
      .filter(e => e.target && e.all.some(o => !o.deprecated))
      .map(e => ({
        key:     e.key,
        label:   e.label || e.key,
        service: e.target.service,
        options: e.all.map(o => ({
          id:         o.id,
          label:      o.label,
          deprecated: !!o.deprecated,
        })),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

  try {
    return send(res, 200, {
      variants: shape(loadVariantLibrary()),
      practice: shape(loadPracticeLibrary()),
    });
  } catch (err) {
    return send(res, 500, { error: 'library_load_failed', detail: err.message });
  }
}

module.exports = handle;
module.exports.serveRegistry    = serveRegistry;
module.exports.servePickLibrary = servePickLibrary;
