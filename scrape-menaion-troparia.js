/**
 * scrape-menaion-troparia.js
 *
 * Scrapes troparia and kontakia for every day of the year from the OCA website
 * and stores them in the local SQLite database (storage/oca.db).
 *
 * For each day it fetches:
 *   https://www.oca.org/saints/troparia/YEAR/MM/DD/
 *
 * Which lists every commemoration for that day with its troparion and kontakion.
 *
 * Usage:
 *   node scrape-menaion-troparia.js              — scrape all 365 days
 *   node scrape-menaion-troparia.js --month 10   — scrape one month
 *   node scrape-menaion-troparia.js --date 10/03 — scrape a single day
 *   node scrape-menaion-troparia.js --reset      — drop menaion tables first
 *
 * Prerequisites:  none (uses built-in https)
 */

'use strict';

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH  = path.join(__dirname, 'storage', 'oca.db');
const BASE_URL = 'https://www.oca.org';
const YEAR     = 2026;   // OCA texts are year-independent; use current year for URL
const RATE_MS  = 800;

// ─── DB schema ────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS commemorations (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  month     INTEGER NOT NULL,
  day       INTEGER NOT NULL,
  rank      TEXT,
  title     TEXT    NOT NULL,
  oca_slug  TEXT,
  tone      INTEGER,
  UNIQUE (month, day, title)
);

CREATE INDEX IF NOT EXISTS idx_comm_month_day ON commemorations (month, day);

CREATE TABLE IF NOT EXISTS troparia (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  commemoration_id   INTEGER NOT NULL REFERENCES commemorations(id),
  type               TEXT    NOT NULL,   -- 'troparion' | 'kontakion' | 'theotokion'
  tone               INTEGER,
  text               TEXT    NOT NULL,
  pronoun            TEXT    NOT NULL DEFAULT 'tt',
  UNIQUE (commemoration_id, type, pronoun)
);
`;

const DROP_DDL = `
  DROP TABLE IF EXISTS troparia;
  DROP TABLE IF EXISTS commemorations;
`;

// ─── DB helpers ───────────────────────────────────────────────────────────────

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(DDL);
  return db;
}

function upsertCommemoration(db, { month, day, title, oca_slug, rank, tone }) {
  db.prepare(`
    INSERT INTO commemorations (month, day, title, oca_slug, rank, tone)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (month, day, title) DO UPDATE SET
      oca_slug = excluded.oca_slug,
      rank     = excluded.rank,
      tone     = excluded.tone
  `).run(month, day, title, oca_slug ?? null, rank ?? null, tone ?? null);

  return db.prepare(`
    SELECT id FROM commemorations WHERE month = ? AND day = ? AND title = ?
  `).get(month, day, title)?.id;
}

function upsertTroparion(db, { commemoration_id, type, tone, text, pronoun = 'tt' }) {
  db.prepare(`
    INSERT INTO troparia (commemoration_id, type, tone, text, pronoun)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (commemoration_id, type, pronoun) DO UPDATE SET
      tone = excluded.tone,
      text = excluded.text
  `).run(commemoration_id, type, tone ?? null, text, pronoun);
}

// ─── Network ─────────────────────────────────────────────────────────────────

function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error(`Too many redirects: ${url}`));
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'OCA-Services/1.0 (liturgical research)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchText(next, redirectsLeft - 1));
      }
      if (res.statusCode === 404) {
        res.resume();
        return resolve(null);   // no saints for this day — OK
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── HTML parser ─────────────────────────────────────────────────────────────

/**
 * Parses the OCA troparia page HTML.
 *
 * The actual page structure is:
 *   <article>
 *     <header><h2>Saint Name</h2></header>
 *     <article>
 *       <h3>Troparion &mdash; Tone 4</h3>
 *       <p>Text of the troparion / with slash line-breaks...</p>
 *     </article>
 *     <article>
 *       <h3>Kontakion &mdash; Tone 8</h3>
 *       <p>Text of the kontakion...</p>
 *     </article>
 *   <article>
 *     <header><h2>Next Saint</h2></header>
 *     ...
 *
 * Returns an array of commemoration objects, each with a troparia array.
 */
function parseTropariaPage(html, month, day) {
  if (!html) return [];

  // Isolate the main content column to avoid sidebar noise
  const mainStart = html.indexOf('id="main-col-contents"');
  const mainEnd   = html.indexOf('id="sidebar"');
  const content   = mainStart !== -1
    ? html.slice(mainStart, mainEnd !== -1 ? mainEnd : html.length)
    : html;

  // The page nests all saints inside one outer <article>.
  // Strategy: split on the <header><h2>SAINT NAME</h2></header> markers,
  // then find the <h3>TYPE</h3><p>TEXT</p> pairs in each resulting section.

  const saintSplitRe = /<header>\s*<h2>([\s\S]*?)<\/h2>\s*<\/header>/gi;
  const hymnRe       = /<h3>([^<]+)<\/h3>\s*<p>([\s\S]*?)<\/p>/gi;

  // Collect all saint header positions and titles
  const markers = [];
  let m;
  while ((m = saintSplitRe.exec(content)) !== null) {
    const title = decodeHTML(m[1].trim());
    if (!title || title.toLowerCase().includes('troparia and kontakia')) continue;
    markers.push({ title, end: m.index + m[0].length });
  }

  if (markers.length === 0) return [];

  const commemorations = [];

  for (let i = 0; i < markers.length; i++) {
    const { title, end } = markers[i];
    const sectionEnd     = markers[i + 1]?.end ?? content.length;
    const section        = content.slice(end, sectionEnd);

    const troparia = [];
    hymnRe.lastIndex = 0;
    let hm;
    while ((hm = hymnRe.exec(section)) !== null) {
      const header  = decodeHTML(hm[1]);
      const rawText = hm[2];
      const text    = cleanHymnText(rawText);
      if (!text) continue;

      const typeMatch = header.match(/(Troparion|Kontakion|Theotokion)/i);
      const toneMatch = header.match(/Tone\s+(\d+)/i);
      if (!typeMatch) continue;

      troparia.push({
        type: typeMatch[1].toLowerCase(),
        tone: toneMatch ? parseInt(toneMatch[1], 10) : null,
        text,
      });
    }

    if (troparia.length > 0) {
      commemorations.push({ slug: null, title, month, day, troparia });
    }
  }

  return commemorations;
}

function cleanHymnText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/\s*\/\s*/g, '\n')     // "/" line-break markers used in OCA text
    .replace(/\*\s*/g, '\n')        // "* " also used as line-break markers
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function decodeHTML(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/<[^>]+>/g, '');
}

// ─── Per-day scraper ─────────────────────────────────────────────────────────

async function scrapeDay(db, month, day) {
  const mm  = String(month).padStart(2, '0');
  const dd  = String(day).padStart(2, '0');
  const url = `${BASE_URL}/saints/troparia/${YEAR}/${mm}/${dd}/`;

  const html = await fetchText(url);
  if (!html) return 0;

  const comms = parseTropariaPage(html, month, day);
  let stored = 0;

  for (const comm of comms) {
    const commId = upsertCommemoration(db, {
      month: comm.month,
      day:   comm.day,
      title: comm.title,
      oca_slug: comm.slug,
    });

    for (const t of comm.troparia) {
      upsertTroparion(db, { commemoration_id: commId, ...t });
      stored++;
    }
  }

  return stored;
}

// ─── Days-in-month ────────────────────────────────────────────────────────────

function daysInMonth(month) {
  // Use a non-leap year for the fixed-calendar Menaion
  return new Date(2025, month, 0).getDate();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const db = openDb();

  if (args.includes('--reset')) {
    db.exec(DROP_DDL);
    db.exec(DDL);
    console.log('Menaion tables reset.\n');
  }

  // Determine which days to scrape
  let days = [];

  const dateArg  = args[args.indexOf('--date') + 1];
  const monthArg = args[args.indexOf('--month') + 1];

  if (args.includes('--date') && dateArg) {
    const [m, d] = dateArg.split('/').map(Number);
    days = [{ month: m, day: d }];
  } else if (args.includes('--month') && monthArg) {
    const m = parseInt(monthArg, 10);
    for (let d = 1; d <= daysInMonth(m); d++) days.push({ month: m, day: d });
  } else {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= daysInMonth(m); d++) days.push({ month: m, day: d });
    }
  }

  console.log(`Scraping ${days.length} day(s) from OCA troparia pages…\n`);

  let totalStored = 0;
  let daysDone    = 0;

  for (const { month, day } of days) {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    process.stdout.write(`  ${mm}/${dd} … `);

    const stored = await scrapeDay(db, month, day);
    totalStored += stored;
    daysDone++;

    if (stored > 0) {
      console.log(`✓  ${stored} hymn(s)`);
    } else {
      console.log('—');
    }

    if (daysDone < days.length) await sleep(RATE_MS);
  }

  console.log(`\nDone. ${totalStored} hymns stored across ${daysDone} days.`);
  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
