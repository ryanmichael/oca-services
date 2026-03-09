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
const { generateCalendarEntry, getLiturgicalSeason, getDayOfWeek } = require('./calendar-rules');
const { renderVespers }                          = require('./renderer');

// ─── Config ───────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT    = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3000;

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

  // Load all available triodion files
  const triodion = {};
  const triodionDir = path.join(__dirname, 'variable-sources', 'triodion');
  if (fs.existsSync(triodionDir)) {
    for (const file of fs.readdirSync(triodionDir).filter(f => f.endsWith('.json'))) {
      const raw  = loadJSON(`variable-sources/triodion/${file}`);
      // lent-soul-saturday-2.json → triodion.lent.soulSaturday2
      triodion.lent = triodion.lent || {};
      triodion.lent.soulSaturday2 = raw.vespers || raw;
    }
  }

  return { octoechos, prokeimena, menaion, triodion };
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

// ─── DB helpers (for home page date list) ────────────────────────────────────

let dbModule;
function getCollectedDates() {
  try {
    if (!dbModule) {
      const { DatabaseSync } = require('node:sqlite');
      const dbPath = path.join(__dirname, 'storage', 'oca.db');
      if (!fs.existsSync(dbPath)) return [];
      const db = new DatabaseSync(dbPath, { readonly: true });
      const rows = db.prepare(`
        SELECT DISTINCT date, pronoun FROM source_files
        WHERE date IS NOT NULL ORDER BY date, pronoun
      `).all();
      db.close();
      return rows;
    }
  } catch {
    return [];
  }
  return [];
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
      const dates = getCollectedDates();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHomePage(dates));

    } else if (pathname === '/service') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (q.pronoun || 'tt').trim();

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage('Invalid or missing date parameter.'));
        return;
      }

      // Get a calendar entry
      const calendarEntry = getCalendarEntry(date);

      if (!calendarEntry) {
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

      // Assemble the full service
      let blocks;
      try {
        blocks = assembleVespers(calendarEntry, fixedTexts, sources);
      } catch (err) {
        console.error('Assembly error:', err);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(`Assembly error: ${err.message}`));
        return;
      }

      const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
      const isGenerated  = calendarEntry._meta?.generated;
      const tone         = calendarEntry.vespers?.lordICall?.tone;
      const toneLabel    = tone ? ` · Tone ${tone}` : '';

      const html = renderVespers(blocks, {
        title: 'Great Vespers',
        date:  `${formatDate(date)}${toneLabel}${pronounLabel}`,
      });

      // Inject back-link + optional generated notice
      const notice = isGenerated
        ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:8px 40px;background:#fffbe6;border-bottom:1px solid #e6d87a;color:#7a6000;">
             ⚠ Auto-generated service — Menaion commemorations and missing Octoechos tones not yet populated.
           </div>`
        : '';
      const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
      const injected = html.replace('<body>', '<body>' + backBar + notice);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);

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
