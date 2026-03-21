#!/usr/bin/env node
/**
 * scrape-eothinon.js
 *
 * Scrapes the 11 Eothinon cycle texts (exapostilaria, theotokia, doxastica/stichera)
 * from johnsanidopoulos.com blog posts.
 *
 * Each eothinon has:
 *   - Exapostilarion (Svetilen) — hymn sung after the canon
 *   - Theotokion — hymn to the Theotokos paired with the exapostilarion
 *   - Doxastikon (Morning Gospel Sticheron) — sung at Lauds after "Glory..."
 *
 * The 11 Sunday Matins Gospel readings are also included (well-known, invariable).
 *
 * Output: eothinon-scraped.json
 * Source: johnsanidopoulos.com (GOA-style, you/your translation)
 * Tagged _source: "johnsanidopoulos-goarch" for future OCA replacement.
 *
 * Usage: node scrape-eothinon.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ─── The 11 Eothinon URLs ──────────────────────────────────────────────────

const EOTHINON_URLS = [
  'https://www.johnsanidopoulos.com/2019/11/exaposteilarion-and-doxastikon-of-first.html',
  'https://www.johnsanidopoulos.com/2019/12/exaposteilarion-and-doxastikon-of.html',
  'https://www.johnsanidopoulos.com/2019/12/exaposteilarion-and-doxastikon-of-third.html',
  'https://www.johnsanidopoulos.com/2019/12/exaposteilarion-and-doxastikon-of_15.html',
  'https://www.johnsanidopoulos.com/2019/12/exaposteilarion-and-doxastikon-of-fifth.html',
  'https://www.johnsanidopoulos.com/2019/12/exaposteilarion-and-doxastikon-of-sixth.html',
  'https://www.johnsanidopoulos.com/2020/01/exaposteilarion-and-doxastikon-of.html',
  'https://www.johnsanidopoulos.com/2020/01/exaposteilarion-and-doxastikon-of_12.html',
  'https://www.johnsanidopoulos.com/2020/01/exaposteilarion-and-doxastikon-of-ninth.html',
  'https://www.johnsanidopoulos.com/2020/01/exaposteilarion-and-doxastikon-of-tenth.html',
  'https://www.johnsanidopoulos.com/2020/02/exaposteilarion-and-doxastikon-of.html',
];

// ─── The 11 Sunday Matins Gospels ───────────────────────────────────────────

const EOTHINON_GOSPELS = [
  { reading: 'Matthew 28:16-20',  number: 116 },
  { reading: 'Mark 16:1-8',       number: 70  },
  { reading: 'Mark 16:9-20',      number: 71  },
  { reading: 'Luke 24:1-12',      number: 112 },
  { reading: 'Luke 24:12-35',     number: 113 },
  { reading: 'Luke 24:36-53',     number: 114 },
  { reading: 'John 20:1-10',      number: 63  },
  { reading: 'John 20:11-18',     number: 64  },
  { reading: 'John 20:19-31',     number: 65  },
  { reading: 'John 21:1-14',      number: 66  },
  { reading: 'John 21:15-25',     number: 67  },
];

// ─── Eothinon tone mapping ──────────────────────────────────────────────────
// Each eothinon has its own prescribed tone for the exapostilarion/sticheron

const EOTHINON_TONES = [1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 8];

// ─── Fetch helper ───────────────────────────────────────────────────────────

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (OCA-Services scraper)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ─── HTML text extraction ───────────────────────────────────────────────────

function stripHTML(html) {
  // Replace <br> and block elements with newlines
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#146;/g, '\u2019')  // right single quote
    .replace(/&#147;/g, '\u201C')  // left double quote
    .replace(/&#148;/g, '\u201D')  // right double quote
    .replace(/&#8209;/g, '-')      // non-breaking hyphen → regular hyphen
    .replace(/&#8211;/g, '\u2013') // en dash
    .replace(/&#8212;/g, '\u2014') // em dash
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

/**
 * Parse the eothinon text from a johnsanidopoulos.com blog post.
 *
 * The posts have an "English" section (marked by <b>English</b>) followed by
 * a "Greek" section (marked by <b>Greek</b>). Within the English section:
 *   - EXAPOSTEILARION N — the exapostilarion text
 *   - Theotokion — the theotokion text
 *   - DOXASTIKON — the doxastikon text (with "Eothinon N" and tone line)
 */
function parseEothinon(html, number) {
  // Extract English section between <b>English</b> and <b>Greek</b>
  const engIdx = html.indexOf('<b>English</b>');
  if (engIdx < 0) return { exapostilarion: null, theotokion: null, doxastikon: null };

  const greekIdx = html.indexOf('<b>Greek</b>', engIdx);
  const endIdx = greekIdx > 0 ? greekIdx : html.length;
  const englishHTML = html.substring(engIdx, endIdx);

  const text = stripHTML(englishHTML);
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  let exapostilarion = null;
  let theotokion = null;
  let doxastikon = null;

  let mode = null;
  let current = [];

  function flush() {
    if (!mode || current.length === 0) return;
    const hymn = current.join('\n');
    if (mode === 'exapostilarion' && !exapostilarion) exapostilarion = hymn;
    else if (mode === 'theotokion' && !theotokion) theotokion = hymn;
    else if (mode === 'doxastikon' && !doxastikon) doxastikon = hymn;
    current = [];
  }

  for (const line of lines) {
    // Skip "English" header itself
    if (/^English$/i.test(line)) continue;

    // Detect section headers
    if (/^EXAPOST[EI]+L[AI]RION|^Photagogikon|^Svetilen/i.test(line)) {
      flush();
      mode = 'exapostilarion';
      continue;
    }
    if (/^Theotokion/i.test(line)) {
      flush();
      mode = 'theotokion';
      continue;
    }
    if (/^DOXAST[IY]KON/i.test(line)) {
      flush();
      mode = 'doxastikon';
      continue;
    }

    // Skip metadata lines (tone, eothinon number, mode labels)
    if (/^Eothinon \d/i.test(line)) continue;
    if (/^\d+(st|nd|rd|th) Tone$/i.test(line)) continue;
    if (/^Plagal/i.test(line)) continue;
    if (/^Tone \d/i.test(line)) continue;
    if (/^Mode/i.test(line)) continue;
    if (/^Grave Tone$/i.test(line)) continue;
    if (/^(First|Second|Third|Fourth) Mode$/i.test(line)) continue;

    if (mode) {
      current.push(line);
    }
  }
  flush();

  return { exapostilarion, theotokion, doxastikon };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const results = {};

  for (let i = 0; i < 11; i++) {
    const num = i + 1;
    const url = EOTHINON_URLS[i];
    console.log(`Fetching Eothinon ${num}...`);

    try {
      const html = await fetchURL(url);
      const parsed = parseEothinon(html, num);

      console.log(`  Exapostilarion: ${parsed.exapostilarion ? parsed.exapostilarion.substring(0, 60) + '...' : 'MISSING'}`);
      console.log(`  Theotokion: ${parsed.theotokion ? parsed.theotokion.substring(0, 60) + '...' : 'MISSING'}`);
      console.log(`  Doxastikon: ${parsed.doxastikon ? parsed.doxastikon.substring(0, 60) + '...' : 'MISSING'}`);

      results[num] = {
        _source: 'johnsanidopoulos-goarch',
        _sourceUrl: url,
        tone: EOTHINON_TONES[i],
        gospel: EOTHINON_GOSPELS[i],
        exapostilarion: parsed.exapostilarion,
        theotokion: parsed.theotokion,
        doxastikon: parsed.doxastikon,
      };
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results[num] = { error: err.message };
    }

    // Be polite — small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  const outPath = path.join(__dirname, 'eothinon-scraped.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n');
  console.log(`\nWritten to ${outPath}`);

  // Summary
  let complete = 0;
  for (let i = 1; i <= 11; i++) {
    const r = results[i];
    if (r.exapostilarion && r.theotokion && r.doxastikon) complete++;
  }
  console.log(`Complete: ${complete}/11`);
}

main().catch(err => { console.error(err); process.exit(1); });
