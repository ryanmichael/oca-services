/**
 * OCA Service Browser
 *
 * A minimal HTTP server for browsing assembled Vespers services.
 * Uses calendar-rules.js + assembler.js + renderer.js to render
 * a full service (fixed + variable texts) for any date.
 *
 * For regular Saturdays in ordinary time, services are generated
 * automatically. For Lenten/special dates, hand-authored calendar
 * entries are used if available.
 *
 * Usage:
 *   node server.js          — starts on http://localhost:3000
 *   node server.js --port 8080
 */

'use strict';

const http = require('node:http');
const fs   = require('fs');
const path = require('path');

const { assembleVespers, assembleLiturgy, resolveSource } = require('./assembler');
const { generateCalendarEntry, getLiturgicalSeason, getDayOfWeek, getLiturgicalKey,
        getLiturgyVariant, getTone, getTrisagionSubstitution, isLiturgyServed } = require('./calendar-rules');
const { renderVespers }                          = require('./renderer');

// ─── Config ───────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT    = portIdx !== -1 ? parseInt(args[portIdx + 1], 10)
              : process.env.PORT ? parseInt(process.env.PORT, 10)
              : 3000;

// ─── Data loading ─────────────────────────────────────────────────────────────

function loadJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relPath), 'utf8'));
}

function loadSources() {
  const octoechos  = loadJSON('variable-sources/octoechos.json');
  const prokeimena = loadJSON('variable-sources/prokeimena.json');

  // Load all available menaion files
  const menaion = {};
  const menaionDir = path.join(__dirname, 'variable-sources', 'menaion');
  if (fs.existsSync(menaionDir)) {
    for (const file of fs.readdirSync(menaionDir).filter(f => f.endsWith('.json'))) {
      const key  = file.replace('.json', '');         // e.g. "march-07"
      const data = loadJSON(`variable-sources/menaion/${file}`);
      menaion[key] = data.vespers || data;
    }
  }

  // Load all available triodion files, keyed by each file's "key" field.
  // e.g. lent-soul-saturday-2.json has key "lent.soulSaturday2"
  //   → triodion.lent.soulSaturday2 = raw.vespers
  const triodion = {};
  const triodionDir = path.join(__dirname, 'variable-sources', 'triodion');
  if (fs.existsSync(triodionDir)) {
    for (const file of fs.readdirSync(triodionDir).filter(f => f.endsWith('.json'))) {
      const raw = loadJSON(`variable-sources/triodion/${file}`);
      const key = raw.key;
      if (!key) { console.warn(`triodion/${file}: missing "key" field, skipping`); continue; }
      // Navigate/create the nested path: "lent.soulSaturday2" → triodion.lent.soulSaturday2
      const parts = key.split('.');
      let cur = triodion;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] ??= {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = raw.vespers || raw;
    }
  }

  // 'db' source is populated in Step 2; include empty object now so the
  // assembler doesn't warn on unresolved db: references in generated entries.
  return { octoechos, prokeimena, menaion, triodion, db: {} };
}

/**
 * Returns a calendar entry for the date, or null if unavailable.
 * Priority:
 *   1. calendar-rules.js auto-generation (for supported seasons)
 *   2. Hand-authored calendar JSON (for Lenten/special dates)
 *
 * When both exist, the auto-generated entry is used as the base (vespers),
 * and any `liturgy` field from the hand-authored file is merged in.
 */
function getCalendarEntry(dateStr) {
  const calPath     = path.join(__dirname, 'variable-sources', 'calendar', `${dateStr}.json`);
  const handAuthored = fs.existsSync(calPath) ? loadJSON(`variable-sources/calendar/${dateStr}.json`) : null;

  const generated = generateCalendarEntry(dateStr);

  if (generated && handAuthored) {
    // Merge: auto-generated base + hand-authored liturgy (and commemorations if present)
    if (handAuthored.liturgy)         generated.liturgy         = handAuthored.liturgy;
    if (handAuthored.commemorations)  generated.commemorations  = handAuthored.commemorations;
    return generated;
  }

  return generated ?? handAuthored;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ─── Home page ────────────────────────────────────────────────────────────────

const HOME_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    background: #f9f6f2;
    color: #1a1a1a;
    margin: 0;
    padding: 40px 20px;
    min-height: 100vh;
  }
  .layout {
    max-width: 860px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    align-items: start;
  }
  @media (max-width: 640px) { .layout { grid-template-columns: 1fr; } }
  .card {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 36px 40px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  }
  h1 {
    font-size: 18pt;
    font-weight: bold;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #8b1a1a;
    margin: 0 0 6px;
    text-align: center;
  }
  h2 {
    font-size: 11pt;
    font-weight: bold;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #555;
    margin: 0 0 20px;
    text-align: center;
    border-bottom: 1px solid #e8e0d8;
    padding-bottom: 12px;
  }
  .subtitle {
    text-align: center;
    color: #666;
    font-size: 10pt;
    margin: 0 0 28px;
  }
  label {
    display: block;
    font-size: 9.5pt;
    font-weight: bold;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 5px;
  }
  input[type=date], select {
    width: 100%;
    font-family: inherit;
    font-size: 12pt;
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    color: #1a1a1a;
    margin-bottom: 16px;
    cursor: pointer;
  }
  .pronoun-group {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
  }
  .pronoun-group label {
    flex: 1;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11pt;
    font-weight: normal;
    cursor: pointer;
    margin: 0;
  }
  .pronoun-group input { margin-right: 6px; }
  button {
    width: 100%;
    padding: 11px;
    background: #8b1a1a;
    color: #fff;
    font-family: inherit;
    font-size: 11.5pt;
    font-weight: bold;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover { background: #a02020; }
  .note {
    font-size: 9pt;
    color: #888;
    margin-top: 16px;
    font-style: italic;
    text-align: center;
  }
  .date-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 480px;
    overflow-y: auto;
  }
  .date-list li { border-bottom: 1px solid #f0ebe4; }
  .date-list li:last-child { border-bottom: none; }
  .date-list a {
    display: block;
    padding: 8px 4px;
    color: #1a1a1a;
    text-decoration: none;
    font-size: 11pt;
  }
  .date-list a:hover { background: #faf7f4; color: #8b1a1a; }
  .date-list .badge {
    float: right;
    font-size: 8.5pt;
    color: #999;
    font-style: italic;
  }
`;

function renderHomePage(collectedDates) {
  // Build list of collected dates (from DB, grouped)
  const byDate = {};
  for (const { date, pronoun } of collectedDates) {
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(pronoun);
  }

  const listItems = Object.keys(byDate).sort().map(d => {
    const p = byDate[d].includes('tt') ? 'tt' : byDate[d][0];
    return `<li><a href="/service?date=${d}&pronoun=${p}">${formatDate(d)} <span class="badge">collected</span></a></li>`;
  }).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OCA Service Texts</title>
  <style>${HOME_CSS}</style>
</head>
<body>
  <div class="layout">

    <div class="card">
      <h1>Great Vespers</h1>
      <p class="subtitle">Enter any date to view the assembled service</p>

      <form method="GET" action="/service">
        <label for="date-input">Date</label>
        <input type="date" id="date-input" name="date" value="2026-09-26" required />

        <label>Pronouns</label>
        <div class="pronoun-group">
          <label><input type="radio" name="pronoun" value="tt" checked /> Thee / Thy</label>
          <label><input type="radio" name="pronoun" value="yy" /> You / Your</label>
        </div>

        <button type="submit">View Service</button>
      </form>

      <p class="note">
        Regular Saturdays in ordinary time are generated automatically.<br />
        Other dates require a hand-authored calendar file.
      </p>
    </div>

    <div class="card">
      <h2>Collected Dates</h2>
      <ul class="date-list">
        ${listItems || '<li style="padding:8px;color:#999;">No dates collected yet.</li>'}
      </ul>
    </div>

  </div>
</body>
</html>`;
}

// ─── Error / info pages ───────────────────────────────────────────────────────

/**
 * Converts a raw {source, key} warning from assembler.js into a human-readable message.
 * Returns null if the warning is minor/expected and shouldn't be shown.
 */
function formatAssemblyWarning(source, key) {
  const k = key || '';

  if (source === 'octoechos') {
    // Extract tone number
    const toneMatch = k.match(/^tone(\d)/);
    const toneNum = toneMatch ? toneMatch[1] : '?';

    if (k.includes('lordICall.martyrs')) {
      return `Martyrs stichera at Lord, I Have Cried (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('lordICall.departedGlory')) {
      return `Doxastichon "For the Departed" at Lord, I Have Cried (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('lordICall.resurrectional')) {
      return `Resurrectional stichera at Lord, I Have Cried (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('dogmatikon')) {
      return `Dogmatikon (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('aposticha')) {
      return `Aposticha stichera (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('troparion')) {
      return `Resurrectional troparion (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('dismissalTheotokion')) {
      return `Dismissal theotokion (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    return `Octoechos Tone ${toneNum} data is incomplete (${k}).`;
  }

  if (source === 'triodion') {
    if (k.includes('lordICall')) return `Lord, I Have Cried stichera from the Triodion are missing (${k}).`;
    if (k.includes('aposticha')) return `Aposticha stichera from the Triodion are missing (${k}).`;
    if (k.includes('troparia')) return `Troparia from the Triodion are missing (${k}).`;
    return `Triodion texts are missing (${k}).`;
  }

  if (source === 'menaion') {
    if (k.includes('lordICall')) return `Menaion Lord, I Have Cried stichera are not available for this date.`;
    if (k.includes('troparion')) return `Menaion troparion is not available for this date.`;
    return `Menaion texts are not available for this date (${k}).`;
  }

  if (source === 'prokeimena') {
    return `Evening prokeimenon text is missing (${k}).`;
  }

  // 'db' source is the SQLite Lenten/Pentecostarion DB — suppress from user-facing banners
  // (the server handles these separately via its own coverage checks)
  if (source === 'db') return null;

  return `Missing liturgical text: ${source} → ${k}`;
}

function renderErrorPage(message, detail = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Error — OCA Service Texts</title>
  <style>
    body { font-family: Georgia, serif; padding: 60px; color: #1a1a1a; max-width: 640px; margin: 0 auto; }
    h1 { color: #8b1a1a; font-size: 16pt; }
    p { font-size: 12pt; line-height: 1.6; }
    a { color: #8b1a1a; }
    .detail { font-size: 10.5pt; color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h1>Service Unavailable</h1>
  <p>${escHtml(message)}</p>
  ${detail ? `<p class="detail">${escHtml(detail)}</p>` : ''}
  <p><a href="/">← Back</a></p>
</body>
</html>`;
}

// ─── Menaion DB helpers ───────────────────────────────────────────────────────

/**
 * Returns the primary commemoration for a day — the first one that has a
 * troparion, which corresponds to the highest-ranking saint on the OCA page
 * (they are listed in descending rank order).
 */
function getMenaionPrimary(month, day) {
  const comms = getMenaionDay(month, day);
  if (!comms) return null;
  return comms.find(c => c.troparia.some(t => t.type === 'troparion')) ?? null;
}

/**
 * Returns all Lord I Call stichera for a given month/day from oca.db.
 * Shape: [{ commemoration, stichera: [{ order, tone, label, text }] }]
 */
function getSticheraDay(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const rows = db.prepare(`
      SELECT c.id, c.title, c.rank,
             s."order", s.section, s.tone, s.label, s.text
      FROM stichera s
      JOIN commemorations c ON c.id = s.commemoration_id
      WHERE c.month = ? AND c.day = ?
      ORDER BY c.id, s.section, s."order"
    `).all(month, day);
    if (rows.length === 0) return null;
    const byComm = {};
    for (const row of rows) {
      if (!byComm[row.id]) {
        byComm[row.id] = { id: row.id, title: row.title, rank: row.rank, stichera: [] };
      }
      byComm[row.id].stichera.push({
        section: row.section,
        order:   row.order,
        tone:    row.tone,
        label:   row.label,
        text:    row.text,
      });
    }
    return Object.values(byComm);
  } catch (err) {
    console.error('getSticheraDay error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Returns ranked Menaion data for service assembly.
 * Single DB call combining commemorations + troparia + stichera.
 *
 * Returns:
 *   {
 *     principal:    { id, title, tone, rank, troparia, stichera, hasTroparion, hasStichera }
 *     sticheraComm: same shape | null   — the commemoration that owns stichera
 *     notable:      [...same shape]     — all comms with troparia, sorted by id (= OCA priority)
 *     all:          [...same shape]     — all comms for the day
 *   }
 *
 * principal = stichera-saint (if any, and it has a troparion), else first notable by id.
 * This ensures the saint OCA published stichera for is treated as the primary, even
 * when a moveable feast (Triodion/Pentecostarion) sits at a lower id.
 */
function getMenaionRanked(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;

    const comms = db.prepare(`
      SELECT id, title, rank, tone, saint_type FROM commemorations
      WHERE month = ? AND day = ? ORDER BY id
    `).all(month, day);
    if (comms.length === 0) return null;

    const ids          = comms.map(c => c.id);
    const placeholders = ids.map(() => '?').join(',');

    const tropRows = db.prepare(
      `SELECT commemoration_id, type, tone, text, pronoun
       FROM troparia WHERE commemoration_id IN (${placeholders})`
    ).all(...ids);

    const stRows = db.prepare(
      `SELECT commemoration_id, "order", section, tone, label, text, source AS dbSource
       FROM stichera WHERE commemoration_id IN (${placeholders})
       ORDER BY commemoration_id, section, "order"`
    ).all(...ids);

    const tropariaMap  = {};
    const sticheraMap  = {};
    for (const t of tropRows) {
      (tropariaMap[t.commemoration_id] ??= []).push(t);
    }
    for (const s of stRows) {
      (sticheraMap[s.commemoration_id] ??= []).push({
        order: s.order, section: s.section, tone: s.tone, label: s.label, text: s.text,
        dbSource: s.dbSource,
      });
    }

    const enriched = comms.map(c => ({
      id:           c.id,
      title:        c.title,
      rank:         c.rank,
      tone:         c.tone,
      saint_type:   c.saint_type,
      troparia:     tropariaMap[c.id] ?? [],
      stichera:     sticheraMap[c.id] ?? [],
      hasTroparion: (tropariaMap[c.id] ?? []).some(t => t.type === 'troparion'),
      hasStichera:  !!(sticheraMap[c.id]?.length),
    }));

    const sticheraSaint = enriched.find(c => c.hasStichera && c.hasTroparion)
                       ?? enriched.find(c => c.hasStichera);
    const firstNotable  = enriched.find(c => c.hasTroparion);
    const principal     = sticheraSaint ?? firstNotable ?? enriched[0] ?? null;
    const sticheraComm  = enriched.find(c => c.hasStichera) ?? null;
    const notable       = enriched.filter(c => c.hasTroparion);

    return { principal, sticheraComm, notable, all: enriched };
  } catch (err) {
    console.error('getMenaionRanked error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

// ─── General Menaion fallback ────────────────────────────────────────────────

/**
 * Extracts a short name from a commemoration title for (name) substitution.
 * "Hieromartyr Silvanus of Gaza" → "Silvanus"
 * "Venerable Seraphim, Wonderworker of Sarov" → "Seraphim"
 */
function extractShortName(title) {
  let name = title
    // Strip rank prefixes
    .replace(/^(Holy,?\s*Glorious\s+)?/i, '')
    .replace(/^(Saint|Venerable|Hieromartyr|Hieromartyrs?|Martyr|Martyrs|Great[- ]Martyr|New Martyr|Virgin Martyr|Maiden Martyr|Monastic Martyr|Nun Martyr|Prophet|Apostle|Apostles|Blessed|Righteous)\s+/i, '')
    .replace(/^(Holy|Glorious|Great|New)\s+/i, '');
  // Strip "of Location", "at Location", "in Location", "near Location" suffixes
  name = name.replace(/\s+(?:of|at|in|near)\s+.*$/i, '');
  // Strip parenthetical and comma suffixes
  name = name.replace(/\s*\(.*$/, '');
  name = name.replace(/,\s+.*$/, '');
  return name.trim() || title;
}

/**
 * Fallback mapping for saint types that don't have their own General Menaion PDF
 * to a type that does.
 */
const GENERAL_MENAION_FALLBACK = {
  'hieromartyrs': 'hieromartyr',   // plural → singular as fallback
  'hierarchs':    'hierarch',
  'monastics':    'monastic',
  'monasticMartyrs': 'monasticMartyr',
  'maidenMartyrs':   'maidenMartyr',
  'nuns':            'nun',
  'apostles':        'apostle',
};

/**
 * Fetches General Menaion texts for a given saint type, substituting
 * the (name) placeholder with the actual saint's name.
 *
 * Returns stichera-compatible rows or null if none found.
 */
function getGeneralMenaionTexts(saintType, title) {
  let db;
  try {
    db = openDb();
    if (!db) return null;

    // Try exact type, then fallback
    const types = [saintType];
    if (GENERAL_MENAION_FALLBACK[saintType]) types.push(GENERAL_MENAION_FALLBACK[saintType]);

    for (const type of types) {
      const rows = db.prepare(`
        SELECT saint_type, section, "order", tone, label, verse, text
        FROM general_menaion WHERE saint_type = ?
        ORDER BY section, "order"
      `).all(type);

      if (rows.length > 0) {
        const shortName = extractShortName(title);
        const sub = t => t.replace(/\(name(?:\s+of\s+the\s+event\/Icon)?\)/gi, shortName);
        return rows.map(r => ({
          order:    r.order,
          section:  r.section,
          tone:     r.tone,
          label:    r.label,
          text:     sub(r.text),
          verse:    r.verse ? sub(r.verse) : null,
          dbSource: 'stSergius-general',
        }));
      }
    }
    return null;
  } catch (err) {
    console.error('getGeneralMenaionTexts error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Lightweight version for the /api/days list — returns only titles.
 * Avoids loading full troparia/stichera text for every day in the view.
 *
 * Returns: { principal: string, commemorations: string[] } | null
 */
function getMenaionDayList(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const rows = db.prepare(`
      SELECT c.title
      FROM commemorations c
      JOIN troparia t ON t.commemoration_id = c.id
      WHERE c.month = ? AND c.day = ? AND t.type = 'troparion'
      GROUP BY c.id
      ORDER BY c.id
    `).all(month, day);
    if (rows.length === 0) return null;
    return { principal: rows[0].title, commemorations: rows.map(r => r.title) };
  } catch { return null; }
  finally { db?.close(); }
}

/**
 * Returns all commemorations + troparia for a given month/day from oca.db.
 * Shape: [{ id, title, rank, tone, troparia: [{ type, tone, text }] }, …]
 */
function getMenaionDay(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const comms = db.prepare(`
      SELECT id, title, rank, tone FROM commemorations
      WHERE month = ? AND day = ? ORDER BY id
    `).all(month, day);
    if (comms.length === 0) return null;
    const getTroparia = db.prepare(`
      SELECT type, tone, text, pronoun FROM troparia
      WHERE commemoration_id = ? ORDER BY type
    `);
    return comms.map(c => ({
      id:       c.id,
      title:    c.title,
      rank:     c.rank,
      tone:     c.tone,
      troparia: getTroparia.all(c.id),
    }));
  } catch (err) {
    console.error('getMenaionDay error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

// ─── DB helpers (for home page date list) ────────────────────────────────────

// ─── DB helpers ───────────────────────────────────────────────────────────────

const SECTION_LABELS = {
  lordICall : 'Lord, I Have Cried',
  aposticha : 'Aposticha',
  troparia  : 'Troparia',
  litya     : 'Litya',
  epistle   : 'Epistle',
  gospel    : 'Gospel',
};
const SECTION_ORDER = ['lordICall', 'aposticha', 'troparia', 'litya', 'epistle', 'gospel'];

function openDb() {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(__dirname, 'storage', 'oca.db');
  if (!fs.existsSync(dbPath)) return null;
  return new DatabaseSync(dbPath, { readonly: true });
}

function openDbWrite() {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(__dirname, 'storage', 'oca.db');
  if (!fs.existsSync(dbPath)) return null;
  return new DatabaseSync(dbPath);
}

// ─── Orthocal API cache ───────────────────────────────────────────────────────

function ensureOrthocalCacheTable() {
  try {
    const db = openDbWrite();
    if (!db) return;
    db.exec(`CREATE TABLE IF NOT EXISTS orthocal_cache (
      date       TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`);
  } catch (err) {
    console.error('Failed to create orthocal_cache table:', err.message);
  }
}

function getOrthocalCache(dateStr) {
  try {
    const db = openDb();
    if (!db) return null;
    const row = db.prepare('SELECT data FROM orthocal_cache WHERE date = ?').get(dateStr);
    return row ? JSON.parse(row.data) : null;
  } catch { return null; }
}

function setOrthocalCache(dateStr, data) {
  try {
    const db = openDbWrite();
    if (!db) return;
    db.prepare(
      'INSERT OR REPLACE INTO orthocal_cache (date, data, fetched_at) VALUES (?, ?, ?)'
    ).run(dateStr, JSON.stringify(data), new Date().toISOString());
  } catch (err) {
    console.error('Orthocal cache write error:', err.message);
  }
}

async function fetchOrthocalDay(dateStr) {
  const cached = getOrthocalCache(dateStr);
  if (cached) return cached;

  const [year, month, day] = dateStr.split('-').map(Number);
  const url = `https://orthocal.info/api/gregorian/${year}/${month}/${day}/`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Orthocal API ${res.status} for ${dateStr}`);
  const data = await res.json();

  setOrthocalCache(dateStr, data);
  return data;
}

/**
 * Builds a liturgy spec object from orthocal.info API data.
 * Used when no hand-authored liturgy key exists for the date.
 *
 * Provides: variant, entrance hymn, epistle, gospel, megalynarion,
 *           communion hymn, dismissal, resurrectional troparion (if in Octoechos).
 * Deferred:  prokeimenon, alleluia, beatitudes troparia, kontakia.
 */
function buildLiturgyFromOrthocal(orthocalData, dateStr, srcs) {
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const date    = new Date(Date.UTC(yr, mo - 1, dy));
  const dow     = getDayOfWeek(date);
  const tone    = getTone(date);
  const variant = getLiturgyVariant(date);
  const isBasil  = variant === 'basil';
  const isSunday = dow === 'sunday';
  const tk       = `tone${tone}`;

  // Epistle and Gospel from the API readings array
  const readings   = orthocalData.readings || [];
  const epistleR   = readings.find(r => r.source === 'Epistle');
  const gospelR    = readings.find(r => r.source === 'Gospel');

  // Resurrectional troparion from Octoechos (same text used at both Vespers and Liturgy).
  // Octoechos stores troparion as an object { tone, label, text }.
  const troparionRaw  = srcs.octoechos?.[tk]?.saturday?.vespers?.troparion;
  const troparionText = typeof troparionRaw === 'object' ? troparionRaw?.text : troparionRaw;
  const troparia = (isSunday && troparionText)
    ? [{ tone, rubric: `Troparion of the Resurrection, Tone ${tone}:`, text: troparionText }]
    : [];

  return {
    variant,
    beatitudes: { troparia: [] },
    entranceHymn: {
      text: isSunday
        ? 'Come, let us worship and fall down before Christ. O Son of God, who art risen from the dead, save us who sing to Thee: Alleluia!'
        : 'Come, let us worship and fall down before Christ. O Son of God, who art wondrous in Thy saints, save us who sing to Thee: Alleluia!',
    },
    troparia,
    kontakia: [],
    trisagion: { substitution: getTrisagionSubstitution(date) },
    prokeimenon: null,
    epistle:  epistleR ? { book: epistleR.book, display: epistleR.display } : null,
    alleluia: null,
    gospel:   gospelR ? { book: gospelR.book, display: gospelR.display } : null,
    megalynarion: isBasil ? 'basil-liturgy' : null,
    communionHymn: isSunday
      ? { text: 'Praise the Lord from the heavens, praise Him in the highest. Alleluia.' }
      : null,
    dismissal: {
      opening: isSunday ? 'sunday' : 'weekday',
      saints:  (orthocalData.saints || []).slice(0, 3),
    },
  };
}

function getCollectedDates() {
  let db;
  try {
    db = openDb();
    if (!db) return [];
    return db.prepare(`
      SELECT DISTINCT date, pronoun FROM source_files
      WHERE date IS NOT NULL ORDER BY date, pronoun
    `).all();
  } catch { return []; }
  finally { db?.close(); }
}

// ─── DB source resolver ───────────────────────────────────────────────────────

/**
 * Builds a nested object from a dot-notation path so that deepGet() in the
 * assembler can navigate it.  e.g.:
 *   buildNestedPath('lent.week.2.thursday', { vespers: {...} })
 *   → { lent: { week: { '2': { thursday: { vespers: {...} } } } } }
 */
function buildNestedPath(dotPath, value) {
  const parts = dotPath.split('.');
  const root  = {};
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

/**
 * Transforms a flat array of DB block rows for one section into the nested
 * object shape the assembler expects via deepGet():
 *
 *   { text, tone, label, hymns: [{text,tone,label}, …], glory: {…}, now: {…} }
 *
 * Rules:
 *   - Hymns with position='glory' or position='now' go into glory/now slots.
 *   - For lordICall only: the very first hymn (before any verse block) is the
 *     sung refrain already provided by fixed texts — skip it.
 *   - All other hymns are collected into hymns[] in document order.
 *   - text/tone/label are convenience aliases for hymns[0] (idiomelon pattern).
 */
function transformSectionBlocks(section, blocks) {
  const hymns = [];
  let glory      = null;
  let now        = null;
  let seenVerse  = false;

  for (const b of blocks) {
    if (b.type === 'verse')        { seenVerse = true; continue; }
    if (b.type === 'glory_marker') { continue; }
    if (b.type === 'now_marker')   { continue; }
    if (b.type !== 'hymn')         { continue; }

    if (b.position === 'glory') { glory = { text: b.text, tone: b.tone, label: b.label }; continue; }
    if (b.position === 'now')   { now   = { text: b.text, tone: b.tone, label: b.label }; continue; }

    // lordICall only: skip the opening refrain (appears before any psalm verse)
    if (section === 'lordICall' && !seenVerse) continue;

    hymns.push({ text: b.text, tone: b.tone, label: b.label });
  }

  return {
    text:  hymns[0]?.text  ?? null,
    tone:  hymns[0]?.tone  ?? null,
    label: hymns[0]?.label ?? null,
    hymns,
    ...(glory ? { glory } : {}),
    ...(now   ? { now }   : {}),
  };
}

/**
 * Queries vespers blocks from the DB for a given date/pronoun and returns a
 * source object compatible with the assembler's resolveSource/deepGet system.
 *
 * When the date has a liturgical key (Lenten dates), queries by liturgical_key
 * so texts collected in any year can be used for the same liturgical position
 * in future years. Otherwise falls back to querying by calendar date.
 *
 * The returned object is nested to match the key path used in calendar entries:
 *   liturgical key  → { lent: { week: { '2': { thursday: { vespers: {…} } } } } }
 *   calendar date   → { '2026-10-03': { vespers: {…} } }
 */
function buildDbSource(date, pronoun) {
  let db;
  try {
    db = openDb();
    if (!db) return {};

    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const litKey  = getLiturgicalKey(dateObj);

    const rows = litKey
      ? db.prepare(`
          SELECT section, block_order, type, tone, label, verse_number, position, text
          FROM blocks WHERE liturgical_key = ? AND pronoun = ? AND service IN ('vespers', 'other', 'liturgy')
          ORDER BY section, block_order
        `).all(litKey, pronoun)
      : db.prepare(`
          SELECT section, block_order, type, tone, label, verse_number, position, text
          FROM blocks WHERE date = ? AND pronoun = ? AND service IN ('vespers', 'other', 'liturgy')
          ORDER BY section, block_order
        `).all(date, pronoun);

    if (rows.length === 0) return {};

    const bySection = {};
    for (const row of rows) {
      (bySection[row.section] ??= []).push(row);
    }

    const vespers = {};
    for (const [section, blocks] of Object.entries(bySection)) {
      vespers[section] = transformSectionBlocks(section, blocks);
    }

    const topKey = litKey || date;
    return buildNestedPath(topKey, { vespers });
  } catch (err) {
    console.error('buildDbSource error:', err.message);
    return {};
  } finally {
    db?.close();
  }
}

function getDbBlocks(date, pronoun, service = 'vespers') {
  let db;
  try {
    db = openDb();
    if (!db) return [];
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const litKey  = getLiturgicalKey(dateObj);
    if (litKey) {
      return db.prepare(`
        SELECT section, block_order, type, tone, label, verse_number, position, attribution, text
        FROM blocks WHERE liturgical_key = ? AND pronoun = ? AND service = ?
        ORDER BY section, block_order
      `).all(litKey, pronoun, service);
    }
    return db.prepare(`
      SELECT section, block_order, type, tone, label, verse_number, position, attribution, text
      FROM blocks WHERE date = ? AND pronoun = ? AND service = ?
      ORDER BY section, block_order
    `).all(date, pronoun, service);
  } catch { return []; }
  finally { db?.close(); }
}

function mapDbBlocks(dbBlocks) {
  const sectionRank = k => { const i = SECTION_ORDER.indexOf(k); return i === -1 ? 99 : i; };
  const sorted = [...dbBlocks].sort((a, b) =>
    sectionRank(a.section) - sectionRank(b.section) || a.block_order - b.block_order
  );
  return sorted.map((b, i) => {
    const section = SECTION_LABELS[b.section] || b.section;
    let type = b.type, text = b.text || '', speaker = null;
    if (b.type === 'glory_marker') { type = 'doxology'; text = 'Glory to the Father, and to the Son, and to the Holy Spirit:'; }
    else if (b.type === 'now_marker') { type = 'doxology'; text = 'Now and ever, and unto ages of ages. Amen.'; }
    else if (b.type === 'hymn') speaker = 'choir';
    return { id: `db-${i}`, section, type, speaker, text, tone: b.tone || null, label: b.label || null };
  });
}

// ─── assembleForDate helper ───────────────────────────────────────────────────

/**
 * Core assembly function. Returns { blocks, calendarEntry, serviceTitle, tone }
 * or null if no calendar entry exists for the date.
 * Throws on assembly error.
 */
function assembleForDate(date, pronoun, entryOverride) {
  const calendarEntry = entryOverride || getCalendarEntry(date);
  if (!calendarEntry) return null;

  const dbSource = buildDbSource(date, pronoun);

  let menaionOverride = sources.menaion;
  const injectSeasons = ['ordinaryTime', 'pentecostarion', 'preLenten'];
  const isSaturdayInjection = calendarEntry.dayOfWeek === 'saturday';
  const isWeekdayInjection  = !isSaturdayInjection;
  // Skip Menaion injection when the service already has complete Triodion content
  // (lordICall slots are DB-sourced, meaning a special observance like Meatfare Saturday)
  const hasTriodionContent = calendarEntry.vespers?.lordICall?.slots?.some(s => s.source === 'db');
  if (calendarEntry._meta?.generated && injectSeasons.includes(calendarEntry.liturgicalContext?.season) && !hasTriodionContent) {
    const [, mm, dd] = date.split('-').map(Number);
    const ranked = getMenaionRanked(mm, dd);
    const primary = ranked?.principal ?? null;
    let sticheraData = ranked?.sticheraComm
      ? [{ id: ranked.sticheraComm.id, title: ranked.sticheraComm.title,
           rank: ranked.sticheraComm.rank, stichera: ranked.sticheraComm.stichera }]
      : null;

    // General Menaion fallback: when no day-specific stichera exist,
    // use generic texts for this saint's category
    if (!sticheraData && primary?.saint_type) {
      const gmTexts = getGeneralMenaionTexts(primary.saint_type, primary.title);
      if (gmTexts) {
        sticheraData = [{ id: primary.id, title: primary.title,
          rank: primary.rank, stichera: gmTexts }];
      }
    }

    if (primary) {
      const troparion = primary.troparia.find(t => t.type === 'troparion');
      const autoSlot  = { troparion: { text: troparion.text, tone: troparion.tone, label: primary.title } };

      // Determine provenance label for dev-mode display
      const firstDbSrc = sticheraData?.[0]?.stichera?.[0]?.dbSource;
      const menaionProvenance = firstDbSrc && firstDbSrc !== 'oca-menaion'
        ? `menaion (${firstDbSrc})`
        : 'menaion';

      const licStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'lordICall' && s.order >= 1
      ).slice(0, isSaturdayInjection ? 6 : 3) ?? [];
      const licGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'lordICall' && s.order === 0
      ) ?? null;

      if (licStichera.length > 0) {
        const lic = calendarEntry.vespers.lordICall;

        if (isSaturdayInjection) {
          // Saturday: split verses between resurrectional (Octoechos) and Menaion
          const menaionCount        = licStichera.length;
          const resurrectionalCount = 6 - menaionCount;
          const allVerses           = [6, 5, 4, 3, 2, 1];
          if (resurrectionalCount === 0) {
            lic.slots = [];
          } else {
            lic.slots[0].verses = allVerses.slice(0, resurrectionalCount);
            lic.slots[0].count  = resurrectionalCount;
          }
          lic.slots.push({
            verses: allVerses.slice(resurrectionalCount),
            count:  menaionCount,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          });
        } else {
          // Weekday: all stichera from Menaion at verses [4, 3, 2] (no resurrectional)
          const weekdayVerses = [4, 3, 2].slice(0, licStichera.length);
          lic.slots = [{
            verses: weekdayVerses,
            count:  licStichera.length,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          }];
        }

        autoSlot.lordICall = { hymns: licStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })) };

        if (licGlory) {
          lic.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.lordICall.glory`, tone: licGlory.tone, label: primary.title };
          autoSlot.lordICall.glory = { text: licGlory.text, tone: licGlory.tone, label: licGlory.label };
        }
      }

      // Inject Menaion aposticha stichera when available
      const apostStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'aposticha' && s.order >= 1
      ).slice(0, 3) ?? [];
      const apostGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'aposticha' && s.order === 0
      ) ?? null;

      if (apostStichera.length > 0 || apostGlory) {
        autoSlot.aposticha = {
          hymns: apostStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })),
        };

        const apost = calendarEntry.vespers.aposticha;
        // Replace the Octoechos idiomelon slots with Menaion stichera
        apost.slots = apostStichera.map((s, i) => ({
          position: i + 1,
          source:   'menaion', provenance: menaionProvenance,
          key:      `auto.${date}.aposticha.hymns.${i}`,
          tone:     s.tone,
          label:    primary.title,
        }));
        // Add repeatPrevious placeholders only when fewer than 3 stichera are available
        while (apost.slots.length < 3) {
          apost.slots.push({ position: apost.slots.length + 1, repeatPrevious: true });
        }

        if (apostGlory) {
          apost.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.aposticha.glory`, tone: apostGlory.tone, label: primary.title, combinesGloryNow: false };
          if (isSaturdayInjection) {
            apost.now = { source: 'octoechos', key: `tone${calendarEntry.liturgicalContext.tone}.saturday.vespers.aposticha.theotokion`, tone: calendarEntry.liturgicalContext.tone, label: 'Theotokion' };
          }
          autoSlot.aposticha.glory = { text: apostGlory.text, tone: apostGlory.tone, label: apostGlory.label };
        }
        // If no doxastichon, keep the existing combinesGloryNow theotokion from calendar entry
      }

      menaionOverride = { ...sources.menaion, auto: { [date]: autoSlot } };

      const slots    = calendarEntry.vespers.troparia.slots;
      const nowIdx   = slots.findIndex(s => s.position === 'now');
      const insertAt = nowIdx !== -1 ? nowIdx : slots.length;
      slots.splice(insertAt, 0, {
        position: 'glory',
        source:   'menaion', provenance: menaionProvenance,
        key:      `auto.${date}.troparion`,
        tone:     troparion.tone,
        label:    primary.title,
      });

      // Populate all notable saints (those with troparia, in OCA priority order)
      calendarEntry.commemorations = (ranked?.notable ?? [{ ...primary }]).map(c => ({
        title:        c.title,
        tone:         c.troparia.find(t => t.type === 'troparion')?.tone ?? c.tone,
        isPrincipal:  c.id === primary.id,
        hasStichera:  c.hasStichera,
      }));
    }
  }

  const reqSources = Object.assign({}, sources, { db: dbSource, menaion: menaionOverride });
  const blocks = assembleVespers(calendarEntry, fixedTexts, reqSources);

  if (pronoun === 'yy') {
    for (const block of blocks) {
      if (block.text) block.text = applyYouYour(block.text);
      if (block.label) block.label = applyYouYour(block.label);
    }
  }

  const serviceTitle = calendarEntry.vespers?.serviceType === 'dailyVespers'
    ? 'Daily Vespers'
    : 'Great Vespers';
  const tone = calendarEntry.vespers?.lordICall?.tone ?? calendarEntry.liturgicalContext?.tone ?? null;

  return { blocks, calendarEntry, serviceTitle, tone };
}

// ─── Pronoun substitution (Thee/Thy → You/Your) ───────────────────────────────

const YOU_YOUR_RULES = [
  // Predicate-nominative Thine first (before general Thine → Your)
  [/\bThine(?=\s+is\b)/g,       'Yours'],
  [/\bthine(?=\s+is\b)/g,       'yours'],
  // Pronouns
  [/\bThou\b/g,    'You'],     [/\bthou\b/g,    'you'],
  [/\bThee\b/g,    'You'],     [/\bthee\b/g,    'you'],
  [/\bThy\b/g,     'Your'],    [/\bthy\b/g,     'your'],
  [/\bThine\b/g,   'Your'],    [/\bthine\b/g,   'your'],
  [/\bThyself\b/g, 'Yourself'],[/\bthyself\b/g, 'yourself'],
  // Irregular verb forms
  [/\bArt\b/g,      'Are'],    [/\bart\b/g,      'are'],
  [/\bHast\b/g,     'Have'],   [/\bhast\b/g,     'have'],
  [/\bDost\b/g,     'Do'],     [/\bdost\b/g,     'do'],
  [/\bWilt\b/g,     'Will'],   [/\bwilt\b/g,     'will'],
  [/\bWast\b/g,     'Were'],   [/\bwast\b/g,     'were'],
  [/\bDidst\b/g,    'Did'],    [/\bdidst\b/g,    'did'],
  [/\bHadst\b/g,    'Had'],    [/\bhadst\b/g,    'had'],
  [/\bShouldst\b/g, 'Should'], [/\bshouldst\b/g, 'should'],
  [/\bWouldst\b/g,  'Would'],  [/\bwouldst\b/g,  'would'],
  [/\bCouldst\b/g,  'Could'],  [/\bcouldst\b/g,  'could'],
  // -est verbs requiring -e restoration on the stem
  [/\bGavest\b/g,   'Gave'],   [/\bgavest\b/g,   'gave'],
  [/\bGivest\b/g,   'Give'],   [/\bgivest\b/g,   'give'],
  [/\bHidest\b/g,   'Hide'],   [/\bhidest\b/g,   'hide'],
  [/\bLovest\b/g,   'Love'],   [/\blovest\b/g,   'love'],
  [/\bMakest\b/g,   'Make'],   [/\bmakest\b/g,   'make'],
  [/\bRidest\b/g,   'Ride'],   [/\bridest\b/g,   'ride'],
  [/\bTakest\b/g,   'Take'],   [/\btakest\b/g,   'take'],
  // -est verbs where stripping -est gives the correct stem
  [/\bBeholdest\b/g, 'Behold'],  [/\bbeholdest\b/g, 'behold'],
  [/\bCallest\b/g,   'Call'],    [/\bcallest\b/g,   'call'],
  [/\bCoverest\b/g,  'Cover'],   [/\bcoverest\b/g,  'cover'],
  [/\bDwellest\b/g,  'Dwell'],   [/\bdwellest\b/g,  'dwell'],
  [/\bFillest\b/g,   'Fill'],    [/\bfillest\b/g,   'fill'],
  [/\bHearest\b/g,   'Hear'],    [/\bhearest\b/g,   'hear'],
  [/\bHoldest\b/g,   'Hold'],    [/\bholdest\b/g,   'hold'],
  [/\bKeepest\b/g,   'Keep'],    [/\bkeepest\b/g,   'keep'],
  [/\bKnowest\b/g,   'Know'],    [/\bknowest\b/g,   'know'],
  [/\bLeadest\b/g,   'Lead'],    [/\bleadest\b/g,   'lead'],
  [/\bLettest\b/g,   'Let'],     [/\blettest\b/g,   'let'],
  [/\bOpenest\b/g,   'Open'],    [/\bopenest\b/g,   'open'],
  [/\bRemainest\b/g, 'Remain'],  [/\bremainist\b/g, 'remain'],
  [/\bRenewest\b/g,  'Renew'],   [/\brenewest\b/g,  'renew'],
  [/\bSendest\b/g,   'Send'],    [/\bsendest\b/g,   'send'],
  [/\bSeekest\b/g,   'Seek'],    [/\bseekest\b/g,   'seek'],
  [/\bSeest\b/g,     'See'],     [/\bseest\b/g,     'see'],
  [/\bSpeakest\b/g,  'Speak'],   [/\bspeakest\b/g,  'speak'],
  [/\bTeachest\b/g,  'Teach'],   [/\bteachest\b/g,  'teach'],
  [/\bTurnest\b/g,   'Turn'],    [/\bturnest\b/g,   'turn'],
  [/\bWalkest\b/g,   'Walk'],    [/\bwalkest\b/g,   'walk'],
  [/\bWaterest\b/g,  'Water'],   [/\bwaterest\b/g,  'water'],
  [/\bWeepest\b/g,   'Weep'],    [/\bweepest\b/g,   'weep'],
];

function applyYouYour(text) {
  for (const [re, rep] of YOU_YOUR_RULES) text = text.replace(re, rep);
  return text;
}

// ─── getDayLabel helper ───────────────────────────────────────────────────────

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

function getDayLabel(entry, dow, season) {
  if (season === 'greatLent') {
    if (dow === 'saturday') {
      const note = entry._meta?.note || '';
      // Soul Saturdays
      const soulMatch = note.match(/Soul Saturday (\d)/);
      if (soulMatch) return `Soul Saturday ${soulMatch[1]}`;
      // Lazarus Saturday
      if (/Lazarus/.test(note)) return 'Lazarus Saturday';
      // Numbered Saturdays
      const satNum = entry.liturgicalContext?.weekOfLent || entry.liturgicalContext?.specialDayIndex;
      if (satNum) return `${ORDINALS[satNum] || satNum + 'th'} Saturday of Great Lent`;
      return null;
    }
    if (dow === 'sunday') {
      const wk = entry.liturgicalContext?.weekOfLent;
      const names = {
        1: 'Sunday of Orthodoxy',
        2: 'Sunday of St. Gregory Palamas',
        3: 'Sunday of the Holy Cross',
        4: 'Sunday of St. John of the Ladder',
        5: 'Sunday of St. Mary of Egypt',
        6: 'Palm Sunday',
      };
      return names[wk] || null;
    }
    // Weekday
    const wk  = entry.liturgicalContext?.weekOfLent;
    const cap = dow.charAt(0).toUpperCase() + dow.slice(1);
    if (wk) return `${cap}, ${ORDINALS[wk] || wk + 'th'} Week of Great Lent`;
    return null;
  }

  if (season === 'preLenten') {
    const litKey = entry.liturgicalContext?.litKey || null;
    const TRIODION_NAMES = {
      'triodion.publicanPharisee':  'Sunday of the Publican and Pharisee',
      'triodion.prodigalSon':       'Sunday of the Prodigal Son',
      'triodion.meatfareSaturday':  'Meatfare Saturday',
      'triodion.meatfareSunday':    'Meatfare Sunday',
      'triodion.forgivenessSunday': 'Forgiveness Sunday',
    };
    // Try to extract the litKey from the meta note
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return TRIODION_NAMES[key] || null;
  }

  if (season === 'holyWeek') {
    const names = {
      sunday: 'Palm Sunday', monday: 'Holy Monday', tuesday: 'Holy Tuesday',
      wednesday: 'Holy Wednesday', thursday: 'Great and Holy Thursday',
      friday: 'Great and Holy Friday', saturday: 'Great and Holy Saturday',
    };
    return names[dow] || null;
  }

  if (season === 'brightWeek') {
    const names = {
      sunday: 'Holy Pascha', monday: 'Bright Monday', tuesday: 'Bright Tuesday',
      wednesday: 'Bright Wednesday', thursday: 'Bright Thursday',
      friday: 'Bright Friday', saturday: 'Bright Saturday',
    };
    return names[dow] || null;
  }

  if (season === 'pentecostarion') {
    const FEAST_NAMES = {
      'pentecostarion.week.2.sunday': 'Thomas Sunday (Antipascha)',
      'pentecostarion.week.3.sunday': 'Sunday of the Myrrhbearers',
      'pentecostarion.week.4.sunday': 'Sunday of the Paralytic',
      'pentecostarion.week.5.sunday': 'Sunday of the Samaritan Woman',
      'pentecostarion.week.6.sunday': 'Sunday of the Blind Man',
      'pentecostarion.week.7.sunday': 'Sunday of the Holy Fathers',
      'pentecostarion.ascension':     'The Ascension of our Lord',
      'pentecostarion.pentecost':     'Holy Pentecost',
    };
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return FEAST_NAMES[key] || null;
  }

  return null;
}

// ─── Dashboard data builder ──────────────────────────────────────────────────

/**
 * Builds coverage data for every day in the given year.
 * Returns an array of { date, season, tone, feast, hasService, score, primarySource, layers, services }.
 *
 * score: 0–1 composite coverage (calendar entry, octoechos, prokeimena, troparia, stichera)
 * primarySource: 'oca' | 'stSergius' | 'generic' | 'mixed' | null
 * layers: { calendarEntry, octoechos, prokeimena, troparia, stichera, aposticha, triodion }
 *         each: { present: bool, source: string|null }
 */
function buildDashboardData(year) {
  const DAY_MS_LOCAL = 24 * 60 * 60 * 1000;
  const jan1  = new Date(Date.UTC(year, 0, 1));
  const dec31 = new Date(Date.UTC(year, 11, 31));

  // Batch-load Menaion DB data for the whole year
  let tropariaCounts = {};  // "MM-DD" → count
  let sticheraCounts = {};  // "MM-DD" → { count, sources }
  let generalMenaionTypes = {};  // "MM-DD" → saint_type if any
  try {
    const db = openDb();
    if (db) {
      // Count troparia per day
      const tropRows = db.prepare(`
        SELECT c.month, c.day, COUNT(DISTINCT t.commemoration_id) AS cnt
        FROM troparia t JOIN commemorations c ON c.id = t.commemoration_id
        WHERE t.type = 'troparion'
        GROUP BY c.month, c.day
      `).all();
      for (const r of tropRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        tropariaCounts[key] = r.cnt;
      }

      // Count stichera per day with source info and section breakdown
      const stichRows = db.prepare(`
        SELECT c.month, c.day, COUNT(*) AS cnt,
               GROUP_CONCAT(DISTINCT s.source) AS sources,
               GROUP_CONCAT(DISTINCT s.section) AS sections
        FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id
        GROUP BY c.month, c.day
      `).all();
      for (const r of stichRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        sticheraCounts[key] = { count: r.cnt, sources: r.sources || '', sections: r.sections || '' };
      }

      // Get saint_type for primary commemoration per day (for general menaion fallback detection)
      const gmRows = db.prepare(`
        SELECT month, day, saint_type FROM commemorations
        WHERE saint_type IS NOT NULL
        ORDER BY id
      `).all();
      for (const r of gmRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        if (!generalMenaionTypes[key]) generalMenaionTypes[key] = r.saint_type;
      }

      db.close();
    }
  } catch (err) {
    console.error('Dashboard DB query error:', err.message);
  }

  // Check which saint types have general menaion entries
  let gmAvailableTypes = new Set();
  try {
    const db = openDb();
    if (db) {
      const gmTypes = db.prepare(`SELECT DISTINCT saint_type FROM general_menaion`).all();
      for (const r of gmTypes) gmAvailableTypes.add(r.saint_type);
      // Add fallback mappings
      for (const [plural, singular] of Object.entries(GENERAL_MENAION_FALLBACK)) {
        if (gmAvailableTypes.has(singular)) gmAvailableTypes.add(plural);
      }
      db.close();
    }
  } catch (_) {}

  const result = [];
  let cur = new Date(jan1);

  while (cur <= dec31) {
    const dateStr = cur.toISOString().slice(0, 10);
    const [, mm, dd] = dateStr.split('-');
    const dayKey = `${mm}-${dd}`;
    const dowIdx = cur.getUTCDay();
    const dowStr = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];

    // Get calendar entry (cheap)
    const entry = getCalendarEntry(dateStr);
    const season = entry ? (entry.liturgicalContext?.season || null) : getLiturgicalSeason(cur);
    const tone = entry ? (entry.liturgicalContext?.tone ?? null) : null;

    const hasService = !!entry;
    const services = {
      greatVespers: entry?.vespers?.serviceType === 'greatVespers',
      dailyVespers: entry?.vespers?.serviceType === 'dailyVespers',
      liturgy: !!(entry?.liturgy) || isLiturgyServed(cur),
    };

    // Feast name from Menaion DB
    let feast = null;
    try {
      const dayList = getMenaionDayList(parseInt(mm), parseInt(dd));
      if (dayList) feast = dayList.principal;
    } catch (_) {}

    // Coverage layers
    const hasTroparia  = !!tropariaCounts[dayKey];
    const stichInfo    = sticheraCounts[dayKey];
    const hasStichera  = !!stichInfo;
    const saintType    = generalMenaionTypes[dayKey];
    const hasGmFallback = saintType && gmAvailableTypes.has(saintType) && !hasStichera;

    // Determine sources used
    const sourcesUsed = new Set();
    if (hasStichera && stichInfo.sources) {
      for (const s of stichInfo.sources.split(',')) {
        if (s === 'oca-menaion') sourcesUsed.add('oca');
        else if (s.startsWith('stSergius')) sourcesUsed.add('stSergius');
        else if (s) sourcesUsed.add(s);
      }
    }
    if (hasGmFallback) sourcesUsed.add('generic');

    // Determine Octoechos presence (relevant for Saturday Great Vespers / Friday)
    const needsOctoechos = dowStr === 'saturday' || dowStr === 'friday';
    const hasOctoechos = hasService && needsOctoechos;
    // Prokeimena always available from JSON
    const hasProkeimena = hasService;
    // Triodion check — relevant for Lenten season
    const lentenSeasons = ['greatLent', 'preLenten', 'holyWeek', 'brightWeek', 'pentecostarion'];
    const needsTriodion = lentenSeasons.includes(season);
    const hasTriodion = needsTriodion ? (entry?.vespers?.lordICall?.slots?.some(s => s.source === 'db' || s.source === 'triodion') || false) : true;

    // Composite score — contextual weights based on what the service actually needs
    let score = 0;
    if (hasService) {
      // Saturdays: full 6-layer scoring; weekdays: skip octoechos weight and redistribute
      const isSat = needsOctoechos;
      const weights = isSat
        ? { calendar: 0.15, octoechos: 0.2, prokeimena: 0.1, troparia: 0.2, stichera: 0.25, triodion: 0.1 }
        : { calendar: 0.15, prokeimena: 0.1, troparia: 0.3, stichera: 0.35, triodion: 0.1 };
      score += weights.calendar; // always have calendar entry if hasService
      if (isSat && hasOctoechos) score += weights.octoechos;
      if (hasProkeimena) score += weights.prokeimena;
      if (hasTroparia)   score += weights.troparia;
      if (hasStichera || hasGmFallback) score += weights.stichera;
      if (hasTriodion)   score += weights.triodion;
    }

    // Liturgy content score — 1.0 if hand-authored liturgy data exists, 0 otherwise
    const hasLiturgyContent = !!entry?.liturgy;
    const liturgyScore = hasLiturgyContent ? 1.0 : 0;

    // Primary source
    let primarySource = null;
    if (sourcesUsed.size > 1) primarySource = 'mixed';
    else if (sourcesUsed.has('oca')) primarySource = 'oca';
    else if (sourcesUsed.has('stSergius')) primarySource = 'stSergius';
    else if (sourcesUsed.has('generic')) primarySource = 'generic';
    else if (hasService && hasTroparia) primarySource = 'oca'; // troparia from OCA scraper

    const layers = {};
    if (hasService) {
      layers.calendarEntry = { present: true, source: entry?._meta?.generated ? 'auto-generated' : 'hand-authored' };
      layers.octoechos     = { present: hasOctoechos, source: hasOctoechos ? 'OCA Obikhod' : null };
      layers.prokeimena    = { present: hasProkeimena, source: 'prokeimena.json' };
      layers.troparia      = { present: hasTroparia, source: hasTroparia ? 'OCA Menaion' : null };
      layers.stichera      = { present: hasStichera, source: hasStichera ? formatSticheraSource(stichInfo.sources) : (hasGmFallback ? 'General Menaion' : null) };
      if (hasGmFallback && !hasStichera) {
        layers.stichera.present = true;
        layers.stichera.source = 'General Menaion (fallback)';
      }
      layers.aposticha     = { present: hasStichera && stichInfo.sections?.includes('aposticha'), source: hasStichera && stichInfo.sections?.includes('aposticha') ? formatSticheraSource(stichInfo.sources) : null };
      if (needsTriodion) {
        layers.triodion = { present: hasTriodion, source: hasTriodion ? 'triodion JSON' : null };
      }
    }

    result.push({
      date: dateStr,
      dayOfWeek: dowStr,
      season,
      tone,
      feast,
      hasService,
      score: Math.round(score * 100) / 100,
      liturgyScore,
      primarySource,
      layers,
      services,
    });

    cur = new Date(cur.getTime() + DAY_MS_LOCAL);
  }

  return result;
}

function formatSticheraSource(sourcesStr) {
  if (!sourcesStr) return null;
  const parts = sourcesStr.split(',');
  const labels = parts.map(s => {
    if (s === 'oca-menaion') return 'OCA';
    if (s.startsWith('stSergius')) return 'St. Sergius';
    return s;
  });
  return [...new Set(labels)].join(' + ');
}

// ─── Static file serving ──────────────────────────────────────────────────────

function serveStatic(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
  res.end(fs.readFileSync(filePath));
}

// ─── Request handler ──────────────────────────────────────────────────────────

function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  return Object.fromEntries(new URLSearchParams(url.slice(idx + 1)));
}

// Pre-load sources once at startup
let sources;
try {
  sources = loadSources();
  console.log('Sources loaded: octoechos, prokeimena, menaion, triodion');
} catch (err) {
  console.error('Failed to load sources:', err.message);
  process.exit(1);
}

let fixedTexts;
try {
  fixedTexts = loadJSON('fixed-texts/vespers-fixed.json');
  console.log('Fixed texts loaded.');
} catch (err) {
  console.error('Failed to load fixed texts:', err.message);
  process.exit(1);
}

let liturgyFixed;
try {
  liturgyFixed = loadJSON('fixed-texts/liturgy-fixed.json');
  console.log('Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load liturgy fixed texts:', err.message);
  process.exit(1);
}

ensureOrthocalCacheTable();

function handleRequest(req, res) {
  const url      = req.url || '/';
  const pathname = url.split('?')[0];

  try {
    if (pathname === '/') {
      serveStatic(res, path.join(__dirname, 'public', 'index.html'), 'text/html');

    } else if (pathname === '/favicon.svg') {
      serveStatic(res, path.join(__dirname, 'public', 'favicon.svg'), 'image/svg+xml');

    } else if (pathname.startsWith('/styles/') || pathname.startsWith('/scripts/')) {
      const filePath = path.join(__dirname, 'public', pathname);
      const ext = path.extname(filePath);
      const ct = ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/plain';
      serveStatic(res, filePath, ct);

    } else if (pathname === '/api/service') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      (async () => {
      // For Lenten weekday Vespers, enrich prokeimenon entries with pericopes from orthocal API
      let entryOverride = null;
      try {
        const baseEntry = getCalendarEntry(date);
        if (baseEntry?.liturgicalContext?.season === 'greatLent' &&
            baseEntry?.vespers?.serviceType === 'dailyVespers') {
          const orthocalData = await fetchOrthocalDay(date);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          if (vesperReadings.length > 0) {
            // Deep-clone just the prokeimenon entries so we don't mutate the shared calendar entry
            const entries = (baseEntry.vespers?.prokeimenon?.entries || []).map(e => {
              // API returns book:"OT" for all Vespers readings; match by book name in display field
              const match = vesperReadings.find(r =>
                r.display && e.reading?.book &&
                r.display.toLowerCase().startsWith(e.reading.book.toLowerCase())
              );
              if (match && match.display) {
                // Extract pericope from display (e.g. "Genesis 10.32-11.9" → "10:32–11:9")
                const raw = match.display.replace(/^[A-Za-z ]+/, '').trim();
                // Normalize: first dot between digits becomes colon, subsequent dot becomes em-dash start
                const pericope = raw.replace(/(\d+)\.(\d+)-(\d+)\.(\d+)/, '$1:$2–$3:$4')
                                    .replace(/(\d+)\.(\d+)/, '$1:$2');
                return { ...e, reading: { ...e.reading, pericope } };
              }
              return e;
            });
            entryOverride = {
              ...baseEntry,
              vespers: {
                ...baseEntry.vespers,
                prokeimenon: { ...baseEntry.vespers.prokeimenon, entries },
              },
            };
          }
        }
      } catch (err) {
        console.warn('Orthocal pericope fetch failed (non-fatal):', err.message);
      }

      let result;
      try {
        result = assembleForDate(date, pronoun, entryOverride);
      } catch (err) {
        console.error('assembleForDate error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No service available for this date.', date }));
        return;
      }

      const { blocks, calendarEntry, serviceTitle, tone } = result;
      const season = calendarEntry.liturgicalContext?.season || null;
      const dow    = calendarEntry.dayOfWeek || null;
      const liturgicalLabel = getDayLabel(calendarEntry, dow, season);

      // Use calendar entry commemorations if present; otherwise fall back to Menaion DB
      let commemorations = calendarEntry.commemorations || [];
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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:      calendarEntry.vespers?.serviceType || 'greatVespers',
        serviceName:      serviceTitle,
        tone,
        season,
        liturgicalLabel,
        commemorations,
        blocks,
      }));
      })().catch(err => {
        console.error('/api/service async error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/liturgy') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      (async () => {
        let calendarEntry = getCalendarEntry(date);
        if (!calendarEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No liturgy available for this date.', date }));
          return;
        }

        if (!calendarEntry.liturgy) {
          try {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources) };
          } catch (err) {
            console.error(`Orthocal API error for ${date}:`, err.message);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Liturgy data unavailable for this date.', date }));
            return;
          }
        }

        let blocks;
        try {
          blocks = assembleLiturgy(calendarEntry, liturgyFixed, sources);
        } catch (err) {
          console.error('assembleLiturgy error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }

        const season = calendarEntry.liturgicalContext?.season || null;
        const tone   = calendarEntry.liturgicalContext?.tone ?? null;
        const dow    = calendarEntry.dayOfWeek || null;
        const liturgicalLabel = getDayLabel(calendarEntry, dow, season);
        const commemorations  = calendarEntry.commemorations || [];

        const variantName = calendarEntry.liturgy.variant === 'basil'
          ? 'Liturgy of St. Basil the Great'
          : 'Liturgy of St. John Chrysostom';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType:    'liturgy',
          serviceName:    `Divine Liturgy — ${variantName}`,
          tone,
          season,
          liturgicalLabel,
          commemorations,
          blocks,
        }));
      })().catch(err => {
        console.error('Liturgy route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/days') {
      const q    = parseQuery(url);
      const from = (q.from || '').trim();
      const to   = (q.to   || '').trim();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid from/to parameters.' }));
        return;
      }

      const [fy, fm, fd] = from.split('-').map(Number);
      const [ty, tm, td] = to.split('-').map(Number);
      const startDate = new Date(Date.UTC(fy, fm - 1, fd));
      const endDate   = new Date(Date.UTC(ty, tm - 1, td));

      if (endDate < startDate) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '"to" must be on or after "from".' }));
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const MONTH_NAMES_FULL = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
      const DOW_NAMES_UPPER  = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
      const DAY_MS_LOCAL     = 24 * 60 * 60 * 1000;

      const result = [];
      let cur = new Date(startDate);
      while (cur <= endDate) {
        const dateStr = cur.toISOString().slice(0, 10);
        const [, mm, dd] = dateStr.split('-').map(Number);
        const dowIdx  = cur.getUTCDay();
        const dowStr  = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];

        // Get calendar entry (cheap — no assembly)
        const entry  = getCalendarEntry(dateStr);
        const season = entry ? (entry.liturgicalContext?.season || null) : null;
        const tone   = entry ? (entry.liturgicalContext?.tone ?? entry.vespers?.lordICall?.tone ?? null) : null;
        const liturgicalLabel = entry ? getDayLabel(entry, dowStr, season) : null;

        // Feast + commemorations list from Menaion DB
        let feast = null;
        let commemorations = [];
        try {
          const dayList = getMenaionDayList(mm, dd);
          if (dayList) {
            feast          = dayList.principal;
            commemorations = dayList.commemorations;
          }
        } catch (_) {}

        const services = {
          greatVespers: entry?.vespers?.serviceType === 'greatVespers',
          dailyVespers: entry?.vespers?.serviceType === 'dailyVespers',
          matins:  false,
          liturgy: !!(entry?.liturgy) || isLiturgyServed(cur),
        };

        result.push({
          date:           dateStr,
          dayOfWeek:      dowStr,
          displayDay:     DOW_NAMES_UPPER[dowIdx],
          displayDate:    `${MONTH_NAMES_FULL[mm - 1]} ${dd}`,
          isToday:        dateStr === today,
          season,
          tone,
          feast,
          commemorations,
          liturgicalLabel,
          services,
        });

        cur = new Date(cur.getTime() + DAY_MS_LOCAL);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } else if (pathname === '/api/search') {
      const q = parseQuery(url);
      const query = (q.q || '').trim();
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (query.length < 2) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }

      let results = [];
      try {
        const db = openDb();
        if (db) {
          // Find matching commemorations, deduplicate by title across months
          const rows = db.prepare(`
            SELECT id, month, day, title, rank
            FROM commemorations
            WHERE title LIKE ?
            ORDER BY rank DESC, month, day
            LIMIT 40
          `).all(`%${query}%`);

          // Compute 2026 date and check service availability
          const seen = new Set();
          for (const row of rows) {
            const key = row.title.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const mm = String(row.month).padStart(2, '0');
            const dd = String(row.day).padStart(2, '0');
            // Find the nearest upcoming Saturday on or after this calendar date in 2026
            // that falls within a Saturday window, or just use the calendar date
            const dateStr = `2026-${mm}-${dd}`;
            // Find what Saturday this day falls on (Vespers is on Saturday)
            const date = new Date(`${dateStr}T12:00:00`);
            const dow = date.getDay(); // 0=Sun
            // For search results, show the calendar date; Great Vespers is Saturday night
            // so if the feast is on a Sunday, Vespers is Saturday night before (subtract 1 day)
            let serviceDate = dateStr;
            if (dow === 0) {
              // Sunday feast — Vespers was Saturday evening
              const sat = new Date(date);
              sat.setDate(sat.getDate() - 1);
              serviceDate = sat.toISOString().slice(0, 10);
            }

            const entry = getCalendarEntry(serviceDate);
            const svcType = entry?.vespers?.serviceType || null;
            const hasService = !!(svcType);

            results.push({
              id:          serviceDate,
              title:       row.title,
              dateStr:     serviceDate,
              svcType:     svcType || 'greatVespers',
              displayDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
              available:   hasService,
            });
          }
        }
      } catch (err) {
        console.error('/api/search error:', err);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));

    } else if (pathname === '/service') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (q.pronoun || 'tt').trim();

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage('Invalid or missing date parameter.'));
        return;
      }

      // Try assembleForDate first
      let assembleResult;
      try {
        assembleResult = assembleForDate(date, pronoun);
      } catch (err) {
        console.error('Assembly error:', err);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(`Assembly error: ${err.message}`));
        return;
      }

      if (!assembleResult) {
        // Fall back to DB-collected texts (variable sections only)
        const dbBlocks = getDbBlocks(date, pronoun);
        if (dbBlocks.length > 0) {
          const blocks = mapDbBlocks(dbBlocks);
          const html = renderVespers(blocks, {
            title: 'Vespers (Collected Texts)',
            date:  formatDate(date),
          });
          const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
          const notice = `<div style="font-family:sans-serif;font-size:9.5pt;padding:8px 40px;background:#e8f4fb;border-bottom:1px solid #a0c8e0;color:#1a4a6a;">
  ℹ Showing collected variable texts only — fixed liturgy (litanies, psalms, prayers) not yet available for this season.
</div>`;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html.replace('<body>', '<body>' + backBar + notice));
          return;
        }

        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(Date.UTC(year, month - 1, day));
        const season  = getLiturgicalSeason(dateObj);
        const dow     = getDayOfWeek(dateObj);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(
          `No service available for ${formatDate(date)}.`,
          `This is a ${dow} in the ${season} season. ` +
          `Automatic generation is currently supported for Saturdays in ordinary time only. ` +
          `Add a hand-authored calendar file to support this date.`
        ));
        return;
      }

      const { blocks, calendarEntry, serviceTitle, tone } = assembleResult;
      const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
      const isGenerated  = calendarEntry._meta?.generated;
      const toneLabel    = tone ? ` · Tone ${tone}` : '';

      const html = renderVespers(blocks, {
        title: serviceTitle,
        date:  `${formatDate(date)}${toneLabel}${pronounLabel}`,
      });

      const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;

      // Format assembly warnings into human-readable messages
      const rawWarnings = blocks._warnings || [];
      const warningMessages = rawWarnings.map(w => formatAssemblyWarning(w.source, w.key)).filter(Boolean);
      const uniqueWarnings = [...new Set(warningMessages)];

      const warningBanner = uniqueWarnings.length > 0
        ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:10px 40px;background:#fff3cd;border-bottom:2px solid #e6ac00;color:#6b4800;">
             <strong>⚠ Some portions of this service are incomplete:</strong>
             <ul style="margin:4px 0 0 16px;padding:0;">${uniqueWarnings.map(m => `<li>${m}</li>`).join('')}</ul>
           </div>`
        : '';

      const injected = html.replace('<body>', '<body>' + backBar + warningBanner);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);

    } else if (/^\/api\/stichera\/(\d{1,2})\/(\d{1,2})$/.test(pathname)) {
      const [, m, d] = pathname.match(/^\/api\/stichera\/(\d{1,2})\/(\d{1,2})$/);
      const month = parseInt(m, 10);
      const day   = parseInt(d, 10);
      const data  = getSticheraDay(month, day);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No stichera found', month, day }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ month, day, commemorations: data }, null, 2));

    } else if (/^\/api\/menaion\/(\d{1,2})\/(\d{1,2})$/.test(pathname)) {
      const [, m, d] = pathname.match(/^\/api\/menaion\/(\d{1,2})\/(\d{1,2})$/);
      const month = parseInt(m, 10);
      const day   = parseInt(d, 10);
      const data  = getMenaionDay(month, day);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No commemorations found', month, day }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ month, day, commemorations: data }, null, 2));

    } else if (pathname === '/api/dashboard') {
      const q    = parseQuery(url);
      const year = parseInt(q.year, 10) || 2026;

      res.setHeader('Access-Control-Allow-Origin', '*');

      const result = buildDashboardData(year);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } else if (pathname === '/dashboard') {
      serveStatic(res, path.join(__dirname, 'public', 'dashboard.html'), 'text/html');

    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderErrorPage(`Internal error: ${err.message}`));
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`OCA Service Browser running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
