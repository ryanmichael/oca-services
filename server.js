/**
 * OCA Service Browser
 *
 * A minimal HTTP server for browsing collected service texts.
 * Queries storage/oca.db and renders Vespers for any available date.
 *
 * Usage:
 *   node server.js          — starts on http://localhost:3000
 *   node server.js --port 8080
 */

'use strict';

const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { renderVespers } = require('./renderer');

// ─── Config ───────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, 'storage', 'oca.db');

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3000;

// ─── Section display labels ───────────────────────────────────────────────────

const SECTION_LABELS = {
  lordICall : 'Lord, I Have Cried',
  aposticha : 'Aposticha',
  troparia  : 'Troparia',
  litya     : 'Litya',
  epistle   : 'Epistle',
  gospel    : 'Gospel',
};

// Preferred section order for Vespers
const VESPERS_SECTION_ORDER = ['lordICall', 'aposticha', 'troparia', 'litya', 'epistle', 'gospel'];

// ─── DB helpers ───────────────────────────────────────────────────────────────

function openDb() {
  return new DatabaseSync(DB_PATH, { readonly: true });
}

function getAvailableDates(db) {
  return db.prepare(`
    SELECT DISTINCT date, pronoun
    FROM source_files
    WHERE date IS NOT NULL
    ORDER BY date, pronoun
  `).all();
}

function getBlocks(db, date, pronoun, service = 'vespers') {
  return db.prepare(`
    SELECT section, block_order, type, tone, label, verse_number, position, attribution, text
    FROM blocks
    WHERE date = ? AND pronoun = ? AND service = ?
    ORDER BY section, block_order
  `).all(date, pronoun, service);
}

// ─── Block → ServiceBlock mapping ────────────────────────────────────────────

function mapBlocks(dbBlocks) {
  // Sort by preferred section order, then by block_order within section
  const sectionRank = key => {
    const idx = VESPERS_SECTION_ORDER.indexOf(key);
    return idx === -1 ? 99 : idx;
  };

  const sorted = [...dbBlocks].sort((a, b) => {
    const sr = sectionRank(a.section) - sectionRank(b.section);
    if (sr !== 0) return sr;
    return a.block_order - b.block_order;
  });

  return sorted.map((b, i) => {
    const sectionLabel = SECTION_LABELS[b.section] || b.section;

    // Map DB types to renderer types
    let type = b.type;
    let text = b.text || '';
    let speaker = null;

    if (b.type === 'glory_marker') {
      type = 'doxology';
      text = 'Glory to the Father, and to the Son, and to the Holy Spirit:';
    } else if (b.type === 'now_marker') {
      type = 'doxology';
      text = 'Now and ever, and unto ages of ages. Amen.';
    } else if (b.type === 'hymn') {
      speaker = 'choir';
    }

    return {
      id:      `block-${i}`,
      section: sectionLabel,
      type,
      speaker,
      text,
      tone:    b.tone   || null,
      label:   b.label  || null,
    };
  });
}

// ─── HTML pages ───────────────────────────────────────────────────────────────

function renderHomePage(dates) {
  // Group by date → list of pronouns
  const byDate = {};
  for (const { date, pronoun } of dates) {
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(pronoun);
  }

  const dateOptions = Object.keys(byDate).sort().map(d => {
    const pronouns = byDate[d];
    // Default to 'tt' if available
    const defaultPronoun = pronouns.includes('tt') ? 'tt' : pronouns[0];
    return `<option value="${d}|${defaultPronoun}">${formatDate(d)}</option>`;
  }).join('\n          ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OCA Service Texts</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      background: #f9f6f2;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 48px 56px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    }
    h1 {
      font-size: 20pt;
      font-weight: bold;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #8b1a1a;
      margin: 0 0 6px;
      text-align: center;
    }
    .subtitle {
      text-align: center;
      color: #666;
      font-size: 11pt;
      margin: 0 0 36px;
    }
    label {
      display: block;
      font-size: 10pt;
      font-weight: bold;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 6px;
    }
    select, .pronoun-group {
      width: 100%;
      margin-bottom: 20px;
    }
    select {
      font-family: inherit;
      font-size: 12pt;
      padding: 8px 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #fff;
      color: #1a1a1a;
      cursor: pointer;
    }
    .pronoun-group {
      display: flex;
      gap: 12px;
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
    .pronoun-group input[type=radio] {
      margin-right: 6px;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #8b1a1a;
      color: #fff;
      font-family: inherit;
      font-size: 12pt;
      font-weight: bold;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover { background: #a02020; }
    .count {
      text-align: center;
      font-size: 9.5pt;
      color: #999;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Great Vespers</h1>
    <p class="subtitle">OCA Service Texts Browser</p>

    <form method="GET" action="/service" onsubmit="splitValue()">
      <label for="date-select">Date</label>
      <select id="date-select" name="_datepronoun">
        ${dateOptions}
      </select>

      <input type="hidden" id="date-field" name="date" />
      <input type="hidden" id="pronoun-field" name="pronoun" />

      <label>Pronouns</label>
      <div class="pronoun-group">
        <label><input type="radio" name="pronounOverride" value="tt" checked /> Thee / Thy</label>
        <label><input type="radio" name="pronounOverride" value="yy" /> You / Your</label>
      </div>

      <button type="submit">View Service</button>
    </form>

    <p class="count">${Object.keys(byDate).length} dates available</p>
  </div>

  <script>
    function splitValue() {
      const val = document.getElementById('date-select').value; // "YYYY-MM-DD|tt"
      const [date] = val.split('|');
      const pronoun = document.querySelector('input[name=pronounOverride]:checked').value;
      document.getElementById('date-field').value = date;
      document.getElementById('pronoun-field').value = pronoun;
      document.querySelector('select[name=_datepronoun]').disabled = true;
    }
  </script>
</body>
</html>`;
}

function renderErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Error — OCA Service Texts</title>
  <style>
    body { font-family: Georgia, serif; padding: 60px; color: #1a1a1a; }
    h1 { color: #8b1a1a; }
    a { color: #8b1a1a; }
  </style>
</head>
<body>
  <h1>Error</h1>
  <p>${escHtml(message)}</p>
  <p><a href="/">← Back</a></p>
</body>
</html>`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(isoDate) {
  // "2026-03-07" → "March 7, 2026"
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Request handler ──────────────────────────────────────────────────────────

function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  return Object.fromEntries(new URLSearchParams(url.slice(idx + 1)));
}

function handleRequest(req, res) {
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  let db;
  try {
    db = openDb();
  } catch (err) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderErrorPage(`Database not found. Run: node import.js`));
    return;
  }

  try {
    if (pathname === '/') {
      const dates = getAvailableDates(db);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHomePage(dates));

    } else if (pathname === '/service') {
      const q = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (q.pronoun || 'tt').trim();

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage('Invalid or missing date parameter.'));
        return;
      }

      const dbBlocks = getBlocks(db, date, pronoun);
      if (dbBlocks.length === 0) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(`No vespers data found for ${date} (${pronoun}). <a href="/">Try another date.</a>`));
        return;
      }

      const blocks   = mapBlocks(dbBlocks);
      const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
      const html = renderVespers(blocks, {
        title: 'Great Vespers',
        date:  `${formatDate(date)}${pronounLabel}`,
      });

      // Inject a back-link at the top of the rendered page
      const backLink = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back to date list</a>
</div>`;
      const injected = html.replace('<body>', '<body>' + backLink);

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
  } finally {
    db.close();
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`OCA Service Browser running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
