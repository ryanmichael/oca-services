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

const { assembleVespers, assembleLiturgy, assemblePresanctified, assemblePaschalHours, assembleMidnightOffice, assemblePaschalMatins, assembleBridegroomMatins, assemblePassionGospels, assembleLamentations, assembleVesperalLiturgy, assembleRoyalHours, assembleMatins, resolveSource } = require('./assembler');
const { generateCalendarEntry, getLiturgicalSeason, getDayOfWeek, getLiturgicalKey,
        getLiturgyVariant, getTone, getTrisagionSubstitution, isLiturgyServed,
        isPresanctifiedDay, isBridegroomMatins, isPassionGospelsDay, isLamentationsDay, isVesperalLiturgyDay, isRoyalHoursDay, isBurialVespersDay,
        getWeekOfLent, calculatePascha, getGreatFeastKey, isSoulSaturday,
        getEothinon } = require('./calendar-rules');
const { renderService, renderVespers }             = require('./renderer');
const { getMatinsKathismata }                    = require('./kathisma');
const { deduplicateBySource }                    = require('./oca-psalter');

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

/** Recursively tag all hymn-like objects in a source tree with a provenance label. */
function tagProvenance(obj, label) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(item => tagProvenance(item, label)); return; }
  // Tag objects that look like hymns (have a 'text' property)
  if (obj.text && typeof obj.text === 'string' && !obj.provenance) obj.provenance = label;
  // Also tag hymns arrays
  if (obj.hymns) obj.hymns.forEach(h => { if (h && !h.provenance) h.provenance = label; });
  for (const v of Object.values(obj)) tagProvenance(v, label);
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
      const sourceData = raw.vespers || raw;
      // Tag all hymn objects with provenance so dev-mode shows the publisher
      tagProvenance(sourceData, 'OCA');
      cur[parts[parts.length - 1]] = sourceData;
    }
  }

  // 'db' source is populated in Step 2; include empty object now so the
  // assembler doesn't warn on unresolved db: references in generated entries.
  // Load eothinon cycle data
  const eothinonPath = path.join(__dirname, 'variable-sources', 'eothinon.json');
  const eothinon = fs.existsSync(eothinonPath) ? loadJSON('variable-sources/eothinon.json') : {};

  return { octoechos, prokeimena, menaion, triodion, eothinon, db: {} };
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

/**
 * Returns the next calendar date as a YYYY-MM-DD string.
 * Used for the Vespers date-shift: Vespers served on date X is liturgically
 * the first service of date X+1, so we look up the next day's calendar entry.
 */
function getNextDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
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

/**
 * Renders blocks as a standalone HTML service sheet with back-bar and warnings.
 * Used by all service routes when format=html is requested.
 */
function renderServiceHTML(res, blocks, title, date, pronoun) {
  const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
  const html = renderService(blocks, { title, date: `${date}${pronounLabel}` });
  const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
  const rawWarnings = blocks._warnings || [];
  const warningMessages = rawWarnings.map(w => formatAssemblyWarning(w.source, w.key)).filter(Boolean);
  const uniqueWarnings = [...new Set(warningMessages)];
  const warningBanner = uniqueWarnings.length > 0
    ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:10px 40px;background:#fff3cd;border-bottom:2px solid #e6ac00;color:#6b4800;">
         <strong>⚠ Some portions of this service are incomplete:</strong>
         <ul style="margin:4px 0 0 16px;padding:0;">${uniqueWarnings.map(m => `<li>${m}</li>`).join('')}</ul>
       </div>`
    : '';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html.replace('<body>', '<body>' + backBar + warningBanner));
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
    // Prefer OCA source when multiple translations exist for the same slot
    for (const [commId, stichera] of Object.entries(sticheraMap)) {
      sticheraMap[commId] = deduplicateBySource(
        stichera,
        s => `${s.section}:${s.order}`,
        'dbSource'
      );
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
 * Build Beatitudes troparia array for the Liturgy Third Antiphon.
 * On Sundays: 8 troparia from Octoechos Canon of the Resurrection (Odes 3+6).
 * Each item has { tone, label, source, text }.
 */
function buildBeatitudesTroparia(isSunday, tone, srcs) {
  if (!isSunday) return []; // weekday beatitudes not yet implemented

  const tk = `tone${tone}`;
  const oct = srcs?.octoechos;
  const beatData = oct?.[tk]?.sunday?.liturgy?.beatitudes;
  if (!beatData) return [];

  const troparia = [];
  const src = 'octoechos';

  // Ode 3: irmos, troparion1, troparion2, theotokion
  if (beatData.ode3) {
    const o = beatData.ode3;
    if (o.irmos)      troparia.push({ tone, label: 'Irmos of Ode 3', source: src, text: o.irmos });
    if (o.troparia?.[0]) troparia.push({ tone, label: 'Troparion of Ode 3', source: src, text: o.troparia[0] });
    if (o.troparia?.[1]) troparia.push({ tone, label: 'Troparion of Ode 3', source: src, text: o.troparia[1] });
    if (o.theotokion) troparia.push({ tone, label: 'Theotokion of Ode 3', source: src, text: o.theotokion });
  }

  // Ode 6: irmos, troparion1, troparion2, theotokion
  if (beatData.ode6) {
    const o = beatData.ode6;
    if (o.irmos)      troparia.push({ tone, label: 'Irmos of Ode 6', source: src, text: o.irmos });
    if (o.troparia?.[0]) troparia.push({ tone, label: 'Troparion of Ode 6', source: src, text: o.troparia[0] });
    if (o.troparia?.[1]) troparia.push({ tone, label: 'Troparion of Ode 6', source: src, text: o.troparia[1] });
    if (o.theotokion) troparia.push({ tone, label: 'Theotokion of Ode 6', source: src, text: o.theotokion });
  }

  return troparia;
}

// ─── Great Feast Variants ─────────────────────────────────────────────────────
// Each feast of the Lord replaces the typical antiphons, entrance hymn, and
// megalynarion. Theotokos feasts keep typical antiphons but replace megalynarion.
// All great feasts have their own communion hymn.
//
// Source: Assembly of Canonical Orthodox Bishops, OCA service texts, Festal Menaion.

const GREAT_FEAST_VARIANTS = {
  // ── Feasts of the Lord (special antiphons) ──────────────────────────────────

  nativity: {
    type: 'lord',
    label: 'The Nativity of Christ',
    antiphons: {
      first: {
        refrain: 'Through the prayers of the Theotokos, O Savior, save us.',
        verses: [
          'I will give thanks unto the Lord with my whole heart, in the council of the upright and in the congregation.',
          'Great are the works of the Lord, sought out according to all His desires.',
          'His work is praise and majesty, and His righteousness endureth forever.',
          'He hath made His wonderful works to be remembered; the Lord is gracious and full of compassion.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      second: {
        refrain: 'O Son of God, born of the Virgin, save us who sing to Thee: Alleluia!',
        verses: [
          'Blessed is the man that feareth the Lord; in His commandments shall he greatly delight.',
          'His seed shall be mighty upon the earth; the generation of the upright shall be blessed.',
          'Glory and riches shall be in his house, and his righteousness endureth forever.',
          'Unto the upright there hath risen a light in the darkness; He is gracious, and compassionate, and righteous.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      third: {
        refrain: 'Thy Nativity, O Christ our God, has shone to the world the light of wisdom! For by it, those who worshipped the stars were taught by a Star to adore Thee, the Sun of Righteousness, and to know Thee, the Orient from on high. O Lord, glory to Thee!',
        verses: [
          'The Lord said unto my Lord: Sit Thou at My right hand, until I make Thine enemies Thy footstool.',
          'The Lord shall send the rod of Thy strength out of Zion: rule Thou in the midst of Thine enemies.',
          'With Thee is dominion in the day of Thy power, in the splendors of Thy saints.',
        ],
      },
    },
    troparia: [
      { tone: 4, rubric: 'Troparion of the Nativity of Christ, Tone 4:', text: 'Your Nativity, O Christ our God,\nhas shone to the world the Light of knowledge;\nfor by it, those who worshipped the stars\nwere taught by a star to adore You,\nthe Sun of Righteousness,\nand to know You, the Dayspring from on High.\nO Lord, glory to You!' },
    ],
    kontakia: [
      { tone: 3, rubric: 'Kontakion of the Nativity of Christ, Tone 3:', text: 'Today the Virgin gives birth to the Transcendent One,\nand the earth offers a cave to the Unapproachable One!\nAngels with shepherds glorify Him.\nThe wise men journey with a star,\nsince for our sake the Pre-Eternal God was born as a young Child.' },
    ],
    prokeimenon: { tone: 8, refrain: 'All the earth shall worship Thee and shall sing to Thee; they shall sing to Thy Name, O Most High!', verse: 'Make a joyful noise unto God, all the earth; sing of the glory of His Name; give glory to His praise.' },
    alleluia: { tone: 1, verses: ['The heavens declare the glory of God, and the firmament proclaims the work of His hands.', 'Day unto day pours forth speech, and night unto night declares knowledge.'] },
    entranceHymn: 'Come, let us worship and fall down before Christ. O Son of God, born of the Virgin, save us who sing to Thee: Alleluia!',
    megalynarion: 'Magnify, O my soul, the most pure Virgin Theotokos, more honorable and more glorious than the heavenly hosts! I behold a strange and most glorious mystery: the cave a heaven, the Virgin a cherubic throne, and the manger a noble place in which Christ, the uncontained God, was laid. Let us sing and magnify Him!',
    communionHymn: 'The Lord has sent redemption to His people. Alleluia.',
  },

  theophany: {
    type: 'lord',
    label: 'The Baptism of Christ (Theophany)',
    antiphons: {
      first: {
        refrain: 'Through the prayers of the Theotokos, O Savior, save us.',
        verses: [
          'When Israel went out of Egypt, the house of Jacob from a people of strange language,',
          'Judah was His sanctuary, Israel His dominion.',
          'The sea saw it and fled; Jordan was driven back.',
          'What ailed thee, O sea, that thou fleddest? O Jordan, that thou wast driven back?',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      second: {
        refrain: 'O Son of God, baptized in the Jordan, save us who sing to Thee: Alleluia!',
        verses: [
          'I love the Lord because He has heard the voice of my supplication.',
          'Because He inclined His ear to me, therefore I will call on Him as long as I live.',
          'The snares of death encompassed me; the pangs of Sheol laid hold on me; I suffered distress and anguish, then I called on the Name of the Lord.',
          'Gracious and righteous is the Lord; and our God is merciful.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      third: {
        refrain: 'When Thou, O Lord, wast baptized in the Jordan, the worship of the Trinity was made manifest. For the voice of the Father bare witness to Thee, and called Thee His beloved Son; and the Spirit, in the form of a dove, confirmed the truthfulness of His word. O Christ our God, who hast revealed Thyself and hast enlightened the world, glory to Thee!',
        verses: [
          'O give thanks unto the Lord, for He is good; for His mercy endureth forever.',
          'Let the house of Israel now say that He is good, for His mercy endureth forever.',
          'Let the house of Aaron now say that He is good, for His mercy endureth forever.',
          'Let all that fear the Lord now say that He is good, for His mercy endureth forever.',
        ],
      },
    },
    troparia: [
      { tone: 1, rubric: 'Troparion of the Theophany, Tone 1:', text: 'When You, O Lord, were baptized in the Jordan,\nthe worship of the Trinity was made manifest;\nfor the voice of the Father bore witness to You\nand called You His beloved Son.\nAnd the Spirit, in the form of a dove,\nconfirmed the truthfulness of His word.\nO Christ, our God, You have revealed Yourself\nand have enlightened the world, glory to You!' },
    ],
    kontakia: [
      { tone: 4, rubric: 'Kontakion of the Theophany, Tone 4:', text: 'Today You have shown forth to the world, O Lord,\nand the light of Your countenance has been marked on us.\nKnowing You, we sing Your praises.\nYou have come and revealed Yourself,\nO unapproachable Light.' },
    ],
    prokeimenon: { tone: 4, refrain: 'Blessed is He that comes in the Name of the Lord. God is the Lord and has revealed Himself to us.', verse: 'O give thanks to the Lord, for He is good, for His mercy endures forever.' },
    alleluia: { tone: 1, verses: ['Bring to the Lord, O ye sons of God, bring to the Lord young rams.', 'The voice of the Lord is upon the waters; the God of glory has thundered, the Lord, upon many waters.'] },
    entranceHymn: 'Blessed is He that cometh in the Name of the Lord. God is the Lord and hath revealed Himself to us. O Son of God, baptized in the Jordan, save us who sing to Thee: Alleluia!',
    megalynarion: 'Magnify, O my soul, the most pure Virgin Theotokos, more honorable than the heavenly hosts! No tongue knows how to praise thee worthily, O Theotokos; even Angels are overcome with awe praising thee. But since thou art good, accept our faith; for thou knowest our love inspired by God! Thou art the defender of Christians, and we magnify thee.',
    communionHymn: 'The grace of God has appeared for the salvation of all men. Alleluia.',
  },

  // Meeting of the Lord: OCA practice does NOT use festal antiphons for this feast.
  // Source: OCA service text downloads confirm typical antiphons are used.
  meeting: {
    type: 'theotokos',
    label: 'The Meeting of the Lord (Presentation)',
    troparia: [
      { tone: 1, rubric: 'Troparion of the Meeting of the Lord, Tone 1:', text: 'Hail, Virgin Theotokos, full of grace;\nfor from you has shone forth the Sun of Righteousness, Christ our God,\ngiving light to those in darkness.\nBe glad, O righteous Elder;\nfor you received in your arms the Redeemer of our souls,\nWho bestows upon us the resurrection.' },
    ],
    kontakia: [
      { tone: 1, rubric: 'Kontakion of the Meeting of the Lord, Tone 1:', text: 'By Your birth, You sanctified a virginal womb,\nand fittingly You blessed Simeon\'s hands, O Christ God;\neven now You have saved us by anticipation.\nGrant peace to Your faithful people whom You have loved, O only Lover of mankind.' },
    ],
    prokeimenon: { tone: 3, refrain: 'My soul magnifies the Lord, and my spirit rejoices in God my Savior.', verse: 'For He has regarded the low estate of His handmaiden; for behold, henceforth all generations will call me blessed.' },
    alleluia: { tone: 8, verses: ['Now lettest Thou Thy servant depart in peace, O Master, according to Thy word.', 'A light for revelation to the Gentiles, and for glory to Thy people Israel.'] },
    megalynarion: 'O Virgin Theotokos, hope of all Christians, protect, preserve, and save those who hope in thee! In the shadow and letter of the Law, let us the faithful discern a figure: every male child that opens the womb is holy to God. Therefore we magnify the firstborn Word of the Father Who has no beginning, the Son firstborn of a Mother who had not known man.',
    communionHymn: 'I will receive the cup of salvation and call on the Name of the Lord. Alleluia.',
  },

  transfiguration: {
    type: 'lord',
    label: 'The Transfiguration of Christ',
    antiphons: {
      first: {
        refrain: 'Through the prayers of the Theotokos, O Savior, save us.',
        verses: [
          'Great is the Lord, and greatly to be praised, in the city of our God, in His holy mountain.',
          'Beautiful in elevation, the joy of the whole earth, is Mount Zion.',
          'God is known in her palaces as a refuge.',
          'As we have heard, so have we seen, in the city of the Lord of Hosts.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      second: {
        refrain: 'O Son of God, transfigured on the mountain, save us who sing to Thee: Alleluia!',
        verses: [
          'His foundation is in the holy mountains. The Lord loveth the gates of Zion more than all the dwellings of Jacob.',
          'Glorious things are spoken of thee, O City of God.',
          'The Most High Himself shall establish her.',
          'I will make mention of Rahab and Babylon among those that know Me.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      third: {
        refrain: 'Thou wast transfigured on the mount, O Christ God, revealing Thy glory to Thy disciples as far as they could bear it. Let Thine everlasting light also shine upon us sinners, through the prayers of the Theotokos! O Giver of Light, glory to Thee!',
        verses: [
          'The heavens are Thine, the earth also is Thine; the world and the fulness thereof, Thou hast founded them.',
          'Tabor and Hermon shall rejoice in Thy name.',
          'Blessed are the people who know the joyful sound.',
        ],
      },
    },
    troparia: [
      { tone: 7, rubric: 'Troparion of the Transfiguration, Tone 7:', text: 'You were transfigured on the mountain, O Christ God,\nrevealing Your glory to Your disciples as far as they could bear it.\nLet Your everlasting Light also shine upon us sinners,\nthrough the prayers of the Theotokos.\nO Giver of Light, glory to You!' },
    ],
    kontakia: [
      { tone: 7, rubric: 'Kontakion of the Transfiguration, Tone 7:', text: 'On the Mountain You were Transfigured, O Christ God,\nand Your disciples beheld Your glory as far as they could see it;\nso that when they would behold You crucified,\nthey would understand that Your suffering was voluntary,\nand would proclaim to the world,\nthat You are truly the Radiance of the Father!' },
    ],
    prokeimenon: { tone: 4, refrain: 'O Lord, how manifold are Thy works! In wisdom hast Thou made them all.', verse: 'Bless the Lord, O my soul! O Lord my God, Thou art very great!' },
    alleluia: { tone: 8, verses: ['Thine are the heavens, and Thine is the earth.', 'Blessed are the people who know the joyful sound.'] },
    entranceHymn: 'Come, let us worship and fall down before Christ. O Son of God, transfigured on the mountain, save us who sing to Thee: Alleluia!',
    megalynarion: 'Magnify, O my soul, the Lord Who was transfigured on Mount Tabor! Thy childbearing was without corruption; God came forth from thy body clothed in flesh, and appeared on earth and dwelt among men. Therefore we all magnify thee, O Theotokos!',
    communionHymn: 'O Lord, we will walk in the light of Thy countenance, and will exult in Thy name forever. Alleluia.',
  },

  elevation: {
    type: 'lord',
    label: 'The Elevation of the Cross',
    antiphons: {
      first: {
        refrain: 'Through the prayers of the Theotokos, O Savior, save us.',
        verses: [
          'My God, my God, why hast Thou forsaken me? Why art Thou so far from helping me?',
          'O my God, I cry in the daytime, but Thou hearest not; and in the night season.',
          'But Thou art holy, O Thou that inhabitest the praises of Israel.',
          'Our fathers trusted in Thee; they trusted, and Thou didst deliver them.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      second: {
        refrain: 'O Son of God, crucified in the flesh, save us who sing to Thee: Alleluia!',
        verses: [
          'O God, why hast Thou cast us off forever? Why doth Thine anger smoke against the sheep of Thy pasture?',
          'Remember Thy congregation, which Thou hast purchased of old.',
          'Remember Mount Zion, wherein Thou hast dwelt.',
          'God is our King of old, working salvation in the midst of the earth.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      third: {
        refrain: 'O Lord, save Thy people, and bless Thine inheritance! Grant victories to the Orthodox Christians over their adversaries, and by virtue of Thy Cross, preserve Thy habitation!',
        verses: [
          'O make a joyful noise unto the Lord, all ye lands; serve the Lord with gladness.',
          'Come before His presence with singing; know ye that the Lord, He is God.',
          'It is He that hath made us, and not we ourselves; we are His people and the sheep of His pasture.',
        ],
      },
    },
    troparia: [
      { tone: 1, rubric: 'Troparion of the Elevation of the Cross, Tone 1:', text: 'O Lord, save Your people,\nand bless Your inheritance.\nGrant victories to the Orthodox Christians\nover their adversaries.\nAnd by virtue of Your Cross,\npreserve Your habitation.' },
    ],
    kontakia: [
      { tone: 4, rubric: 'Kontakion of the Elevation of the Cross, Tone 4:', text: 'As You were voluntarily raised upon the cross for our sake,\ngrant mercy to those who are called by Your Name, O Christ God;\nmake all Orthodox Christians glad by Your power,\ngranting them victories over their adversaries,\nby bestowing on them the Invincible trophy, Your weapon of Peace.' },
    ],
    prokeimenon: { tone: 7, refrain: 'Exalt the Lord our God; worship at His footstool, for He is holy!', verse: 'The Lord reigns; let the peoples tremble.' },
    alleluia: { tone: 1, verses: ['Remember Thy congregation, which Thou hast gotten of old.', 'God is our King before the ages; He has worked salvation in the midst of the earth.'] },
    entranceHymn: 'Come, let us worship and fall down before Christ. O Son of God, crucified in the flesh, save us who sing to Thee: Alleluia!',
    megalynarion: 'Magnify, O my soul, the most precious Cross of the Lord! Thou art a mystical Paradise, O Theotokos, who, though untilled, hast brought forth Christ; through Him the life-bearing wood of the Cross was planted on earth. Now at its Exaltation, as we bow in worship before it, we magnify thee!',
    communionHymn: 'The light of Thy countenance, O Lord, has been signed upon us. Alleluia.',
  },

  palmSunday: {
    type: 'lord',
    label: 'The Entry of the Lord into Jerusalem',
    antiphons: {
      first: {
        refrain: 'Through the prayers of the Theotokos, O Savior, save us!',
        verses: [
          'I love the Lord because He has heard the voice of my supplication.',
          'Because He inclined His ear to me, therefore I will call on Him as long as I live.',
          'The snares of death encompassed me; the pangs of hell laid hold on me.',
          'I suffered distress and anguish, then I called on the Name of the Lord.',
          'I will walk in the presence of the Lord in the land of the living.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      second: {
        refrain: 'O Son of God, seated on the colt of an ass, save us who sing to Thee: Alleluia!',
        verses: [
          'I kept my faith, even when I said, "I am greatly afflicted."',
          'What shall I render to the Lord for all the things He has given me?',
          'I will receive the cup of salvation, and call upon the Name of the Lord.',
          'I will pay my vows to the Lord in the presence of all His people.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      third: {
        refrain: 'By raising Lazarus from the dead before Thy Passion, Thou didst confirm the universal resurrection, O Christ God. Like the children with the palms of victory, we cry out to Thee, O Vanquisher of Death: "Hosanna in the highest! Blessed is He that comes in the Name of the Lord."',
        verses: [
          'O give thanks to the Lord, for He is good; for His mercy endures forever.',
          'Let the house of Israel say that He is good; for His mercy endures forever.',
          'Let the house of Aaron say that He is good; for His mercy endures forever.',
          'Let those who fear the Lord say that He is good; for His mercy endures forever.',
        ],
      },
    },
    troparia: [
      { tone: 1, rubric: 'Troparion of Entry of Our Lord into Jerusalem (Palm Sunday), Tone 1:', text: 'By raising Lazarus from the dead before Thy Passion,\nThou didst confirm the universal resurrection, O Christ God.\nLike the children with the palms of victory,\nwe cry out to Thee, O Vanquisher of Death:\n"Hosanna in the highest!\nBlessed is He that comes in the Name of the Lord."' },
      { tone: 4, rubric: 'Troparion of Entry of Our Lord into Jerusalem (Palm Sunday), Tone 4:', text: 'When we were buried with Thee in baptism, O Christ God,\nwe were made worthy of eternal life by Thy Resurrection.\nNow we praise Thee and sing:\n"Hosanna in the highest!\nBlessed is He that comes in the Name of the Lord!"' },
    ],
    kontakia: [
      { tone: 6, rubric: 'Kontakion of Entry of Our Lord into Jerusalem (Palm Sunday), Tone 6:', text: 'Sitting on Thy throne in Heaven,\ncarried on a foal on earth, O Christ God,\naccept the praise of angels and the songs of children, who sing:\n"Blessed is He Who comes to recall Adam!"' },
    ],
    prokeimenon: { tone: 4, refrain: 'Blessed is He that comes in the Name of the Lord. God is the Lord and has revealed Himself to us.', verse: 'O give thanks to the Lord, for He is good; for His mercy endures forever.' },
    alleluia: { tone: 1, verses: ['O sing to the Lord a new song, for He has done marvelous things!', 'All the ends of the earth have seen the salvation of our God.'] },
    entranceHymn: 'Blessed is He that comes in the Name of the Lord. We bless you from the house of the Lord. God is the Lord and He has revealed Himself to us.',
    megalynarion: 'God is the Lord and has revealed Himself to us! Celebrate the feast and come with gladness! Let us magnify Christ with palms and branches, singing: "Blessed is He that comes in the Name of the Lord, our Savior!"',
    communionHymn: 'Blessed is He that comes in the Name of the Lord. God is the Lord and has revealed Himself to us. Alleluia.',
  },

  ascension: {
    type: 'lord',
    label: 'The Ascension of the Lord',
    antiphons: {
      first: {
        refrain: 'Through the prayers of the Theotokos, O Savior, save us!',
        verses: [
          'Clap your hands, all peoples; shout to God with loud songs of joy!',
          'For the Lord, the Most High is terrible; a great God over all the earth.',
          'He subdued peoples under us, and nations under our feet.',
          'God has gone up with a shout, the Lord with the sound of a trumpet!',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      second: {
        refrain: 'O Son of God, who ascended in glory, save us who sing to Thee: Alleluia!',
        verses: [
          'Great is the Lord and greatly to be praised in the city of our God.',
          'Mount Zion in the far north is the city of the great King.',
          'Within her citadels God is known when He defends her.',
          'For lo, the kings assembled; they came on together.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      third: {
        refrain: 'Thou didst ascend in glory, O Christ our God, granting joy to Thy disciples by the promise of the Holy Spirit. Through the blessing they were assured that Thou art the Son of God, the Redeemer of the world.',
        verses: [
          'Hear this, all peoples; give ear, all inhabitants of the world.',
          'Earth-born and the sons of men, rich and poor together.',
          'My mouth shall speak wisdom, and the meditation of my heart shall be understanding.',
        ],
      },
    },
    troparia: [
      { tone: 4, rubric: 'Troparion of the Ascension, Tone 4:', text: 'You ascended in glory, O Christ our God,\ngranting joy to Your Disciples by the promise of the Holy Spirit.\nThrough the blessing, they were assured\nthat You are the Son of God,\nthe Redeemer of the world!' },
    ],
    kontakia: [
      { tone: 6, rubric: 'Kontakion of the Ascension, Tone 6:', text: 'When You had fulfilled the dispensation for our sake,\nand united earth to heaven:\nYou ascended in glory, O Christ our God,\nnot being parted from those who love You,\nbut remaining with them and crying:\n"I am with you, and there is no one against you!"' },
    ],
    prokeimenon: { tone: 7, refrain: 'Be exalted, O God, above the heavens; and Your glory be over all the earth!', verse: 'My heart is steadfast, O God, my heart is steadfast. I will sing and make melody.' },
    alleluia: { tone: 2, verses: ['God has gone up with a shout; the Lord with the sound of a trumpet!', 'Oh, clap your hands, all you peoples. Shout to God with loud songs of joy!'] },
    entranceHymn: 'God has gone up with a shout, the Lord with the sound of a trumpet. O Son of God, who ascended in glory, save us who sing to Thee: Alleluia!',
    megalynarion: 'Magnify, O my soul, Christ the Giver of Life, who has ascended from earth to heaven! We the faithful, with one accord, magnify thee, the Mother of God, who, beyond reason and understanding, ineffably gave birth in time to the Timeless One.',
    communionHymn: 'God is gone up with a shout, the Lord with the sound of a trumpet. Alleluia.',
  },

  pentecost: {
    type: 'lord',
    label: 'The Descent of the Holy Spirit (Pentecost)',
    antiphons: {
      first: {
        refrain: 'Through the prayers of the Theotokos, O Savior, save us!',
        verses: [
          'The heavens are telling the glory of God, and the firmament proclaims His handiwork.',
          'Day to day pours forth speech, and night to night declares knowledge.',
          'Their proclamation has gone out into all the earth, and their words to the ends of the universe.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      second: {
        refrain: 'O Gracious Comforter, save us who sing to Thee: Alleluia!',
        verses: [
          'The Lord answer thee in the day of trouble! The Name of the God of Jacob protect thee!',
          'May He send thee help from the sanctuary, and give thee support from Zion.',
          'May He remember all thine offerings, and fulfill all thy plans.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      third: {
        refrain: 'Blessed art Thou, O Christ our God, who hast revealed the fishermen as most wise by sending down upon them the Holy Spirit; through them Thou didst draw the world into Thy net. O Lover of Man, glory to Thee!',
        verses: [
          'In Thy strength the king rejoices, O Lord, and exults greatly in Thy salvation.',
          'Thou hast given him his heart\'s desire, and hast not withheld the request of his lips.',
          'For Thou dost meet him with goodly blessings; Thou dost set a crown of fine gold upon his head.',
        ],
      },
    },
    troparia: [
      { tone: 8, rubric: 'Troparion of Pentecost, Tone 8:', text: 'Blessed art Thou, O Christ our God,\nwho hast revealed the fishermen as most wise\nby sending down upon them the Holy Spirit;\nthrough them Thou didst draw the world into Thy net.\nO Lover of Man, glory to Thee!' },
    ],
    kontakia: [
      { tone: 8, rubric: 'Kontakion of Pentecost, Tone 8:', text: 'When the Most High came down and confused the tongues,\nHe divided the nations;\nbut when He distributed the tongues of fire,\nHe called all to unity.\nTherefore, with one voice, we glorify the All-holy Spirit!' },
    ],
    prokeimenon: { tone: 8, refrain: 'Their proclamation has gone out into all the earth, and their words to the ends of the universe.', verse: 'The heavens declare the glory of God, and the firmament proclaims the work of His hands.' },
    alleluia: { tone: 1, verses: ['By the Word of the Lord were the heavens made, and all the host of them by the Spirit of His mouth.', 'The Lord looked down from heaven; He saw all the sons of men.'] },
    entranceHymn: 'Be exalted, O Lord, in Thy strength! We will sing and praise Thy power. O Gracious Comforter, save us who sing to Thee: Alleluia!',
    megalynarion: 'Rejoice, O Queen, glory of mothers and virgins! For no tongue, be it ever so gifted, hath power to praise thee worthily. Every mind is dizzied in attempting to comprehend thy childbearing. Wherefore, with one accord, we glorify thee!',
    communionHymn: 'Let Thy good Spirit lead me on a level path. Alleluia.',
  },

  // ── Feasts of the Theotokos (typical antiphons, special megalynarion) ───────

  nativityTheotokos: {
    type: 'theotokos',
    label: 'The Nativity of the Theotokos',
    troparia: [
      { tone: 4, rubric: 'Troparion of the Nativity of the Theotokos, Tone 4:', text: 'Your Nativity, O Virgin,\nhas proclaimed joy to the whole universe!\nThe Sun of Righteousness, Christ our God,\nhas shone from you, O Theotokos!\nBy annulling the curse,\nHe bestowed a blessing.\nBy destroying death, He has granted us eternal Life.' },
    ],
    kontakia: [
      { tone: 4, rubric: 'Kontakion of the Nativity of the Theotokos, Tone 4:', text: 'By your Nativity, O Most Pure Virgin,\nJoachim and Anna are freed from barrenness;\nAdam and Eve, from the corruption of death.\nAnd we, your people, freed from the guilt of sin, celebrate and sing to you:\n"The barren woman gives birth to the Theotokos, the nourisher of our life."' },
    ],
    prokeimenon: { tone: 3, refrain: 'My soul magnifies the Lord, and my spirit rejoices in God my Savior.', verse: 'For He has regarded the low estate of His handmaiden; for behold, henceforth all generations will call me blessed.' },
    alleluia: { tone: 8, verses: ['Hear, O daughter, and consider and incline your ear.', 'The rich among the people shall entreat your favor.'] },
    megalynarion: 'Magnify, O my soul, the most glorious birth of the Mother of God! Virginity is foreign to mothers; childbearing is strange for virgins. But in thee, O Theotokos, both were accomplished. For this all the earthly nations unceasingly magnify thee.',
    communionHymn: 'I will receive the cup of salvation and call on the Name of the Lord. Alleluia.',
  },

  entryTheotokos: {
    type: 'theotokos',
    label: 'The Entry of the Theotokos into the Temple',
    troparia: [
      { tone: 4, rubric: 'Troparion of the Entry of the Theotokos, Tone 4:', text: 'Today is the prelude of the good will of God,\nof the preaching of the salvation of mankind.\nThe Virgin appears in the temple of God,\nin anticipation proclaiming Christ to all.\nLet us rejoice\nand sing to her:\n"Rejoice, O Fulfillment of the Creator\'s dispensation."' },
    ],
    kontakia: [
      { tone: 4, rubric: 'Kontakion of the Entry of the Theotokos, Tone 4:', text: 'The most pure Temple of the Savior;\nthe precious Chamber and Virgin;\nthe sacred Treasure of the glory of God,\nis presented today to the house of the Lord.\nShe brings with her the grace of the Spirit,\ntherefore, the angels of God praise her:\n"Truly this woman is the abode of heaven."' },
    ],
    prokeimenon: { tone: 3, refrain: 'My soul magnifies the Lord, and my spirit rejoices in God my Savior.', verse: 'For He has regarded the low estate of His handmaiden; for behold, henceforth all generations will call me blessed.' },
    alleluia: { tone: 8, verses: ['Hear, O daughter, and consider and incline your ear.', 'The rich among the people shall entreat your favor.'] },
    megalynarion: 'The angels beheld the entrance of the Pure One and were amazed. How has the Virgin entered into the Holy of Holies? Since she is a living Ark of God, let no profane hand touch the Theotokos. But let the lips of believers unceasingly sing to her, praising her in joy with the angel\'s song: Truly, thou art more exalted than all, O pure Virgin!',
    communionHymn: 'I will receive the cup of salvation and call on the Name of the Lord. Alleluia.',
  },

  annunciation: {
    type: 'theotokos',
    label: 'The Annunciation',
    troparia: [
      { tone: 4, rubric: 'Troparion of the Annunciation, Tone 4:', text: 'Today is the beginning of our salvation,\nthe revelation of the eternal mystery!\nThe Son of God becomes the Son of the Virgin\nas Gabriel announces the coming of Grace.\nTogether with him let us cry to the Theotokos:\nHail, O Full of Grace,\nthe Lord is with You!' },
    ],
    kontakia: [
      { tone: 8, rubric: 'Kontakion of the Annunciation, Tone 8:', text: 'O Victorious Leader of Triumphant Hosts!\nWe, your servants, delivered from evil, sing our grateful thanks to you, O Theotokos!\nAs you possess invincible might, set us free from every calamity\nso that we may sing: Hail, O unwedded Bride!' },
    ],
    prokeimenon: { tone: 4, refrain: 'From day to day proclaim the salvation of our God!', verse: 'Sing to the Lord a new song; sing to the Lord, all the earth!' },
    alleluia: { tone: 1, verses: ['He descends like rain upon the fleece, like raindrops that water the earth.', 'May His Name be blessed forever; may His Name continue as long as the sun!'] },
    megalynarion: 'O earth, announce good tidings of great joy: O heavens, praise the glory of God! Since she is a living Ark of God, let no profane hand touch the Theotokos. But let the lips of believers unceasingly sing to her, praising her in joy with the angel\'s song: Rejoice, O Lady, full of grace, the Lord is with thee!',
    communionHymn: 'The Lord has chosen Zion; He has desired it for His habitation. Alleluia.',
  },

  dormition: {
    type: 'theotokos',
    label: 'The Dormition of the Theotokos',
    troparia: [
      { tone: 1, rubric: 'Troparion of the Dormition, Tone 1:', text: 'In giving birth, you preserved your virginity,\nand in falling asleep you did not forsake the world, O Theotokos.\nYou passed into life as the Mother of Life,\nand by your prayers, you deliver our souls from death.' },
    ],
    kontakia: [
      { tone: 2, rubric: 'Kontakion of the Dormition, Tone 2:', text: 'Neither the tomb, nor death had power over the Theotokos,\nwho is unsleeping in her intercessions and an unchanging hope in her protection.\nFor as the Mother of Life,\nshe was translated into life by Him who dwelt in her ever-virginal womb.' },
    ],
    prokeimenon: { tone: 3, refrain: 'My soul magnifies the Lord, and my spirit rejoices in God my Savior.', verse: 'For He has regarded the low estate of His handmaiden; for behold, henceforth all generations will call me blessed.' },
    alleluia: { tone: 8, verses: ['Arise, O Lord, into Thy resting place, Thou and the Ark of Thy holiness.', 'The Lord has sworn in truth to David, and He will not annul it.'] },
    megalynarion: 'The Angels, as they looked upon the Dormition of the Virgin, were struck with wonder, seeing how the Virgin went up from earth to heaven. The limits of nature are overcome in thee, O Pure Virgin: for birthgiving remains virginal, and life is united to death; a virgin after childbearing and alive after death, thou dost ever save thine inheritance, O Theotokos.',
    communionHymn: 'I will receive the cup of salvation and call on the Name of the Lord. Alleluia.',
  },

  // ── Pascha (Feast of Feasts) ────────────────────────────────────────────────

  pascha: {
    type: 'lord',
    label: 'The Holy Pascha — Resurrection of Christ',
    antiphons: {
      first: {
        refrain: 'Through the prayers of the Theotokos, O Savior, save us.',
        verses: [
          'Make a joyful noise to God, all the earth! Sing the glory of His name; make His praise glorious!',
          'Say to God: How awesome are Thy deeds! So great is Thy power that Thine enemies cringe before Thee.',
          'Let all the earth worship Thee and praise Thee; let it praise Thy name, O Most High!',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      second: {
        refrain: 'O Son of God, risen from the dead, save us who sing to Thee: Alleluia!',
        verses: [
          'God be merciful unto us, and bless us; and cause His face to shine upon us.',
          'That Thy way may be known upon earth, Thy saving health among all nations.',
          'Let the people praise Thee, O God; let all the people praise Thee.',
        ],
        glory: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.',
      },
      third: {
        refrain: 'Christ is risen from the dead, trampling down death by death, and upon those in the tombs bestowing life!',
        verses: [
          'Let God arise, let His enemies be scattered; let them also that hate Him flee before Him.',
          'As smoke is driven away, so drive them away; as wax melteth before the fire.',
          'So let the wicked perish at the presence of God. But let the righteous be glad.',
        ],
      },
    },
    troparia: [
      { tone: 5, rubric: 'Troparion of Pascha, Tone 5:', text: 'Christ is risen from the dead,\ntrampling down death by death,\nand upon those in the tombs bestowing life!' },
    ],
    kontakia: [
      { tone: 8, rubric: 'Kontakion of Pascha, Tone 8:', text: 'Thou didst descend into the tomb, O Immortal,\nThou didst destroy the power of death.\nIn victory didst Thou arise, O Christ God,\nproclaiming, "Rejoice!" to the Myrrhbearing Women,\ngranting peace to Thine Apostles, and bestowing Resurrection on the fallen.' },
    ],
    prokeimenon: { tone: 8, refrain: 'This is the day which the Lord has made; let us rejoice and be glad in it!', verse: 'O give thanks to the Lord, for He is good, for His mercy endures forever.' },
    alleluia: { tone: 4, verses: ['Thou, O Lord, shalt arise and have compassion on Zion.', 'The Lord looked down from heaven to the earth.'] },
    entranceHymn: 'In the gathering places bless ye God the Lord, from the wellsprings of Israel! O Son of God, risen from the dead, save us who sing to Thee: Alleluia!',
    megalynarion: 'The Angel cried to the Lady full of grace: Rejoice, O pure Virgin! Again I say: Rejoice! Thy Son is risen from His three days in the tomb! With Himself He has raised all the dead! Rejoice, all ye people! Shine! Shine! O new Jerusalem! The glory of the Lord has shone on thee! Exult now and be glad, O Zion! Be radiant, O pure Theotokos, in the Resurrection of thy Son!',
    communionHymn: 'Receive ye the Body of Christ; taste ye the Fountain of immortality. Alleluia.',
  },
};

/**
 * Builds a liturgy spec object from orthocal.info API data.
 * Used when no hand-authored liturgy key exists for the date.
 *
 * Provides: variant, entrance hymn, epistle (with full text), gospel (with full text),
 *           megalynarion, communion hymn, dismissal (with day-of-week patron),
 *           troparia/kontakia from Octoechos + Menaion DB.
 * Deferred:  (none — all major sections now populated for ordinary Sundays).
 */
// ─── Matins Spec Builder ──────────────────────────────────────────────────────

/**
 * Builds the matins spec for a given date from available menaion data.
 * Currently supports:
 *   - Fixed-calendar Great Feasts with menaion matins data (e.g. Annunciation)
 *
 * Returns null if no matins data is available for the date.
 */

/**
 * Build Sunday Matins spec from Octoechos data.
 * Sundays always use the Great Doxology path and have a Gospel.
 */
function _buildSundayMatinsFromOctoechos(tone, season, menaionData, date) {
  const tk = `tone${tone}`;
  const oct = sources.octoechos[tk];
  if (!oct?.sunday?.matins) return null;

  const matins = oct.sunday.matins;
  const vespers = oct.saturday?.vespers;

  // ── Resurrectional troparion (from Saturday Vespers data) ──────────────
  const troparionRaw = vespers?.troparion;
  const troparionText = typeof troparionRaw === 'object' ? troparionRaw?.text : troparionRaw;

  // ── Sessional hymns → sedalion array ──────────────────────────────────
  // The assembler expects spec.sedalion[0] = after K2, spec.sedalion[1] = after K3
  const sedalion = [];
  if (matins.sessionalHymns?.afterKathisma2?.[0]) {
    const h = matins.sessionalHymns.afterKathisma2[0];
    sedalion[0] = { text: h.text, tone, source: 'octoechos', label: 'Sessional Hymn' };
  }
  if (matins.sessionalHymns?.afterKathisma3?.[0]) {
    const h = matins.sessionalHymns.afterKathisma3[0];
    sedalion[1] = { text: h.text, tone, source: 'octoechos', label: 'Sessional Hymn' };
  }

  // ── Antiphons of Degrees ──────────────────────────────────────────────
  // Combine all antiphon troparia into one text block
  let antiphonsText = '';
  if (matins.antiphonsOfDegrees) {
    const parts = [];
    matins.antiphonsOfDegrees.forEach((ant, i) => {
      parts.push(`Antiphon ${i + 1}`);
      ant.troparia.forEach(t => parts.push(t));
    });
    antiphonsText = parts.join('\n\n');
  }

  // ── Prokeimenon ───────────────────────────────────────────────────────
  const prokeimenon = matins.prokeimenon ? {
    refrain: matins.prokeimenon.refrain,
    verse: matins.prokeimenon.verse,
    tone,
  } : null;

  // ── Canon irmoi + troparia → canon spec ──────────────────────────────
  const canonSpec = { tone };
  if (matins.canonIrmoi) {
    for (const [odeStr, irmosText] of Object.entries(matins.canonIrmoi)) {
      canonSpec[`ode${odeStr}`] = { irmos: irmosText };
    }
  }
  if (matins.canonTroparia) {
    for (const [odeStr, troparia] of Object.entries(matins.canonTroparia)) {
      const odeKey = `ode${odeStr}`;
      if (!canonSpec[odeKey]) canonSpec[odeKey] = {};
      canonSpec[odeKey].troparia = troparia;
    }
  }
  // Kontakion from Octoechos (resurrectional)
  const kontakionRaw = vespers?.kontakion || oct.sunday?.liturgy?.kontakion;
  if (kontakionRaw) {
    canonSpec.kontakion = typeof kontakionRaw === 'object'
      ? kontakionRaw : { text: kontakionRaw, tone };
  }

  const matinsSource = matins._source || 'stSergius-octoechos';

  // ── Post-Gospel sticheron ─────────────────────────────────────────────
  const postGospelSticheron = matins.postGospelSticheron ? {
    text: matins.postGospelSticheron,
    tone: 6, // always Tone 6
    source: 'octoechos',
    _source: matinsSource,
  } : null;

  // ── Lauds stichera ───────────────────────────────────────────────────
  const lauds = matins.laudsStichera ? {
    read: false,
    tone,
    stichera: matins.laudsStichera.map(s => ({
      text: s.text,
      verse: s.verse,
      tone,
    })),
  } : null;

  // ── Build spec ────────────────────────────────────────────────────────
  const spec = {
    isSunday: true,
    feastRank: null,
    tone,
    useSmallDoxology: false,
    kathismaCount: 2, // Sundays: Kathisma 2 and 3 (17th read separately at Vigil)
    kathismaNumbers: getMatinsKathismata('sunday', season),
    sedalion,
  };

  if (troparionText) {
    spec.troparion = { text: troparionText, tone };
  }

  if (antiphonsText) {
    spec.antiphons = { text: antiphonsText, tone, _source: matinsSource };
  }

  if (prokeimenon) {
    prokeimenon._source = matinsSource;
    spec.prokeimenon = prokeimenon;
  }

  // ── Eothinon cycle (Gospel, Exapostilarion, Doxastikon) ────────────────
  const eothinonNum = date ? getEothinon(date) : null;
  const eothinonData = eothinonNum ? sources.eothinon?.[String(eothinonNum)] : null;

  if (eothinonData) {
    spec.gospel = {
      reading: eothinonData.gospel.reading,
      text: null, // Scripture text not yet sourced
      source: 'eothinon',
      _eothinon: eothinonNum,
      _source: eothinonData._source,
    };

    // Exapostilarion + theotokion
    spec.exapostilaria = [
      {
        text: eothinonData.exapostilarion,
        tone: eothinonData.tone,
        label: `Eothinon ${eothinonNum}`,
        source: 'eothinon',
        _source: eothinonData._source,
      },
      ...(eothinonData.theotokion ? [{
        text: eothinonData.theotokion,
        tone: eothinonData.tone,
        label: 'Theotokion',
        source: 'eothinon',
        _source: eothinonData._source,
      }] : []),
    ];

    // Post-Gospel sticheron is tone-6 fixed (from Octoechos), not eothinon-specific
    if (postGospelSticheron) {
      spec.postGospelSticheron = postGospelSticheron;
    }

    // Lauds doxastikon (the eothinon sticheron sung after "Glory..." at Lauds)
    if (lauds && eothinonData.doxastikon) {
      lauds.doxastikon = {
        text: eothinonData.doxastikon,
        tone: eothinonData.tone,
        author: `Eothinon ${eothinonNum}`,
        _source: eothinonData._source,
      };
    }
  } else {
    // No eothinon data (Triodion period or missing data)
    spec.gospel = {
      reading: eothinonNum
        ? `[Eothinon ${eothinonNum} — data not loaded]`
        : '[Sunday Matins Gospel — Eothinon suspended during Triodion]',
      text: null,
      source: 'eothinon',
    };

    if (postGospelSticheron) {
      spec.postGospelSticheron = postGospelSticheron;
    }
  }

  spec.canon = canonSpec;

  if (lauds) {
    spec.lauds = lauds;
  }

  return spec;
}

function buildMatinsSpec(dateStr, date, dow, season, tone) {
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const mm = String(mo).padStart(2, '0');
  const dd = String(dy).padStart(2, '0');

  // ── Check for great feast menaion data ──────────────────────────────────
  const feastKey = getGreatFeastKey(date);
  const monthNames = ['', 'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const menaionKey = `${monthNames[mo]}-${dd}`;
  const menaionPath = path.join(__dirname, 'variable-sources', 'menaion', `${menaionKey}.json`);

  let menaionData = null;
  if (fs.existsSync(menaionPath)) {
    menaionData = loadJSON(`variable-sources/menaion/${menaionKey}.json`);
  }

  const isSunday = dow === 'sunday';
  const isLent = season === 'greatLent';
  const isLentenWeekday = isLent && !isSunday && dow !== 'saturday';

  // ── Sunday Matins from Octoechos ──────────────────────────────────────────
  if (isSunday && (!menaionData || !menaionData.matins)) {
    return _buildSundayMatinsFromOctoechos(tone, season, menaionData, date);
  }

  // Only proceed if we have matins data in the menaion file
  if (!menaionData || !menaionData.matins) return null;

  const mat = menaionData.matins;

  // ── Determine doxology type ─────────────────────────────────────────────
  // During Lent on weekdays, even great feasts use the Small (read) Doxology
  const useSmallDoxology = isLentenWeekday;

  // ── Build the spec ──────────────────────────────────────────────────────
  const spec = {
    isSunday,
    feastRank: menaionData._meta?.feastRank || (feastKey ? 'greatFeast' : null),
    feastType: menaionData._meta?.feastType || null,
    tone: menaionData._meta?.tone || tone,
    alleluia: false, // great feasts override Lenten Alleluia
    useSmallDoxology,
  };

  // Troparion
  if (menaionData.troparion) {
    spec.troparion = menaionData.troparion;
  }

  // Kathismata
  const kathNums = getMatinsKathismata(dow, season);
  spec.kathismaCount = kathNums.length || (isSunday ? 3 : 2);
  spec.kathismaNumbers = kathNums;

  // Magnification (at Polyeleios)
  if (mat.magnification) {
    spec.magnification = mat.magnification;
  }

  // Prokeimenon
  if (mat.prokeimenon) {
    spec.prokeimenon = mat.prokeimenon;
  }

  // Gospel
  if (mat.gospel) {
    spec.gospel = mat.gospel;
  }

  // Post-Gospel sticheron
  if (mat.postGospelSticheron) {
    spec.postGospelSticheron = mat.postGospelSticheron;
  }

  // Canon
  if (mat.canon) {
    const canonSpec = {
      tone: mat.canon.tone || spec.tone,
      author: mat.canon.author,
    };
    // Copy ode data
    for (const [k, v] of Object.entries(mat.canon)) {
      if (k.startsWith('ode')) canonSpec[k] = v;
    }
    // Sessional hymns after Ode 3
    if (mat.sessionalHymns) {
      canonSpec.sedalenAfterOde3 = mat.sessionalHymns;
    } else if (mat.sedalen) {
      canonSpec.sedalenAfterOde3 = mat.sedalen;
    }
    // Kontakion/ikos (placed inside canon spec so they appear after Ode 6)
    if (menaionData.kontakion) {
      canonSpec.kontakion = menaionData.kontakion;
    }
    // Skip Magnificat on great feasts that have their own Ode 9 megalynarion
    if (mat.canon.ode9?.megalynarion) {
      canonSpec.skipMagnificat = true;
    }
    spec.canon = canonSpec;
  }

  // Exapostilaria
  if (mat.exapostilaria) {
    spec.exapostilaria = mat.exapostilaria;
  }

  // Lauds
  if (mat.lauds) {
    spec.lauds = {
      read: isLentenWeekday, // read on Lenten weekdays, sung otherwise
      tone: mat.lauds.stichera?.[0]?.tone || spec.tone,
      stichera: mat.lauds.stichera,
      doxastikon: mat.lauds.doxastikon,
    };
  }

  // Aposticha (Lenten weekday only)
  if (isLentenWeekday && mat.aposticha) {
    spec.aposticha = mat.aposticha;
  }

  // Final troparion (for aposticha path)
  if (useSmallDoxology && menaionData.troparion) {
    spec.finalTroparion = menaionData.troparion;
  }

  return spec;
}

function buildLiturgyFromOrthocal(orthocalData, dateStr, srcs) {
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const date    = new Date(Date.UTC(yr, mo - 1, dy));
  const dow     = getDayOfWeek(date);
  const tone    = getTone(date);
  const variant = getLiturgyVariant(date);
  const isBasil  = variant === 'basil';
  const isSunday = dow === 'sunday';
  const tk       = `tone${tone}`;

  // ── Scripture readings from the API ──────────────────────────────────────────
  const readings   = orthocalData.readings || [];
  const epistleR   = readings.find(r => r.source === 'Epistle');
  const gospelR    = readings.find(r => r.source === 'Gospel');

  // Extract full passage text from orthocal's passage[] array
  function extractPassageText(reading) {
    if (!reading?.passage?.length) return null;
    return reading.passage.map(v => v.content).join(' ');
  }

  // ── Great Feast + season detection (needed by troparia, prokeimenon, etc.) ──
  const season = getLiturgicalSeason(date);
  const feastKey = getGreatFeastKey(date);
  const feast    = feastKey ? GREAT_FEAST_VARIANTS[feastKey] : null;

  // ── Troparia & Kontakia ──────────────────────────────────────────────────────
  // Great Feasts: use only the feast's own troparia/kontakia (no resurrectional, no Menaion)
  const troparia = [];
  const kontakia = [];

  if (feast?.troparia) {
    troparia.push(...feast.troparia);
  } else {
    // Start with resurrectional troparion (Sundays)
    const troparionRaw  = srcs.octoechos?.[tk]?.saturday?.vespers?.troparion;
    const troparionText = typeof troparionRaw === 'object' ? troparionRaw?.text : troparionRaw;
    if (isSunday && troparionText) {
      troparia.push({ tone, rubric: `Troparion of the Resurrection, Tone ${tone}:`, text: troparionText });
    }

    // Inject Menaion troparia from DB
    const ranked = getMenaionRanked(mo, dy);
    if (ranked?.notable) {
      for (const comm of ranked.notable) {
        const trop = comm.troparia.find(t => t.type === 'troparion');
        if (trop) {
          troparia.push({ tone: trop.tone, rubric: `Troparion of ${comm.title}, Tone ${trop.tone}:`, text: trop.text });
        }
      }
    }
  }

  if (feast?.kontakia) {
    kontakia.push(...feast.kontakia);
  } else {
    // Start with resurrectional kontakion (Sundays)
    const kontakionRaw = srcs.octoechos?.[tk]?.saturday?.vespers?.kontakion;
    if (isSunday && kontakionRaw) {
      const kText = typeof kontakionRaw === 'object' ? kontakionRaw.text : kontakionRaw;
      const kTone = typeof kontakionRaw === 'object' ? (kontakionRaw.tone ?? tone) : tone;
      if (kText) kontakia.push({ tone: kTone, rubric: `Kontakion of the Resurrection, Tone ${kTone}:`, text: kText });
    }

    // Inject Menaion kontakia from DB
    const ranked = getMenaionRanked(mo, dy);
    if (ranked?.notable) {
      for (const comm of ranked.notable) {
        const kont = comm.troparia.find(t => t.type === 'kontakion');
        if (kont) {
          kontakia.push({ tone: kont.tone, rubric: `Kontakion of ${comm.title}, Tone ${kont.tone}:`, text: kont.text });
        }
      }
    }
  }

  // If no kontakia at all, add the default Theotokos kontakion as the final kontakion
  // (OCA rubric: when no other kontakion is appointed, "O protection of Christians..." is sung)
  // This is already handled by the dismissal troparia section, so leave kontakia empty if none found.

  // ── Communion Hymn ───────────────────────────────────────────────────────────
  const COMMUNION_HYMNS = {
    sunday:    'Praise the Lord from the heavens, praise Him in the highest. Alleluia.',
    monday:    'He maketh His angels spirits, and His ministers a flame of fire. Alleluia.',
    tuesday:   'The righteous shall be in everlasting remembrance; he shall not fear evil tidings. Alleluia.',
    wednesday: 'O taste and see that the Lord is good. Alleluia.',
    thursday:  'Their proclamation has gone out into all the earth, and their words to the ends of the universe. Alleluia.',
    friday:    'Salvation is created in the midst of the earth, O God. Alleluia.',
    saturday:  'Rejoice in the Lord, O ye righteous; praise befits the just. Alleluia.',
  };

  // DAY_PATRONS moved to module scope

  // ── Sunday Prokeimena (by Octoechos tone — correct for ordinary-time Sundays) ─
  // Source: OCA Department of Liturgical Music & Translations service texts
  const SUNDAY_PROKEIMENA = {
    1: { refrain: 'Let Thy mercy, O Lord, be upon us, as we have set our hope on Thee!',
         verse: 'Rejoice in the Lord, O you righteous! Praise befits the just!' },
    2: { refrain: 'The Lord is my strength and my song; He has become my salvation.',
         verse: 'The Lord has chastened me sorely, but He has not given me over to death.' },
    3: { refrain: 'Sing praises to our God, sing praises; sing praises to our King, sing praises.',
         verse: 'Clap your hands, all ye nations; shout unto God with the voice of rejoicing.' },
    4: { refrain: 'O how magnified are Thy works, O Lord; in wisdom hast Thou made them all.',
         verse: 'Bless the Lord, O my soul; O Lord my God, Thou art very great.' },
    5: { refrain: 'Thou, O Lord, shalt protect us and preserve us from this generation forever.',
         verse: 'Save me, O Lord, for there is no longer any that is godly!' },
    6: { refrain: 'O Lord, save Thy people, and bless Thine inheritance!',
         verse: 'To Thee, O Lord, will I call. O my God, be not silent to me!' },
    7: { refrain: 'The Lord shall give strength to His people. The Lord shall bless His people with peace.',
         verse: 'Offer to the Lord, O you sons of God! Offer young rams to the Lord!' },
    8: { refrain: 'Pray and make your vows before the Lord our God.',
         verse: 'In Judah is God known; His name is great in Israel.' },
  };

  // ── Sunday Alleluia verses (by Octoechos tone) ────────────────────────────────
  const SUNDAY_ALLELUIA = {
    1: ['God gives vengeance unto me, and subdues people under me.',
        'He magnifies the salvation of the King and deals mercifully with David, His anointed, and his seed forever.'],
    2: ['May the Lord hear thee in the day of trouble! May the name of the God of Jacob protect thee!',
        'Save the King, O Lord, and hear us on the day we call!'],
    3: ['In Thee, O Lord, have I hoped; let me never be put to shame.',
        'Be Thou a God of protection for me, a house of refuge in order to save me.'],
    4: ['Go forth, and prosper, and reign, because of truth and meekness and righteousness.',
        'Thou lovest righteousness and hatest iniquity.'],
    5: ['I will sing of Thy mercies, O Lord, forever; with my mouth I will proclaim Thy truth from generation to generation.',
        'For Thou hast said: Mercy will be established forever; Thy truth will be prepared in the heavens.'],
    6: ['He who dwelleth in the shelter of the Most High will abide in the shadow of the heavenly God.',
        'He will say to the Lord: My Protector and my Refuge; my God, in Whom I trust.'],
    7: ['It is good to give thanks to the Lord, to sing praises to Thy Name, O Most High.',
        'To declare Thy mercy in the morning, and Thy truth by night.'],
    8: ['Come, let us rejoice in the Lord; let us make a joyful noise to God our Savior.',
        'Let us come before His face with thanksgiving; let us make a joyful noise unto Him with psalms.'],
  };

  // ── Weekday Prokeimena (fixed by day-of-week, not tone) ─────────────────────
  // Source: Ponomar / OCA tradition — daily commemorations
  const WEEKDAY_PROKEIMENA = {
    monday:    { tone: 4, refrain: 'Who maketh His angels spirits, His servers a flaming fire.',
                          verse: 'Bless the Lord, O my soul; O Lord my God, Thou art become very great.' },
    tuesday:   { tone: 7, refrain: 'The righteous shall rejoice in the Lord, and he shall hope in Him.',
                          verse: 'Hear my prayer, O God, when I pray unto Thee.' },
    wednesday: { tone: 3, refrain: 'My soul doth magnify the Lord, and my spirit hath rejoiced in God my Savior.',
                          verse: 'For He hath looked upon the humility of His servant; for behold from henceforth all generations shall bless me.' },
    thursday:  { tone: 8, refrain: 'Their sound is gone forth into all the earth; their sayings to the ends.',
                          verse: 'The heavens declare the glory of God; and the firmament proclaimeth His handiwork.' },
    friday:    { tone: 7, refrain: 'Exalt ye the Lord our God, and worship at His footstool, for He is holy.',
                          verse: 'The Lord hath reigned, let the people rage.' },
    saturday:  { tone: 8, refrain: 'Be glad in the Lord, and rejoice, ye righteous.',
                          verse: 'Blessed are they whose transgressions are forgiven, and whose sins are covered.' },
  };

  // ── Weekday Alleluia (fixed by day-of-week) ────────────────────────────────
  const WEEKDAY_ALLELUIA = {
    monday:    { tone: 5, verses: ['Praise ye the Lord, all His angels; praise ye Him all His powers.',
                                   'For He spoke, and they came into being; He commanded and they were created.'] },
    tuesday:   { tone: 4, verses: ['The righteous shall flourish like the palm tree; like the cedars of Lebanon.',
                                   'They that are planted in the house of the Lord shall flourish in the courts.'] },
    wednesday: { tone: 8, verses: ['Hearken, O Daughter, and see, and incline thine ear.',
                                   'The rich among the people of the earth shall entreat thy countenance.'] },
    thursday:  { tone: 1, verses: ['The heavens confess Thy wonders, O Lord, Thy truth in the church of the saints.',
                                   'God, who is glorified in the council of the saints.'] },
    friday:    { tone: 1, verses: ['Remember Thy congregation, which Thou hast possessed from the beginning.',
                                   'God is our King before the ages; He hath wrought salvation in the midst.'] },
    saturday:  { tone: 4, verses: ['The righteous cried, and the Lord heard them, and delivered them out of all tribulations.',
                                   'Many are the tribulations of the righteous, but out of them all will the Lord deliver them.',
                                   'Blessed are they whom Thou hast chosen and taken, O Lord; their memory is from generation to generation.'] },
  };

  // ── Lenten/Special Sunday Prokeimena & Alleluia ─────────────────────────────
  // During Great Lent the prokeimenon follows the Apostolos (Epistle lectionary),
  // NOT the weekly Octoechos tone. Each Lenten Sunday has a fixed prokeimenon.
  // Source: OCA 2026 service texts, verified against Ponomar/Apostolos.
  const LENTEN_SUNDAY_PROKEIMENA = {
    meatfare:   { tone: 3, refrain: 'Great is our Lord, and abundant in power; His understanding is beyond measure.',
                           verse: 'Praise the Lord! For it is good to sing praises to our God!' },
    cheesefare: { tone: 8, refrain: 'Pray and make your vows before the Lord, our God!',
                           verse: 'In Judah God is known; His name is great in Israel.' },
    1: { tone: 4, refrain: 'Blessed art Thou, O Lord God of our fathers, and praised and glorified is Thy Name forever!',
                  verse: 'For Thou art just in all that Thou hast done for us!' },
    2: { tone: 5, refrain: 'Thou, O Lord, shalt protect us and preserve us from this generation forever.',
                  verse: 'Save me, O Lord, for there is no longer any that is godly!' },
    3: { tone: 6, refrain: 'O Lord, save Thy people, and bless Thine inheritance!',
                  verse: 'To Thee, O Lord, will I call. O my God, be not silent to me!' },
    4: { tone: 8, refrain: 'Pray and make your vows before the Lord, our God!',
                  verse: 'In Judah God is known; His Name is great in Israel.' },
    5: { tone: 1, refrain: 'Let Thy mercy, O Lord, be upon us, as we have set our hope on Thee!',
                  verse: 'Rejoice in the Lord, O you righteous! Praise befits the just!' },
  };
  const LENTEN_SUNDAY_ALLELUIA = {
    meatfare:   { tone: 8, verses: ['Come, let us rejoice in the Lord! Let us make a joyful noise to God our Savior!',
                                    'Let us come before His presence with thanksgiving; let us make a joyful noise to Him with songs of praise.'] },
    cheesefare: { tone: 6, verses: ['It is good to give thanks to the Lord, to sing praises to Thy Name, O Most High.',
                                    'To declare Thy mercy in the morning, and Thy truth by night.'] },
    1: { tone: 4, verses: ['Moses and Aaron were among His priests; Samuel also was among those who called on His Name.',
                            'They called to the Lord and He answered them.'] },
    2: { tone: 6, verses: ['He who dwelleth in the shelter of the Most High will abide in the shadow of the heavenly God.',
                            'He will say to the Lord: "My Protector and my Refuge; my God, in Whom I trust."'] },
    3: { tone: 8, verses: ['Remember Thy congregation, which Thou hast purchased of old!',
                            'God is our King before the ages; He has worked salvation in the midst of the earth!'] },
    4: { tone: 8, verses: ['Come, let us rejoice in the Lord! Let us make a joyful noise to God our Savior!',
                            'Let us come before His face with thanksgiving; let us make a joyful noise to Him with songs of praise!'] },
    5: { tone: 1, verses: ['God gives vengeance unto me, and subdues people under me.',
                            'He magnifies the salvation of the King and deals mercifully with David, His anointed, and his seed forever.'] },
  };

  // ── Cherubic Hymn override ───────────────────────────────────────────────────
  let cherubicOverride = null;
  if (season === 'holyWeek' && dow === 'thursday') cherubicOverride = 'great-thursday';
  if (season === 'holyWeek' && dow === 'saturday') cherubicOverride = 'great-saturday';

  // ── Build prokeimenon & alleluia ────────────────────────────────────────────
  let prokeimenon = null;
  let alleluia = null;

  // Determine Lenten Sunday key (if applicable)
  let lentenKey = null;
  if (isSunday && season === 'greatLent') {
    lentenKey = getWeekOfLent(date);
  } else if (isSunday && season === 'preLenten') {
    const pascha = calculatePascha(date.getUTCFullYear());
    const DAY = 86400000;
    const cheesefareDate = new Date(pascha.getTime() - 49 * DAY);
    const meatfareDate   = new Date(pascha.getTime() - 56 * DAY);
    if (date.getTime() === cheesefareDate.getTime()) lentenKey = 'cheesefare';
    if (date.getTime() === meatfareDate.getTime())   lentenKey = 'meatfare';
  }

  // Great Feast prokeimenon/alleluia override (highest priority)
  if (feast?.prokeimenon) {
    const fp = feast.prokeimenon;
    prokeimenon = { tone: fp.tone, refrain: fp.refrain, verse: fp.verse };
  } else if (lentenKey !== null && LENTEN_SUNDAY_PROKEIMENA[lentenKey]) {
    const lp = LENTEN_SUNDAY_PROKEIMENA[lentenKey];
    prokeimenon = { tone: lp.tone, refrain: lp.refrain, verse: lp.verse };
  } else if (isSunday && SUNDAY_PROKEIMENA[tone]) {
    const sp = SUNDAY_PROKEIMENA[tone];
    prokeimenon = { tone, refrain: sp.refrain, verse: sp.verse };
  } else if (!isSunday && WEEKDAY_PROKEIMENA[dow]) {
    const wp = WEEKDAY_PROKEIMENA[dow];
    prokeimenon = { tone: wp.tone, refrain: wp.refrain, verse: wp.verse };
  }

  if (feast?.alleluia) {
    const fa = feast.alleluia;
    alleluia = { tone: fa.tone, verses: fa.verses };
  } else if (lentenKey !== null && LENTEN_SUNDAY_ALLELUIA[lentenKey]) {
    const la = LENTEN_SUNDAY_ALLELUIA[lentenKey];
    alleluia = { tone: la.tone, verses: la.verses };
  } else if (isSunday && SUNDAY_ALLELUIA[tone]) {
    alleluia = { tone, verses: SUNDAY_ALLELUIA[tone] };
  } else if (!isSunday && WEEKDAY_ALLELUIA[dow]) {
    const wa = WEEKDAY_ALLELUIA[dow];
    alleluia = { tone: wa.tone, verses: wa.verses };
  }

  // ── Entrance hymn: feast override → Sunday → weekday ──────────────────────
  let entranceHymn;
  if (feast?.entranceHymn) {
    entranceHymn = { text: feast.entranceHymn };
  } else if (isSunday) {
    entranceHymn = { text: 'Come, let us worship and fall down before Christ. O Son of God, who art risen from the dead, save us who sing to Thee: Alleluia!' };
  } else {
    entranceHymn = { text: 'Come, let us worship and fall down before Christ. O Son of God, who art wondrous in Thy saints, save us who sing to Thee: Alleluia!' };
  }

  // ── Megalynarion: feast → Basil → typical ─────────────────────────────────
  let megalynarion;
  if (feast?.megalynarion) {
    megalynarion = { text: feast.megalynarion };
  } else if (isBasil) {
    megalynarion = 'basil-liturgy';
  } else {
    megalynarion = null;
  }

  // ── Communion hymn: feast override → day-of-week ──────────────────────────
  const communionHymn = feast?.communionHymn
    ? { text: feast.communionHymn }
    : { text: COMMUNION_HYMNS[dow] || COMMUNION_HYMNS.sunday };

  // ── Feast antiphons (Lord's feasts only) ──────────────────────────────────
  const feastAntiphons = (feast?.type === 'lord' && feast.antiphons) ? feast.antiphons : null;

  // ── Litany for the Departed (Soul Saturdays) ─────────────────────────────
  const includeDepartedLitany = isSoulSaturday(date);

  return {
    variant,
    feastAntiphons,
    beatitudes: feastAntiphons ? null : { troparia: buildBeatitudesTroparia(isSunday, tone, srcs) },
    includeDepartedLitany,
    entranceHymn,
    troparia,
    kontakia,
    trisagion: { substitution: getTrisagionSubstitution(date) },
    prokeimenon,
    epistle:  epistleR ? { book: epistleR.book, display: epistleR.display, text: extractPassageText(epistleR) } : null,
    alleluia,
    gospel:   gospelR ? { book: gospelR.book, display: gospelR.display, text: extractPassageText(gospelR) } : null,
    megalynarion,
    cherubicOverride,
    communionHymn,
    weHaveSeen: season === 'brightWeek' ? 'paschal' : null,
    dismissal: {
      opening: feast ? 'feast' : (isSunday ? 'sunday' : 'weekday'),
      feastLabel: feast?.label || null,
      dayPatron: DAY_PATRONS[dow] || null,
      saints:  (orthocalData.saints || []).slice(0, 3),
    },
    dismissalTroparia: feast ? {
      troparion: feast.troparia?.[0] || null,
      kontakion: feast.kontakia?.[0] || null,
    } : null,
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

  // When the data has no verse-type blocks (sparse scraped data), don't apply
  // the seenVerse guard — all hymns are real stichera, not a refrain.
  const hasVerseBlocks = blocks.some(b => b.type === 'verse');

  for (const b of blocks) {
    if (b.type === 'verse')        { seenVerse = true; continue; }
    if (b.type === 'glory_marker') { continue; }
    if (b.type === 'now_marker')   { continue; }
    if (b.type !== 'hymn')         { continue; }

    if (b.position === 'glory') { glory = { text: b.text, tone: b.tone, label: b.label, ...(b.source_filename && { provenance: 'OCA' }) }; continue; }
    if (b.position === 'now')   { now   = { text: b.text, tone: b.tone, label: b.label, ...(b.source_filename && { provenance: 'OCA' }) }; continue; }

    // lordICall only: skip the opening refrain (appears before any psalm verse)
    // Only applies when verse blocks exist — sparse data has no refrain block.
    if (section === 'lordICall' && !seenVerse && hasVerseBlocks) continue;

    hymns.push({ text: b.text, tone: b.tone, label: b.label, ...(b.source_filename && { provenance: 'OCA' }) });
  }

  return {
    text:  hymns[0]?.text  ?? null,
    tone:  hymns[0]?.tone  ?? null,
    label: hymns[0]?.label ?? null,
    ...(hymns[0]?.provenance && { provenance: hymns[0].provenance }),
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
          SELECT b.section, b.block_order, b.type, b.tone, b.label, b.verse_number, b.position, b.text,
                 sf.filename AS source_filename
          FROM blocks b LEFT JOIN source_files sf ON b.source_file_id = sf.id
          WHERE b.liturgical_key = ? AND b.pronoun = ? AND b.service IN ('vespers', 'other', 'liturgy')
          ORDER BY b.section, b.block_order
        `).all(litKey, pronoun)
      : db.prepare(`
          SELECT b.section, b.block_order, b.type, b.tone, b.label, b.verse_number, b.position, b.text,
                 sf.filename AS source_filename
          FROM blocks b LEFT JOIN source_files sf ON b.source_file_id = sf.id
          WHERE b.date = ? AND b.pronoun = ? AND b.service IN ('vespers', 'other', 'liturgy')
          ORDER BY b.section, b.block_order
        `).all(date, pronoun);

    if (rows.length === 0) return {};

    // Normalize source_filename to a source key for priority ranking
    for (const row of rows) {
      row.dbSource = (row.source_filename || '').startsWith('stSergius')
        ? 'stSergius' : 'oca-menaion';
    }
    // Prefer OCA blocks when multiple sources cover the same section+order
    const deduped = deduplicateBySource(
      rows,
      r => `${r.section}:${r.block_order}`,
      'dbSource'
    );

    const bySection = {};
    for (const row of deduped) {
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
  const isGreatVespers      = calendarEntry.vespers?.serviceType === 'greatVespers' ||
                              calendarEntry.vespers?.serviceType === 'all-night-vigil';
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
      let menaionProvenance = firstDbSrc && firstDbSrc.startsWith('stSergius')
        ? 'St. Sergius'
        : 'OCA';

      // Great Feast all-night-vigil: up to 8 stichera (unique hymns repeat to fill slots)
      // Great Vespers: up to 6; Daily Vespers: up to 3
      const isVigilFeast  = calendarEntry.vespers?.serviceType === 'all-night-vigil';
      const maxLicStichera = isVigilFeast ? 8 : (isGreatVespers ? 6 : (isSaturdayInjection ? 6 : 3));
      const licStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'lordICall' && s.order >= 1
      ).slice(0, maxLicStichera) ?? [];
      const licGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'lordICall' && s.order === 0
      ) ?? null;

      if (licStichera.length > 0) {
        const lic = calendarEntry.vespers.lordICall;

        if (isSaturdayInjection && !calendarEntry.liturgicalContext?.greatFeast) {
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
        } else if (isVigilFeast && licStichera.length < 8) {
          // All-Night Vigil: unique hymns repeat to fill 8 slots (e.g. 4 unique × 2)
          const totalSlots = lic.totalStichera || 8;
          const allVerses  = Array.from({ length: totalSlots }, (_, i) => totalSlots - i);
          lic.slots = [{
            verses: allVerses,
            count:  totalSlots,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          }];
          // Build hymns array with repeats to fill totalSlots
          const hymns = [];
          for (let i = 0; i < totalSlots; i++) {
            hymns.push({ text: licStichera[i % licStichera.length].text,
                         tone: licStichera[i % licStichera.length].tone,
                         label: licStichera[i % licStichera.length].label });
          }
          autoSlot.lordICall = { hymns };
        } else if (isWeekdayInjection && !isGreatVespers && lic.slots?.length > 0 && lic.slots[0].source === 'octoechos') {
          // Weekday Daily Vespers: split 6 stichera between Octoechos and Menaion
          const menaionCount    = Math.min(licStichera.length, 3);
          const octoechosCount  = 6 - menaionCount;
          const allVerses       = [6, 5, 4, 3, 2, 1];
          lic.slots[0].verses   = allVerses.slice(0, octoechosCount);
          lic.slots[0].count    = octoechosCount;
          lic.slots.push({
            verses: allVerses.slice(octoechosCount),
            count:  menaionCount,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          });
        } else {
          // Great Vespers or Vigil with ≥8 unique stichera — all Menaion
          const allVerses = isVigilFeast
            ? [8, 7, 6, 5, 4, 3, 2, 1].slice(0, licStichera.length)
            : [6, 5, 4, 3, 2, 1].slice(0, licStichera.length);
          lic.slots = [{
            verses: allVerses,
            count:  licStichera.length,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          }];
        }

        if (!autoSlot.lordICall) {
          autoSlot.lordICall = { hymns: licStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })) };
        }

        if (licGlory) {
          lic.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.lordICall.glory`, tone: licGlory.tone, label: primary.title, combinesGloryNow: true };
          autoSlot.lordICall.glory = { text: licGlory.text, tone: licGlory.tone, label: licGlory.label };
        }
      }

      // Inject Menaion aposticha stichera when available
      let apostStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'aposticha' && s.order >= 1
      ).slice(0, 3) ?? [];
      let apostGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'aposticha' && s.order === 0
      ) ?? null;

      // General Menaion aposticha fallback when day-specific aposticha is missing
      if (apostStichera.length === 0 && !apostGlory && primary?.saint_type) {
        const gmTexts = getGeneralMenaionTexts(primary.saint_type, primary.title);
        if (gmTexts) {
          const gmApost = gmTexts.filter(r => r.section === 'aposticha' && r.order >= 1).slice(0, 3);
          const gmGlory = gmTexts.find(r => r.section === 'aposticha' && r.order === 0) ?? null;
          if (gmApost.length > 0 || gmGlory) {
            apostStichera = gmApost;
            apostGlory = gmGlory;
            menaionProvenance = 'St. Sergius (General)';
          }
        }
      }

      if (apostStichera.length > 0 || apostGlory) {
        autoSlot.aposticha = {
          hymns: apostStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })),
        };

        const apost = calendarEntry.vespers.aposticha;
        const isGreatFeast = !!calendarEntry.liturgicalContext?.greatFeast;
        const hasOctoechosAposticha = apost.slots?.some(s => s.source === 'octoechos');

        if (hasOctoechosAposticha && !isGreatFeast) {
          // Weekday/Saturday: keep Octoechos aposticha, only overlay Menaion glory
          // (Octoechos provides the 3 base hymns; Menaion provides the Glory sticheron)
        } else {
          // Great feast or no Octoechos base: replace slots with Menaion stichera
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
        }

        if (apostGlory) {
          apost.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.aposticha.glory`, tone: apostGlory.tone, label: primary.title, combinesGloryNow: isGreatFeast };
          // Weekday: Octoechos theotokion already set as `now` in calendar entry
          // Saturday: set Octoechos theotokion explicitly
          if (isSaturdayInjection && !isGreatFeast) {
            apost.now = { source: 'octoechos', key: `tone${calendarEntry.liturgicalContext.tone}.saturday.vespers.aposticha.theotokion`, tone: calendarEntry.liturgicalContext.tone, label: 'Theotokion' };
          }
          autoSlot.aposticha.glory = { text: apostGlory.text, tone: apostGlory.tone, label: apostGlory.label };
        }
        // If no doxastichon, keep the existing combinesGloryNow theotokion from calendar entry
      }

      // ── Inject Litya stichera from DB (great feast and vigil services) ────
      if (calendarEntry.vespers?.litya) {
        const lityaStichera = sticheraData?.[0]?.stichera.filter(
          s => s.section === 'litya' && s.order >= 1
        ) ?? [];
        const lityaGlory = sticheraData?.[0]?.stichera.find(
          s => s.section === 'litya' && s.order === 0
        ) ?? null;
        const lityaNow = sticheraData?.[0]?.stichera.find(
          s => s.section === 'litya' && s.order === -1
        ) ?? null;

        if (lityaStichera.length > 0) {
          const litya = calendarEntry.vespers.litya;
          litya.slots = lityaStichera.map((s, i) => ({
            position: i + 1,
            source:   'menaion', provenance: menaionProvenance,
            key:      `auto.${date}.litya.hymns.${i}`,
            tone:     s.tone,
            label:    primary.title,
          }));

          autoSlot.litya = {
            hymns: lityaStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })),
          };

          if (lityaGlory) {
            litya.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.litya.glory`, tone: lityaGlory.tone, label: primary.title };
            autoSlot.litya.glory = { text: lityaGlory.text, tone: lityaGlory.tone, label: lityaGlory.label };
          }
          if (lityaNow) {
            litya.now = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.litya.now`, tone: lityaNow.tone, label: primary.title };
            autoSlot.litya.now = { text: lityaNow.text, tone: lityaNow.tone, label: lityaNow.label };
          }
        }
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

  // Build Vespers dismissal spec if not already present
  if (!calendarEntry.vespers.dismissal) {
    const dow = calendarEntry.dayOfWeek;
    const feastKey = calendarEntry.liturgicalContext?.greatFeast;
    // Saturday Great Vespers begins the Sunday celebration → resurrectional dismissal
    const isSundayVespers = dow === 'sunday' ||
      (dow === 'saturday' && isGreatVespers && !feastKey);
    calendarEntry.vespers.dismissal = {
      opening: feastKey ? 'feast' : (isSundayVespers ? 'sunday' : 'weekday'),
      feastLabel: feastKey || null,
      dayPatron: DAY_PATRONS[dow] || null,
      saints: (calendarEntry.commemorations || []).slice(0, 3).map(c => c.title),
    };
  }

  const reqSources = Object.assign({}, sources, { db: dbSource, menaion: menaionOverride });
  const blocks = assembleVespers(calendarEntry, fixedTexts, reqSources);

  if (pronoun === 'yy') {
    for (const block of blocks) {
      if (block.text) block.text = applyYouYour(block.text);
      if (block.label) block.label = applyYouYour(block.label);
    }
  }

  const svcType = calendarEntry.vespers?.serviceType;
  const svcKey  = calendarEntry.vespers?.serviceKey;
  const serviceTitle = svcKey === 'burialVespers'
    ? 'Burial Vespers'
    : svcType === 'dailyVespers'
      ? 'Daily Vespers'
      : svcType === 'all-night-vigil'
        ? 'All-Night Vigil \u2014 Great Vespers'
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
      greatVespers: entry?.vespers?.serviceType === 'greatVespers' && !entry?.vespers?.serviceKey,
      dailyVespers: entry?.vespers?.serviceType === 'dailyVespers',
      allNightVigil: entry?.vespers?.serviceType === 'all-night-vigil',
      burialVespers: isBurialVespersDay(cur),
      bridegroomMatins: isBridegroomMatins(cur),
      lamentations: isLamentationsDay(cur),
      vesperalLiturgy: isVesperalLiturgyDay(cur),
      royalHours: isRoyalHoursDay(cur),
      liturgy: !!(entry?.liturgy) || isLiturgyServed(cur),
      passionGospels: isPassionGospelsDay(cur),
      presanctified: isPresanctifiedDay(cur),
      paschalHours: getLiturgicalSeason(cur) === 'brightWeek',
      paschaCollection: (() => {
        const p = calculatePascha(cur.getUTCFullYear());
        return cur.getUTCMonth() === p.getUTCMonth() && cur.getUTCDate() === p.getUTCDate();
      })(),
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

    // Liturgy content score — the liturgy is dynamically built from orthocal + Menaion DB,
    // so any day with liturgy served gets a base score; troparia/kontakia add more.
    const liturgyServed = services.liturgy;
    let liturgyScore = 0;
    if (liturgyServed) {
      liturgyScore = 0.5;                        // base: fixed texts + orthocal readings
      if (hasTroparia) liturgyScore += 0.25;     // saint troparia/kontakia from Menaion DB
      if (dowStr === 'sunday') liturgyScore += 0.25; // resurrectional content from Octoechos
      else if (hasTroparia) liturgyScore += 0.25; // weekday: troparia are the main variable
      liturgyScore = Math.min(liturgyScore, 1.0);
    }

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
// Day-of-week patron saints for dismissal (shared by Liturgy and Vespers)
const DAY_PATRONS = {
  sunday:    'the holy, glorious, and all-laudable Apostles',
  monday:    'the honorable, bodiless Powers of Heaven',
  tuesday:   'the honorable, glorious Prophet, Forerunner, and Baptist John',
  wednesday: 'the power of the precious and life-giving Cross',
  thursday:  'the holy, glorious, and all-laudable Apostles; our father among the saints Nicholas the Wonderworker, Archbishop of Myra in Lycia',
  friday:    'the power of the precious and life-giving Cross',
  saturday:  'the holy, glorious, and right-victorious Martyrs',
};

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

let presanctifiedFixed;
try {
  presanctifiedFixed = loadJSON('fixed-texts/presanctified-fixed.json');
  console.log('Presanctified fixed texts loaded.');
} catch (err) {
  console.error('Failed to load presanctified fixed texts:', err.message);
  process.exit(1);
}

let paschalHoursFixed;
try {
  paschalHoursFixed = loadJSON('fixed-texts/paschal-hours-fixed.json');
  console.log('Paschal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Hours fixed texts:', err.message);
  process.exit(1);
}

let midnightOfficeFixed;
try {
  midnightOfficeFixed = loadJSON('fixed-texts/midnight-office-fixed.json');
  console.log('Midnight Office fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Midnight Office fixed texts:', err.message);
  process.exit(1);
}

let paschalMatinsFixed;
try {
  paschalMatinsFixed = loadJSON('fixed-texts/paschal-matins-fixed.json');
  console.log('Paschal Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Matins fixed texts:', err.message);
  process.exit(1);
}

let passionGospelsFixed;
try {
  passionGospelsFixed = loadJSON('fixed-texts/passion-gospels-fixed.json');
  console.log('Passion Gospels fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Passion Gospels fixed texts:', err.message);
  process.exit(1);
}

let bridegroomMatinsFixed;
try {
  bridegroomMatinsFixed = loadJSON('fixed-texts/bridegroom-matins-fixed.json');
  console.log('Bridegroom Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Bridegroom Matins fixed texts:', err.message);
  process.exit(1);
}

let lamentationsFixed;
try {
  lamentationsFixed = loadJSON('fixed-texts/lamentations-fixed.json');
  console.log('Lamentations fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Lamentations fixed texts:', err.message);
  process.exit(1);
}

let vesperalLiturgyFixed;
try {
  vesperalLiturgyFixed = loadJSON('fixed-texts/vesperal-liturgy-fixed.json');
  console.log('Vesperal Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Vesperal Liturgy fixed texts:', err.message);
  process.exit(1);
}

let royalHoursFixed;
try {
  royalHoursFixed = loadJSON('fixed-texts/royal-hours-fixed.json');
  console.log('Royal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Royal Hours fixed texts:', err.message);
  process.exit(1);
}

let matinsFixed;
try {
  matinsFixed = loadJSON('fixed-texts/matins-fixed.json');
  console.log('Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Matins fixed texts:', err.message);
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
      // ── Vespers date-shift ─────────────────────────────────────────────────
      // Vespers is the first service of the next liturgical day.  The API date
      // represents the civil evening the service is served; the liturgical
      // content comes from the *next* calendar date.
      const vespersDate = getNextDateStr(date);

      // For Lenten weekday Vespers, enrich prokeimenon entries with pericopes from orthocal API
      let entryOverride = null;
      try {
        const baseEntry = getCalendarEntry(vespersDate);
        if (baseEntry?.liturgicalContext?.season === 'greatLent' &&
            baseEntry?.vespers?.serviceType === 'dailyVespers') {
          const orthocalData = await fetchOrthocalDay(vespersDate);
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
        result = assembleForDate(vespersDate, pronoun, entryOverride);
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
        const [, mm, dd] = vespersDate.split('-').map(Number);
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

      // Relabel 'db' source to the actual liturgical book for dev-mode display
      const dbSourceLabel = season === 'pentecostarion' ? 'pentecostarion'
        : season === 'brightWeek' ? 'pentecostarion'
        : (season === 'greatLent' || season === 'holyWeek' || season === 'preLenten') ? 'triodion'
        : 'db';
      for (const b of blocks) {
        if (b.source === 'db') b.source = dbSourceLabel;
        if (!b.provenance) b.provenance = 'OCA';
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        vespersDate,
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

    } else if (pathname === '/api/education-modules') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'variable-sources', 'education-modules.json'), 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load education modules.' }));
      }

    } else if (pathname === '/api/education-modules-vespers') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'variable-sources', 'education-modules-vespers.json'), 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load vespers education modules.' }));
      }

    } else if (pathname === '/api/liturgy') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      {
        const d = new Date(date + 'T12:00:00Z');
        if (!isLiturgyServed(d)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No Divine Liturgy is served on this date.', date }));
          return;
        }
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
        let commemorations  = calendarEntry.commemorations || [];
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

        const variantName = calendarEntry.liturgy.variant === 'basil'
          ? 'Liturgy of St. Basil the Great'
          : 'Liturgy of St. John Chrysostom';
        const serviceName = `Divine Liturgy — ${variantName}`;

        if (format === 'html') {
          const toneLabel = tone ? ` · Tone ${tone}` : '';
          renderServiceHTML(res, blocks, serviceName, `${formatDate(date)}${toneLabel}`, pronoun);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType:    'liturgy',
          serviceName,
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

    } else if (pathname === '/api/presanctified') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      {
        const d = new Date(date + 'T12:00:00Z');
        if (!isPresanctifiedDay(d)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'The Liturgy of the Presanctified Gifts is not served on this date.',
            date,
          }));
          return;
        }
      }

      (async () => {
        let calendarEntry = getCalendarEntry(date);
        if (!calendarEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No calendar entry for this date.', date }));
          return;
        }

        // Enrich prokeimenon entries with pericopes from orthocal API
        try {
          const orthocalData = await fetchOrthocalDay(date);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          if (vesperReadings.length > 0 && calendarEntry.vespers?.prokeimenon?.entries) {
            const entries = calendarEntry.vespers.prokeimenon.entries.map(e => {
              const match = vesperReadings.find(r =>
                r.display && e.reading?.book &&
                r.display.toLowerCase().startsWith(e.reading.book.toLowerCase())
              );
              if (match && match.display) {
                const raw = match.display.replace(/^[A-Za-z ]+/, '').trim();
                const pericope = raw.replace(/(\d+)\.(\d+)-(\d+)\.(\d+)/, '$1:$2–$3:$4')
                                    .replace(/(\d+)\.(\d+)/, '$1:$2');
                return { ...e, reading: { ...e.reading, pericope } };
              }
              return e;
            });
            calendarEntry = {
              ...calendarEntry,
              vespers: {
                ...calendarEntry.vespers,
                prokeimenon: { ...calendarEntry.vespers.prokeimenon, entries },
              },
            };
          }
        } catch (err) {
          console.warn('Presanctified: orthocal pericope fetch failed (non-fatal):', err.message);
        }

        // Inject DB-sourced variable texts
        const dbSource = buildDbSource(date, pronoun);
        const assemblerSources = { ...sources, db: dbSource };

        let blocks;
        try {
          blocks = assemblePresanctified(calendarEntry, fixedTexts, liturgyFixed, presanctifiedFixed, assemblerSources);
        } catch (err) {
          console.error('assemblePresanctified error:', err);
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

        // Relabel 'db' source
        for (const b of blocks) {
          if (b.source === 'db') b.source = 'triodion';
          if (!b.provenance) b.provenance = 'OCA';
        }

        if (format === 'html') {
          const toneLabel = tone ? ` · Tone ${tone}` : '';
          renderServiceHTML(res, blocks, 'Liturgy of the Presanctified Gifts', `${formatDate(date)}${toneLabel}`, pronoun);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType:    'presanctified',
          serviceName:    'Liturgy of the Presanctified Gifts',
          tone,
          season,
          liturgicalLabel,
          commemorations,
          blocks,
        }));
      })().catch(err => {
        console.error('Presanctified route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/bridegroom-matins') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isBridegroomMatins(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bridegroom Matins is only served on the evenings of Palm Sunday through Holy Wednesday.',
          date,
        }));
        return;
      }

      // API date = civil evening; content from NEXT liturgical day
      const nextDay = new Date(d);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const night = getDayOfWeek(nextDay);  // monday, tuesday, wednesday, or thursday
      const NIGHT_NAMES = {
        monday:    'Holy Monday',
        tuesday:   'Holy Tuesday',
        wednesday: 'Holy Wednesday',
        thursday:  'Great and Holy Thursday',
      };

      let blocks;
      try {
        blocks = assembleBridegroomMatins(bridegroomMatinsFixed, night);
      } catch (err) {
        console.error('assembleBridegroomMatins error:', err);
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

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'Bridegroom Matins', `${formatDate(date)} · ${NIGHT_NAMES[night] || 'Holy Week'}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'bridegroom-matins',
        serviceName:    'Bridegroom Matins',
        season:         'holyWeek',
        liturgicalLabel: NIGHT_NAMES[night] || 'Holy Week',
        blocks,
      }));

    } else if (pathname === '/api/matins') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      (async () => {
      const d      = new Date(date + 'T12:00:00Z');
      const dow    = getDayOfWeek(d);
      const season = getLiturgicalSeason(d);
      const tone   = getTone(d);

      // Build the matins spec from available data
      const matinsSpec = buildMatinsSpec(date, d, dow, season, tone);

      // Enrich Matins Gospel with full scripture text from orthocal API
      if (matinsSpec?.gospel && !matinsSpec.gospel.text) {
        try {
          const orthocalData = await fetchOrthocalDay(date);
          const matinsReading = (orthocalData.readings || []).find(
            r => r.source && r.source.includes('Matins Gospel')
          );
          if (matinsReading?.passage?.length) {
            matinsSpec.gospel.text = matinsReading.passage.map(v => v.content).join('\n\n');
            matinsSpec.gospel._source = 'orthocal';
          }
        } catch (err) {
          console.warn('Matins gospel enrichment failed (non-fatal):', err.message);
        }
      }

      if (!matinsSpec) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'No Matins data available for this date. Currently supported: Sundays (all tones) and great feasts with menaion data.',
          date,
        }));
        return;
      }

      const calendarDay = {
        date,
        dayOfWeek: dow,
        liturgicalContext: { season, tone },
        matins: matinsSpec,
      };

      let blocks;
      try {
        blocks = assembleMatins(calendarDay, matinsFixed, fixedTexts, sources);
      } catch (err) {
        console.error('assembleMatins error:', err);
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

      if (format === 'html') {
        const toneLabel = tone ? ` · Tone ${tone}` : '';
        renderServiceHTML(res, blocks, 'Matins (Orthros)', `${formatDate(date)}${toneLabel}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'matins',
        serviceName:    'Matins (Orthros)',
        tone,
        season,
        blocks,
      }));
      })();

    } else if (pathname === '/api/passion-gospels') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isPassionGospelsDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Service of the Twelve Passion Gospels is only served on Great Thursday evening.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assemblePassionGospels(passionGospelsFixed);
      } catch (err) {
        console.error('assemblePassionGospels error:', err);
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

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Twelve Passion Gospels', `${formatDate(date)} · Great and Holy Thursday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'passion-gospels',
        serviceName:    'The Twelve Passion Gospels',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Thursday',
        blocks,
      }));

    } else if (pathname === '/api/royal-hours') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isRoyalHoursDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Royal Hours are only served on the morning of Great Friday.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assembleRoyalHours(royalHoursFixed);
      } catch (err) {
        console.error('assembleRoyalHours error:', err);
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

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'Royal Hours of Great Friday', `${formatDate(date)} · Great and Holy Friday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'royalHours',
        serviceName:    'Royal Hours of Great Friday',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Friday',
        blocks,
      }));

    } else if (pathname === '/api/lamentations') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isLamentationsDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Lamentations service is only served on the evening of Great Friday.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assembleLamentations(lamentationsFixed);
      } catch (err) {
        console.error('assembleLamentations error:', err);
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

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Lamentations', `${formatDate(date)} · Great and Holy Friday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'lamentations',
        serviceName:    'The Lamentations',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Friday',
        blocks,
      }));

    } else if (pathname === '/api/vesperal-liturgy') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isVesperalLiturgyDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Vesperal Liturgy of St. Basil is only served on Great Saturday morning.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assembleVesperalLiturgy(vesperalLiturgyFixed, fixedTexts, liturgyFixed);
      } catch (err) {
        console.error('assembleVesperalLiturgy error:', err);
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

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'Vesperal Liturgy of St. Basil', `${formatDate(date)} · Great and Holy Saturday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'vesperal-liturgy',
        serviceName:    'Vesperal Liturgy of St. Basil',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Saturday',
        blocks,
      }));

    } else if (pathname === '/api/paschal-hours') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      const season = getLiturgicalSeason(d);
      if (season !== 'brightWeek') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Paschal Hours are only served during Bright Week (Pascha through Bright Saturday).',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assemblePaschalHours(paschalHoursFixed);
      } catch (err) {
        console.error('assemblePaschalHours error:', err);
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

      const dow = getDayOfWeek(d);
      const NAMES = {
        sunday: 'Holy Pascha', monday: 'Bright Monday', tuesday: 'Bright Tuesday',
        wednesday: 'Bright Wednesday', thursday: 'Bright Thursday',
        friday: 'Bright Friday', saturday: 'Bright Saturday',
      };

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Paschal Hours', `${formatDate(date)} · ${NAMES[dow] || 'Bright Week'}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'paschal-hours',
        serviceName:    'The Paschal Hours',
        season:         'brightWeek',
        liturgicalLabel: NAMES[dow] || 'Bright Week',
        blocks,
      }));

    } else if (pathname === '/api/pascha-collection') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      const pascha = calculatePascha(d.getUTCFullYear());
      const isPaschaDay = d.getUTCFullYear() === pascha.getUTCFullYear()
        && d.getUTCMonth() === pascha.getUTCMonth()
        && d.getUTCDate() === pascha.getUTCDate();

      if (!isPaschaDay) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Holy Pascha Collection is only available on Pascha Sunday.',
          date,
        }));
        return;
      }

      (async () => {
        try {
          const allBlocks = [];
          const serviceTitle = (n, title) => ({
            id: `pascha-title-${n}`,
            section: title,
            type: 'rubric',
            speaker: null,
            text: title,
            label: 'service-title',
          });

          // ── Part 1: Midnight Office ──
          allBlocks.push(serviceTitle(1, 'The Midnight Office'));
          const moBlocks = assembleMidnightOffice(midnightOfficeFixed);
          allBlocks.push(...moBlocks);

          // ── Part 2: Paschal Matins ──
          allBlocks.push(serviceTitle(2, 'Paschal Matins'));
          const matinsBlocks = assemblePaschalMatins(paschalMatinsFixed);
          allBlocks.push(...matinsBlocks);

          // ── Part 3: Paschal Hours ──
          allBlocks.push(serviceTitle(3, 'The Paschal Hours'));
          const hoursBlocks = assemblePaschalHours(paschalHoursFixed);
          allBlocks.push(...hoursBlocks);

          // ── Part 4: Paschal Liturgy ──
          allBlocks.push(serviceTitle(4, 'The Paschal Divine Liturgy'));
          let calendarEntry = getCalendarEntry(date);
          if (calendarEntry && !calendarEntry.liturgy) {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources) };
          }
          if (calendarEntry?.liturgy) {
            const litBlocks = assembleLiturgy(calendarEntry, liturgyFixed, sources);
            allBlocks.push(...litBlocks);
          }

          // Pronoun switching
          if (pronoun === 'yy') {
            for (const block of allBlocks) {
              if (block.text)  block.text  = applyYouYour(block.text);
              if (block.label) block.label = applyYouYour(block.label);
            }
          }

          if (format === 'html') {
            renderServiceHTML(res, allBlocks, 'Holy Pascha Collection', `${formatDate(date)} · The Holy Pascha`, pronoun);
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            date,
            serviceType:     'pascha-collection',
            serviceName:     'Holy Pascha Collection',
            season:          'brightWeek',
            liturgicalLabel: 'The Holy Pascha — Resurrection of Christ',
            blocks:          allBlocks,
          }));
        } catch (err) {
          console.error('pascha-collection error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      })();

    } else if (pathname === '/api/choir-prep') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      // Determine available services (same logic as /api/days, single date)
      const d = new Date(date + 'T12:00:00Z');
      const [, mm, dd] = date.split('-').map(Number);
      const dowIdx = d.getUTCDay();
      const dowStr = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];
      const entry  = getCalendarEntry(date);
      const season = entry ? (entry.liturgicalContext?.season || null) : null;
      const tone   = entry ? (entry.liturgicalContext?.tone ?? entry.vespers?.lordICall?.tone ?? null) : null;
      const liturgicalLabel = entry ? getDayLabel(entry, dowStr, season) : null;

      // Feast + commemorations
      let commemorations = [];
      try {
        const dayList = getMenaionDayList(mm, dd);
        if (dayList) commemorations = dayList.commemorations;
      } catch (_) {}

      const svcMap = {
        greatVespers:    { key: 'greatVespers',    name: 'Great Vespers',                  endpoint: '/api/service' },
        dailyVespers:    { key: 'dailyVespers',    name: 'Daily Vespers',                  endpoint: '/api/service' },
        matins:          { key: 'matins',           name: 'Matins',                         endpoint: '/api/matins' },
        liturgy:         { key: 'liturgy',          name: 'Divine Liturgy',                 endpoint: '/api/liturgy' },
        presanctified:   { key: 'presanctified',    name: 'Presanctified Liturgy',          endpoint: '/api/presanctified' },
        bridegroomMatins:{ key: 'bridegroomMatins', name: 'Bridegroom Matins',              endpoint: '/api/bridegroom-matins' },
        passionGospels:  { key: 'passionGospels',   name: 'Twelve Passion Gospels',         endpoint: '/api/passion-gospels' },
        royalHours:      { key: 'royalHours',       name: 'Royal Hours',                    endpoint: '/api/royal-hours' },
        lamentations:    { key: 'lamentations',     name: 'The Lamentations',               endpoint: '/api/lamentations' },
        vesperalLiturgy: { key: 'vesperalLiturgy',  name: 'Vesperal Liturgy of St. Basil',  endpoint: '/api/vesperal-liturgy' },
        paschalHours:    { key: 'paschalHours',      name: 'Paschal Hours',                  endpoint: '/api/paschal-hours' },
        paschaCollection:{ key: 'paschaCollection',  name: 'Holy Pascha Collection',         endpoint: '/api/pascha-collection' },
      };

      // Build available services list
      // Vespers date-shift: vespers served this evening belongs to tomorrow
      const vespersEntry = getCalendarEntry(getNextDateStr(date));
      const available = {
        greatVespers:    vespersEntry?.vespers?.serviceType === 'greatVespers' && !vespersEntry?.vespers?.serviceKey,
        dailyVespers:    vespersEntry?.vespers?.serviceType === 'dailyVespers',
        bridegroomMatins: isBridegroomMatins(d),
        lamentations:    isLamentationsDay(d),
        vesperalLiturgy: isVesperalLiturgyDay(d),
        royalHours:      isRoyalHoursDay(d),
        passionGospels:  isPassionGospelsDay(d),
        matins:          !!buildMatinsSpec(date, d, dowStr, season, getTone(d)),
        liturgy:         !!(entry?.liturgy) || isLiturgyServed(d),
        presanctified:   isPresanctifiedDay(d),
        paschalHours:    getLiturgicalSeason(d) === 'brightWeek',
        paschaCollection: (() => {
          const p = calculatePascha(d.getUTCFullYear());
          return d.getUTCMonth() === p.getUTCMonth() && d.getUTCDate() === p.getUTCDate();
        })(),
      };

      const toFetch = Object.entries(available)
        .filter(([, avail]) => avail)
        .map(([key]) => svcMap[key])
        .filter(Boolean);

      // Fetch each service via internal HTTP requests
      const fetchInternal = (endpoint, dateStr, pron) => new Promise((resolve, reject) => {
        const url = `http://localhost:${PORT}${endpoint}?date=${dateStr}&pronoun=${pron}`;
        http.get(url, (resp) => {
          let body = '';
          resp.on('data', chunk => body += chunk);
          resp.on('end', () => {
            try {
              if (resp.statusCode === 200) resolve(JSON.parse(body));
              else resolve(null);
            } catch (e) { resolve(null); }
          });
        }).on('error', () => resolve(null));
      });

      (async () => {
        try {
          const results = await Promise.all(
            toFetch.map(svc => fetchInternal(svc.endpoint, date, pronoun))
          );

          const services = [];
          for (let i = 0; i < toFetch.length; i++) {
            const data = results[i];
            if (!data || !data.blocks) continue;
            services.push({
              type: toFetch[i].key,
              name: data.serviceName || toFetch[i].name,
              blocks: data.blocks,
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            date,
            tone,
            season,
            liturgicalLabel,
            commemorations,
            services,
          }));
        } catch (err) {
          console.error('/api/choir-prep error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      })();

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

        // Vespers date-shift: vespers served on this evening belongs to
        // the *next* liturgical day, so look up tomorrow's calendar entry.
        const vespersDateStr = getNextDateStr(dateStr);
        const vespersEntry   = getCalendarEntry(vespersDateStr);

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
          greatVespers: vespersEntry?.vespers?.serviceType === 'greatVespers' && !vespersEntry?.vespers?.serviceKey,
          dailyVespers: vespersEntry?.vespers?.serviceType === 'dailyVespers',
          allNightVigil: vespersEntry?.vespers?.serviceType === 'all-night-vigil',
          burialVespers: isBurialVespersDay(cur),
      bridegroomMatins: isBridegroomMatins(cur),
          lamentations: isLamentationsDay(cur),
          vesperalLiturgy: isVesperalLiturgyDay(cur),
          royalHours: isRoyalHoursDay(cur),
          passionGospels: isPassionGospelsDay(cur),
          matins:  !!buildMatinsSpec(dateStr, cur, dowStr, season, getTone(cur)),
          liturgy: !!(entry?.liturgy) || isLiturgyServed(cur),
          presanctified: isPresanctifiedDay(cur),
          paschalHours: getLiturgicalSeason(cur) === 'brightWeek',
          paschaCollection: (() => {
            const p = calculatePascha(cur.getUTCFullYear());
            return cur.getUTCMonth() === p.getUTCMonth() && cur.getUTCDate() === p.getUTCDate();
          })(),
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

      // Vespers date-shift: content belongs to the next liturgical day
      const vespersDate = getNextDateStr(date);

      // Try assembleForDate first
      let assembleResult;
      try {
        assembleResult = assembleForDate(vespersDate, pronoun);
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
