/**
 * scrape-octoechos.js
 *
 * Downloads Obikhod (TT) PDFs for all 8 tones from oca.org, extracts
 * the hymn texts using pdftotext, and writes a complete octoechos-scraped.json
 * for review before merging into variable-sources/octoechos.json.
 *
 * Prerequisites:  pdftotext (brew install poppler)
 *
 * Usage:
 *   node scrape-octoechos.js              — scrape all 8 tones
 *   node scrape-octoechos.js --tone 1     — scrape a single tone
 *   node scrape-octoechos.js --tone 1,2   — scrape specific tones
 */

'use strict';

const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { execSync } = require('child_process');

const BASE     = 'https://www.oca.org';
const OUT_FILE = path.join(__dirname, 'octoechos-scraped.json');
const RATE_MS  = 1200;

// ─── PDF URL map per tone ─────────────────────────────────────────────────────
// Keys: stichera, dogmatikon, aposticha, apostichaTheotokion, troparion, dismissalTheotokion

function pdfUrls(n) {
  const t  = `t${n}`;
  const TN = `Tone${n}`;

  // Dogmatikon: tones 1-2 have no -tt suffix
  const dogmatikon = (n <= 2)
    ? `/PDF/Music/${TN}/${t}-lic-dogmatikon-obikhod.pdf`
    : `/PDF/Music/${TN}/${t}-lic-dogmatikon-obikhod-tt.pdf`;

  // Troparion: tones 3 and 5 have no TT version — fall back to plain obikhod
  const troparion = (n === 3 || n === 5)
    ? `/PDF/Music/${TN}/${t}-res-tropar-obikhod.pdf`
    : `/PDF/Music/${TN}/${t}-res-tropar-obikhod-tt.pdf`;

  // Dismissal theotokion: tone 1 uses hyphens; tones 2-8 use dots
  const dismissalTheotokion = (n === 1)
    ? `/PDF/Music/${TN}/${t}-res-dis-theotokion-obikhod-tt.pdf`
    : `/PDF/Music/${TN}/${t}.res.dis.theotokion.obikhod-tt.pdf`;

  return {
    stichera:            `/PDF/Music/${TN}/${t}-lic-stichera-obikhod-tt.pdf`,
    dogmatikon,
    aposticha:           `/PDF/Music/${TN}/${t}-aposticha-obikhod-tt.pdf`,
    apostichaTheotokion: `/PDF/Music/${TN}/${t}-aposticha-theotokion-obikhod-tt.pdf`,
    troparion,
    dismissalTheotokion,
  };
}

// ─── Network ─────────────────────────────────────────────────────────────────

function fetchBinary(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error(`Too many redirects: ${url}`));
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchBinary(next, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── PDF → text ──────────────────────────────────────────────────────────────

async function pdfToText(url) {
  const buf = await fetchBinary(BASE + url);
  const tmp = path.join(os.tmpdir(), `oca-octo-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, buf);
  try {
    return execSync(`pdftotext -layout "${tmp}" -`, { encoding: 'utf8' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

// ─── Text cleaning ───────────────────────────────────────────────────────────

// Characters that indicate a line is music notation rather than lyrics
const MUSIC_CHARS = /[œ˙ϖ∀αβ%>∃∂−−]/;

function cleanLines(raw) {
  // Pre-process: strip Private Use Area characters (music notation glyphs from
  // Petrucci/Maestro fonts that pdftotext cannot map), then strip any mid-line
  // voice-part labels left behind by SATB choral multi-column layout.
  const preprocessed = raw
    .replace(/[\uE000-\uF8FF]/g, '')                        // Private Use Area music glyphs
    .replace(/[ \t]{2,}(Soprano|Alto|Tenor|Bass)[ \t]+/g, ' ');  // inline voice labels (same line only)

  return preprocessed
    .split('\n')
    .map(l => l.trim())
    // Strip choral voice labels at line start (pdftotext layout columns): "Alto   In the Red Sea..."
    .map(l => l.replace(/^(Soprano|Alto|Tenor|Bass)\s{2,}/, ''))
    // Strip rubric markers and stray punctuation artifacts at line start
    .map(l => l.replace(/^[#`]\s*/, ''))
    .filter(l => l.length > 0)
    .filter(l => !MUSIC_CHARS.test(l))
    .filter(l => !/^(Soprano|Alto|Tenor|Bass)\s*$/.test(l))
    .filter(l => !/©/.test(l))
    .filter(l => !/- p\.\s*\d+$/.test(l))             // page headers like "Stichera at... - p. 2"
    .filter(l => !/^arr\. from/.test(l))                // arrangement credit lines
    .filter(l => !/^(L'vov|Bakhmetev|Obikhod|Kievan|Serbian|Russian|Imperial)\s/.test(l))
    .filter(l => !/^(Octoechos|Common Chant)(\s|$)/.test(l))
    .filter(l => !/^Resurrectional\s+The[ot]tokion/.test(l)) // repeated PDF section header (incl. typo)
    .filter(l => !/^Resurrectional\s+Dismissal/.test(l))
    .filter(l => !/^Theotokion.*Tone\s*\d/.test(l))          // "TheotokionTone 1" page header
    .filter(l => !/^w{1,3}$/.test(l))                        // standalone note-value symbols
    .filter(l => l !== '−' && l !== '-');
}

/**
 * Join fragments into clean prose.
 * - Removes inline syllable-continuation hyphens: "Ac-cept" → "Accept"
 * - Removes spaced syllable hyphens: "ho - ly" → "holy"
 * - Preserves real hyphens at word boundaries: "life-bearing" → "life-bearing"
 * - Converts // breath marks to a newline
 * - Collapses multiple spaces
 * - Trims leading/trailing whitespace from the result
 */
function joinFragments(fragments) {
  let text = fragments
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ');

  // Remove all forms of music syllable hyphens:
  //   "ho - ly" → "holy"    (space-dash-space)
  //   "heav -ens" → "heavens"  (space before dash, no space after)
  //   "Grant- ing" → "Granting"  (no space before dash, space after)
  text = text.replace(/(\w)\s+-\s*(\w)/g, '$1$2');
  text = text.replace(/(\w)\s*-\s+(\w)/g, '$1$2');
  // Remove inline syllable hyphens between lowercase letters: "Ac-cept" → "Accept"
  // Exception: keep known compound-word patterns by checking surrounding word length.
  // Heuristic: if the segment after the hyphen is 1-2 chars, it's a syllable break.
  text = text.replace(/([a-z])-([a-z]{1,2})(?=[^a-z]|$)/g, '$1$2');
  // For remaining inline hyphens between lowercase letters, join (music syllable breaks)
  text = text.replace(/([a-z])-([a-z])/g, '$1$2');

  // Convert // breath marks to line breaks
  text = text.replace(/\s*\/\/\s*/g, '\n');

  // Remove stray placeholder/notation artifacts from pdftotext
  text = text.replace(/ \? /g, ' ');
  text = text.replace(/\? /g, '');
  // Remove inline note-value symbols (brevis rendered as "w"): "salvation, w O" → "salvation, O"
  text = text.replace(/\s+w{1,3}(?=\s)/g, '');
  text = text.replace(/\s+w{1,3}$/gm, '');
  // Remove bracketed rubric insertions: "[virgin while giving birth]"
  text = text.replace(/\s*\[[^\]]{0,60}\]\s*/g, ' ');
  // Remove underscore artifacts
  text = text.replace(/_/g, '');
  // Remove embedded page headers (repeated section titles mid-text from multi-column layout)
  text = text.replace(/\s*Resurrectional\s+The\w+ion[^,\n]{0,30},?\s*Tone\s*\d+[^\n]{0,60}Chant\s*/g, ' ');
  // Remove isolated musical accidental symbols (flat ♭ rendered as "b") between words
  text = text.replace(/(\w)\s+b\s+([a-z])/g, '$1 $2');  // "by b angels" → "by angels"

  // Collapse multiple spaces
  text = text.replace(/  +/g, ' ');

  // Remove trailing punctuation artifacts
  text = text.replace(/"\s*$/, '');

  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n');
}

// ─── Stichera parser ─────────────────────────────────────────────────────────

/**
 * Parses a stichera PDF's text into an array of hymn text strings.
 * Stichera are delimited by "Sticheron N" markers.
 */
function parseStichera(raw) {
  const lines = cleanLines(raw);

  const hymns = [];
  let current = [];
  let inHymn  = false;

  for (const line of lines) {
    if (/^Sticheron\s+\d+/.test(line)) {
      if (inHymn && current.length > 0) {
        hymns.push(joinFragments(current));
      }
      current = [];
      inHymn  = true;
    } else if (inHymn) {
      // Skip tone/arrangement headers that sneak through
      if (/^Tone\s+\d/.test(line) || /^arr\./.test(line)) continue;
      current.push(line);
    }
  }
  if (inHymn && current.length > 0) {
    hymns.push(joinFragments(current));
  }

  return hymns;
}

/**
 * Parses a single-hymn PDF (dogmatikon, troparion, theotokion).
 * Strips leading section headers and trailing rubric text.
 * Returns the cleaned text of the primary hymn.
 */
function parseSingleHymn(raw) {
  const lines = cleanLines(raw);

  // Drop leading header/title lines
  const HEADERS = /^(Tone\s+\d|Resurrectional\s+Troparion|Theotokion|Dogmatikon|Dismissal|Kontakion|Obikhod|Kievan|Serbian|Russian|Common\s+Chant|Sticheron\s+\d)/i;
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (HEADERS.test(lines[i])) { start = i + 1; }
  }

  // Truncate at rubric text (instructions in the score) — typically starts with
  // "Then", "If there is", or lines with only stage-direction language
  const RUBRIC = /^(Then\b|If there is|The tone of|Gloria[^r])/i;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (RUBRIC.test(lines[i])) { end = i; break; }
  }

  return joinFragments(lines.slice(start, end));
}

/**
 * Parses an aposticha PDF. Returns { idiomelon, hymns, glory } where:
 * - hymns: all unique stichera (typically 3-4 for a tone's aposticha)
 * - idiomelon: first sticheron (same as hymns[0], kept for backward compat)
 * - glory: the Glory doxastichon if present (rare in Octoechos aposticha PDFs)
 *
 * Psalm verse rubrics ("V. The Lord is King...") are stripped from each
 * sticheron — they appear inline after the text in these SATB PDFs.
 */
function parseAposticha(raw) {
  const lines = cleanLines(raw);

  const STOP  = /^(Then\b|If there is|The tone of)/i;
  const GLORY = /^Glory\b/i;
  const NOW   = /^Now and ever\b/i;

  // ── Split on "Sticheron N" markers ──────────────────────────────────────────
  const hymns = [];
  let current = [];
  let inHymn  = false;

  for (const line of lines) {
    if (/^Sticheron\s+\d+/.test(line)) {
      if (inHymn && current.length > 0) hymns.push(joinFragments(current));
      current = [];
      inHymn  = true;
    } else if (STOP.test(line)) {
      if (inHymn && current.length > 0) hymns.push(joinFragments(current));
      break;
    } else if (inHymn) {
      if (/^(Tone\s+\d|arr\.)/.test(line)) continue;
      current.push(line);
    }
  }
  if (inHymn && current.length > 0) hymns.push(joinFragments(current));

  // Strip psalm verse rubrics appended after the sticheron text.
  // Pattern: "V. [Capitalized verse text]" appearing inline at the end.
  const cleanedHymns = hymns.map(h =>
    h.replace(/\s+V\.\s+[A-Z][\s\S]*$/, '').trim()
  );

  // ── Glory doxastichon (uncommon in Octoechos aposticha PDFs) ────────────────
  let glory = null;
  const gloryStart = lines.findIndex(l => GLORY.test(l));
  if (gloryStart !== -1) {
    const gloryEnd = lines.findIndex((l, i) => i > gloryStart && NOW.test(l));
    const gloryLines = lines.slice(gloryStart + 1, gloryEnd !== -1 ? gloryEnd : undefined);
    const gloryText = joinFragments(gloryLines).trim();
    if (gloryText) glory = gloryText;
  }

  return { idiomelon: cleanedHymns[0] || null, hymns: cleanedHymns, glory };
}

// ─── Per-tone scraper ────────────────────────────────────────────────────────

async function scrapeTone(n) {
  const urls  = pdfUrls(n);
  const result = {};

  for (const [key, urlPath] of Object.entries(urls)) {
    process.stdout.write(`    ${key} … `);
    try {
      const raw  = await pdfToText(urlPath);
      let preview;
      if (key === 'aposticha') {
        const parsed = parseAposticha(raw);
        result.aposticha      = parsed.idiomelon;   // kept for backward compat
        result.apostichaHymns = parsed.hymns;       // all stichera
        result.apostichaGlory = parsed.glory;
        preview = `[${parsed.hymns.length} stichera] `
                + (parsed.hymns[0] || '').slice(0, 40).replace(/\n/g, ' ') + '…'
                + (parsed.glory ? ' [+glory]' : '');
      } else {
        const text = key === 'stichera' ? parseStichera(raw) : parseSingleHymn(raw);
        result[key] = text;
        preview = Array.isArray(text)
          ? `[${text.length} stichera]`
          : text.slice(0, 50).replace(/\n/g, ' ') + '…';
      }
      console.log(`✓  ${preview}`);
    } catch (err) {
      console.log(`✗  ${err.message}`);
      result[key] = null;
    }
    await sleep(RATE_MS);
  }

  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const toneArg = args.indexOf('--tone');

  let tones = [1, 2, 3, 4, 5, 6, 7, 8];
  if (toneArg !== -1 && args[toneArg + 1]) {
    tones = args[toneArg + 1].split(',').map(Number).filter(n => n >= 1 && n <= 8);
  }

  console.log(`Scraping Octoechos tones: ${tones.join(', ')}\n`);

  const output = {};

  for (const n of tones) {
    console.log(`\nTone ${n}:`);
    output[`tone${n}`] = await scrapeTone(n);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nWritten to ${path.relative(__dirname, OUT_FILE)}`);
  console.log('Review, then merge into variable-sources/octoechos.json');
}

main().catch(err => { console.error(err); process.exit(1); });
