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

const { assembleVespers }                        = require('./assembler');
const { generateCalendarEntry, getLiturgicalSeason, getDayOfWeek, getLiturgicalKey } = require('./calendar-rules');
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
 */
function getCalendarEntry(dateStr) {
  // Try auto-generation first (most accurate for regular Saturdays)
  const generated = generateCalendarEntry(dateStr);
  if (generated) return generated;

  // Fall back to hand-authored file if it exists
  const calPath = path.join(__dirname, 'variable-sources', 'calendar', `${dateStr}.json`);
  if (fs.existsSync(calPath)) {
    return loadJSON(`variable-sources/calendar/${dateStr}.json`);
  }

  return null;
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
          FROM blocks WHERE liturgical_key = ? AND pronoun = ? AND service = 'vespers'
          ORDER BY section, block_order
        `).all(litKey, pronoun)
      : db.prepare(`
          SELECT section, block_order, type, tone, label, verse_number, position, text
          FROM blocks WHERE date = ? AND pronoun = ? AND service = 'vespers'
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
function assembleForDate(date, pronoun) {
  const calendarEntry = getCalendarEntry(date);
  if (!calendarEntry) return null;

  const dbSource = buildDbSource(date, pronoun);

  let menaionOverride = sources.menaion;
  const injectSeasons = ['ordinaryTime', 'pentecostarion', 'preLenten'];
  if (calendarEntry._meta?.generated && injectSeasons.includes(calendarEntry.liturgicalContext?.season) && calendarEntry.dayOfWeek === 'saturday') {
    const [, mm, dd] = date.split('-').map(Number);
    const primary      = getMenaionPrimary(mm, dd);
    const sticheraData = getSticheraDay(mm, dd);

    if (primary) {
      const troparion = primary.troparia.find(t => t.type === 'troparion');
      const autoSlot  = { troparion: { text: troparion.text, tone: troparion.tone, label: primary.title } };

      const licStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'lordICall' && s.order >= 1
      ).slice(0, 6) ?? [];
      const licGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'lordICall' && s.order === 0
      ) ?? null;

      if (licStichera.length > 0) {
        const menaionCount        = licStichera.length;
        const resurrectionalCount = 6 - menaionCount;
        const allVerses           = [6, 5, 4, 3, 2, 1];

        const lic = calendarEntry.vespers.lordICall;
        if (resurrectionalCount === 0) {
          lic.slots = [];
        } else {
          lic.slots[0].verses = allVerses.slice(0, resurrectionalCount);
          lic.slots[0].count  = resurrectionalCount;
        }
        lic.slots.push({
          verses: allVerses.slice(resurrectionalCount),
          count:  menaionCount,
          source: 'menaion',
          key:    `auto.${date}.lordICall`,
          tone:   licStichera[0].tone,
          label:  primary.title,
        });

        autoSlot.lordICall = { hymns: licStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })) };

        if (licGlory) {
          lic.glory = { source: 'menaion', key: `auto.${date}.lordICall.glory`, tone: licGlory.tone, label: primary.title };
          autoSlot.lordICall.glory = { text: licGlory.text, tone: licGlory.tone, label: licGlory.label };
        }
      }

      menaionOverride = { ...sources.menaion, auto: { [date]: autoSlot } };

      const slots    = calendarEntry.vespers.troparia.slots;
      const nowIdx   = slots.findIndex(s => s.position === 'now');
      const insertAt = nowIdx !== -1 ? nowIdx : slots.length;
      slots.splice(insertAt, 0, {
        position: 'glory',
        source:   'menaion',
        key:      `auto.${date}.troparion`,
        tone:     troparion.tone,
        label:    primary.title,
      });

      calendarEntry.commemorations = [{ title: primary.title, tone: troparion.tone }];
    }
  }

  const reqSources = Object.assign({}, sources, { db: dbSource, menaion: menaionOverride });
  const blocks = assembleVespers(calendarEntry, fixedTexts, reqSources);

  const serviceTitle = calendarEntry.vespers?.serviceType === 'dailyVespers'
    ? 'Daily Vespers'
    : 'Great Vespers';
  const tone = calendarEntry.vespers?.lordICall?.tone ?? calendarEntry.liturgicalContext?.tone ?? null;

  return { blocks, calendarEntry, serviceTitle, tone };
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

  return null;
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

function handleRequest(req, res) {
  const url      = req.url || '/';
  const pathname = url.split('?')[0];

  try {
    if (pathname === '/') {
      serveStatic(res, path.join(__dirname, 'public', 'index.html'), 'text/html');

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

      let result;
      try {
        result = assembleForDate(date, pronoun);
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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:      calendarEntry.vespers?.serviceType || 'greatVespers',
        serviceName:      serviceTitle,
        tone,
        season,
        liturgicalLabel,
        commemorations:   calendarEntry.commemorations || [],
        blocks,
      }));

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

        // Feast from Menaion DB
        let feast = null;
        try {
          const primary = getMenaionPrimary(mm, dd);
          if (primary) feast = primary.title;
        } catch (_) {}

        const services = {
          greatVespers: entry?.vespers?.serviceType === 'greatVespers',
          dailyVespers: entry?.vespers?.serviceType === 'dailyVespers',
          matins:  false,
          liturgy: false,
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
          liturgicalLabel,
          services,
        });

        cur = new Date(cur.getTime() + DAY_MS_LOCAL);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

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

      const hasMenaion  = calendarEntry.commemorations?.length > 0;
      const hasStichera = calendarEntry.vespers.lordICall.slots.some(s => s.source === 'menaion');
      const notice = isGenerated
        ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:8px 40px;background:#fffbe6;border-bottom:1px solid #e6d87a;color:#7a6000;">
             ⚠ Auto-generated service${hasMenaion ? '' : ' — Menaion commemorations for this date are not yet included'}.
             ${hasMenaion && !hasStichera ? 'Menaion stichera (Lord I Call) are not yet included.' : ''}
           </div>`
        : '';
      const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
      const injected = html.replace('<body>', '<body>' + backBar + notice);

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
