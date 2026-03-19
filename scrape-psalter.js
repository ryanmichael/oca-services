'use strict';

/**
 * scrape-psalter.js
 *
 * Downloads all 150 psalms from the Brenton Septuagint translation at
 * https://ebible.org/eng-Brenton/PSA{NNN}.htm and writes them to
 * fixed-texts/psalter.json.
 *
 * The Brenton (1851) uses Septuagint (LXX) numbering, which matches
 * the Orthodox liturgical tradition.
 *
 * Usage:
 *   node scrape-psalter.js             — scrape all 150 psalms
 *   node scrape-psalter.js 1 50        — scrape psalms 1–50 only
 *   node scrape-psalter.js 118         — scrape a single psalm
 *
 * Prerequisites: pdftotext not needed; pure HTML scraping.
 */

const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const path     = require('path');

const OUT_PATH = path.join(__dirname, 'fixed-texts', 'psalter.json');
const RATE_MS  = 1200;

// ─── Network ─────────────────────────────────────────────────────────────────

function fetchHtml(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error(`Too many redirects: ${url}`));
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchHtml(next, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses a psalm HTML page from eBible.org/eng-Brenton.
 *
 * HTML structure:
 *   <div class='chapterlabel' id="V0">N</div>
 *   <div class='d'><span class="verse" id="V1">1&#160;</span>Title text</div>
 *   <div class='p'>
 *     Continuation of verse 1 text...
 *     <span class="verse" id="V2">2&#160;</span>Verse 2 text...
 *   </div>
 *
 * Approach:
 *   1. Collect inner HTML of all content divs (class=p|d|q|q2|b).
 *   2. Split on <span class="verse"> markers to extract per-verse text.
 *   3. Strip footnote anchors, HTML tags, and decode entities.
 *
 * Returns { number, title, verses: string[] }
 * where verses[0] is the title (if present) and verses[1..] are the psalm body.
 */
function parsePsalm(html, psalmNum) {
  // ── 1. Strip footnote anchors (including popup spans inside them) ────────────
  // <a href="#FN1" class="notemark">*<span class="popup">Gr. pestilent.</span></a>
  let h = html.replace(/<a[^>]+class="notemark"[^>]*>[\s\S]*?<\/a>/gi, '');

  // ── 2. Unwrap <span class='add'> and <span class='sc'> (keep text) ──────────
  h = h.replace(/<span class='(?:add|sc)'>([\s\S]*?)<\/span>/gi, '$1');

  // ── 3. Collect content divs in document order ────────────────────────────────
  const contentDivRe = /<div class='(?:p|d|q|q2)'[^>]*>([\s\S]*?)<\/div>/gi;
  const parts = [];
  let m;
  while ((m = contentDivRe.exec(h)) !== null) {
    parts.push(m[1]);
  }
  const joined = parts.join('\n');

  // ── 4. Find all verse markers and their positions ────────────────────────────
  // Matches: <span class="verse" id="V1">1&#160;</span>
  const markerRe = /<span[^>]+id="V(\d+)"[^>]*>[^<]*<\/span>/gi;
  const markers  = [];
  let vm;
  while ((vm = markerRe.exec(joined)) !== null) {
    markers.push({ n: parseInt(vm[1], 10), end: vm.index + vm[0].length });
  }

  // ── 5. Extract text for each verse ───────────────────────────────────────────
  const verses = [];
  for (let i = 0; i < markers.length; i++) {
    const start  = markers[i].end;
    const end    = i + 1 < markers.length ? markers[i + 1].end - markers[i + 1].end + markers[i + 1].end
                                          : joined.length;
    // text between this marker's end and next marker's start
    const nextStart = i + 1 < markers.length
      ? joined.lastIndexOf('<span', markers[i + 1].end - 1)
      : joined.length;
    let text = joined.slice(start, nextStart);

    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode common HTML entities
    text = text
      .replace(/&#160;/g,  ' ')
      .replace(/&amp;/g,   '&')
      .replace(/&lt;/g,    '<')
      .replace(/&gt;/g,    '>')
      .replace(/&quot;/g,  '"')
      .replace(/&#8216;/g, '\u2018')
      .replace(/&#8217;/g, '\u2019')
      .replace(/&#8220;/g, '\u201C')
      .replace(/&#8221;/g, '\u201D')
      .replace(/&#8212;/g, '\u2014')
      .replace(/&nbsp;/g,  ' ');

    // Normalise whitespace
    text = text.replace(/\s+/g, ' ').trim();

    if (text) verses.push(text);
  }

  // Psalm title = verse 1 if it's a short heading like "A Psalm of David."
  const title = verses.length > 0 && verses[0].length < 80 ? verses[0] : null;

  return { number: psalmNum, title, verses };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args  = process.argv.slice(2).map(Number).filter(Boolean);
  const start = args[0] ?? 1;
  const end   = args[1] ?? (args[0] ? args[0] : 150);

  // Load existing output if present (to allow incremental runs)
  let psalter = {};
  if (fs.existsSync(OUT_PATH)) {
    psalter = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    console.log(`Loaded existing psalter.json (${Object.keys(psalter).length} psalms).`);
  }

  console.log(`Scraping Psalms ${start}–${end} from eBible.org Brenton Septuagint…\n`);

  let ok = 0, fail = 0;
  for (let n = start; n <= end; n++) {
    const nn  = String(n).padStart(3, '0');
    const url = `https://ebible.org/eng-Brenton/PSA${nn}.htm`;
    process.stdout.write(`  Psalm ${n}… `);

    try {
      const html  = await fetchHtml(url);
      const psalm = parsePsalm(html, n);
      psalter[n]  = psalm;
      console.log(`✓  ${psalm.verses.length} verses${psalm.title ? ' (title: "' + psalm.title.slice(0, 40) + '")' : ''}`);
      ok++;
    } catch (err) {
      console.log(`✗  ${err.message}`);
      fail++;
    }

    if (n < end) await sleep(RATE_MS);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(psalter, null, 2));
  console.log(`\n✓ ${ok} psalms saved  ✗ ${fail} failed  → ${OUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
