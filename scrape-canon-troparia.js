#!/usr/bin/env node
/**
 * scrape-canon-troparia.js
 *
 * Parses the St. Sergius Octoechos Sunday PDFs and extracts all canon troparia
 * for each tone's Sunday Matins Resurrection Canon.
 *
 * Each ode contains three interleaved canons:
 *   1. Resurrection Canon — irmos + 2 troparia + theotokion
 *   2. Cross-Resurrection Canon — 2-3 troparia + theotokion
 *   3. Theotokos Canon — 3 troparia
 *
 * Source: https://st-sergius.org/services/oktiochos/Tone{N}.pdf
 *
 * Output: canon-troparia-scraped.json for review before merging.
 *
 * Prerequisites: pdftotext (brew install poppler)
 *
 * Usage:
 *   node scrape-canon-troparia.js              — parse all 8 tones
 *   node scrape-canon-troparia.js --tone 1     — parse a single tone
 *   node scrape-canon-troparia.js --download   — download PDFs first
 */

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

const SRC_DIR  = '/tmp';
const OUT_FILE = path.join(__dirname, 'canon-troparia-scraped.json');

// ─── Download ───────────────────────────────────────────────────────────────

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

async function downloadAll() {
  for (let i = 1; i <= 8; i++) {
    const pdfPath = path.join(SRC_DIR, `tone${i}-sunday.pdf`);
    const txtPath = path.join(SRC_DIR, `tone${i}-sunday.txt`);
    if (fs.existsSync(txtPath)) {
      console.log(`  Tone ${i}: cached`);
      continue;
    }
    const url = `https://st-sergius.org/services/oktiochos/Tone${i}.pdf`;
    console.log(`  Tone ${i}: downloading ${url}`);
    const buf = await fetchBinary(url);
    fs.writeFileSync(pdfPath, buf);
    execSync(`pdftotext "${pdfPath}" "${txtPath}"`);
    console.log(`  Tone ${i}: ${fs.readFileSync(txtPath, 'utf8').split('\n').length} lines`);
    await new Promise(r => setTimeout(r, 800));
  }
}

// ─── Text cleaning ──────────────────────────────────────────────────────────

function cleanText(raw) {
  let text = raw
    .replace(/\r\n/g, '\n')
    .replace(/\n(?=[a-z,;])/g, ' ')
    .replace(/\s*\*\*\s*/g, ' ')
    .replace(/\s*\*\s*/g, ' ')
    .replace(/\s*\/\/\s*/g, ' ')
    .replace(/  +/g, ' ')
    .trim();
  return text;
}

function cleanHymn(lines) {
  return cleanText(lines.join('\n'));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function romanToInt(s) {
  const map = { I: 1, V: 5, X: 10 };
  let result = 0;
  for (let i = 0; i < s.length; i++) {
    const curr = map[s[i]] || 0;
    const next = map[s[i + 1]] || 0;
    result += curr < next ? -curr : curr;
  }
  return result;
}

function readTone(n) {
  const txtPath = path.join(SRC_DIR, `tone${n}-sunday.txt`);
  if (!fs.existsSync(txtPath)) {
    throw new Error(`Missing ${txtPath} — run with --download first`);
  }
  return fs.readFileSync(txtPath, 'utf8').replace(/\f/g, '').split('\n');
}

function findLine(lines, pattern, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

// ─── Canon Parser ───────────────────────────────────────────────────────────

/**
 * Determines which ode a line index belongs to by looking backward for an
 * ODE marker or the "Resurrection Canon" header (= Ode 1).
 */
function findOdeNumber(lines, idx) {
  for (let j = idx - 1; j >= Math.max(0, idx - 10); j--) {
    const normalized = lines[j].replace(/\s+/g, '');
    const odeMatch = normalized.match(/^ODE([IVX]+)/i);
    if (odeMatch) return romanToInt(odeMatch[1]);
    if (/Resurrection Canon/i.test(lines[j])) return 1;
  }
  return null;
}

/**
 * Collect text lines starting at `start` until the next structural marker.
 * Returns the cleaned text.
 */
function collectTropText(lines, start) {
  const collected = [];
  for (let j = start; j < lines.length; j++) {
    const t = lines[j].trim();
    if (!t) {
      // Allow one blank line within a troparion (PDF formatting)
      if (j + 1 < lines.length && lines[j + 1].trim()) continue;
      break;
    }
    // Stop at structural markers
    if (/^Refrain:/i.test(t)) break;
    if (/^Another/i.test(t)) break;
    if (/^Troparia from the Menaion/i.test(t) || /^The Troparia from/i.test(t)) break;
    if (/^The small litany/i.test(t)) break;
    if (/^ODE?\s/i.test(t.replace(/\s+/g, '')) && /^O\s*D\s*E\s/i.test(t)) break;
    if (/^Irmos:/i.test(t)) break;
    if (/^Resurrection Kontakion/i.test(t)) break;
    if (/^Ikos:/i.test(t)) break;
    if (/^After the Troparia/i.test(t)) break;
    if (/^Verse:/i.test(t) && /Magnificat|magnify/i.test(lines[j + 1] || '')) break;
    if (/^(AT LITURGY|SUNDAY MORNING)/i.test(t)) break;
    collected.push(t);
  }
  return cleanHymn(collected);
}

/**
 * Parse all canon troparia from a tone's text.
 *
 * Strategy: walk through the canon section line by line, tracking the current
 * ode and current canon type (resurrection, cross-resurrection, theotokos).
 * Each "Refrain:" marks the start of a new troparion. The text between the
 * refrain line and the next structural marker is the troparion text.
 */
function parseCanonTroparia(allLines, toneNum) {
  // Find canon start — some tones say "Resurrection Canon Tone N",
  // others say "Then the Canons:" followed by "Tone N: A composition..."
  let canonStart = findLine(allLines, /Resurrection Canon/i);
  if (canonStart === -1) {
    canonStart = findLine(allLines, /Then the Canons:/i);
  }
  if (canonStart === -1) {
    console.log(`  WARNING: No canon start marker found`);
    return null;
  }

  // Find canon end (Magnificat, or Kontakion for Ode 6, or Exapostilarion section)
  // We'll parse until we hit the post-Ode-9 section
  const canonEnd = findLine(allLines, /^(Exapostilarion|Svetilen|Then,\s*"Holy is|AT LITURGY|SUNDAY MORNING)/i, canonStart);
  const section = allLines.slice(canonStart, canonEnd === -1 ? allLines.length : canonEnd);

  const result = {};
  let currentOde = 1;
  let currentCanon = 'resurrection'; // resurrection | crossResurrection | theotokos
  let skipUntilNextOde = false; // skip Magnificat/katavasia sections

  const REFRAINS = {
    resurrection: 'Glory to Thy holy Resurrection, O Lord.',
    crossResurrection: 'Glory to Thy precious Cross and Resurrection, O Lord.',
    theotokos: 'Most holy Theotokos, save us.',
  };

  for (let i = 0; i < section.length; i++) {
    const line = section[i].trim();

    // Detect ode boundaries
    const normalized = line.replace(/\s+/g, '');
    const odeMatch = normalized.match(/^ODE([IVX]+)$/i);
    if (odeMatch) {
      currentOde = romanToInt(odeMatch[1]);
      currentCanon = 'resurrection';
      skipUntilNextOde = false;
      continue;
    }
    if (/^Resurrection Canon/i.test(line)) {
      currentOde = 1;
      currentCanon = 'resurrection';
      skipUntilNextOde = false;
      continue;
    }

    // "Troparia from the Menaion" marks end of this ode's Octoechos content
    // Skip everything until the next ODE marker (avoids Magnificat, katavasia)
    if (/Troparia from the Menaion/i.test(line) || /^After the Troparia/i.test(line)) {
      skipUntilNextOde = true;
      continue;
    }

    // Skip Magnificat section, kontakion/ikos, and other inter-ode content
    if (skipUntilNextOde) continue;

    // Also skip the Kontakion/Ikos that appears after Ode 6
    if (/^Resurrection Kontakion/i.test(line) || /^Ikos:/i.test(line)) {
      skipUntilNextOde = true;
      continue;
    }

    // Detect canon type switches
    if (/^Another.*Cross and Resurrection/i.test(line) || /^Another Canon.*Cross/i.test(line)) {
      currentCanon = 'crossResurrection';
      continue;
    }
    if (/^Another.*Theotokos/i.test(line) || /^Another Canon.*Theotokos/i.test(line)) {
      currentCanon = 'theotokos';
      continue;
    }

    // Skip irmos (already scraped separately)
    if (/^Irmos:/i.test(line)) {
      // Skip past the irmos text
      while (i + 1 < section.length) {
        const next = section[i + 1].trim();
        if (!next || /^Refrain:/i.test(next) || /^Another/i.test(next) ||
            /^Troparia/i.test(next) || /^ODE/i.test(next.replace(/\s+/g, ''))) break;
        i++;
      }
      continue;
    }

    // Process refrain → troparion
    if (/^Refrain:/i.test(line)) {
      const refrainText = line.replace(/^Refrain:\s*/i, '').trim();

      // Skip Magnificat refrains ("More honorable...")
      if (/More honorable/i.test(refrainText)) continue;

      // Determine which canon this refrain belongs to
      if (/Glory to Thy holy Resurrection/i.test(refrainText)) {
        currentCanon = 'resurrection';
      } else if (/Glory to Thy precious Cross/i.test(refrainText)) {
        currentCanon = 'crossResurrection';
      } else if (/Most holy Theotokos/i.test(refrainText)) {
        // Could be theotokion of any canon — keep currentCanon as-is
      }

      // Collect the troparion text following the refrain
      const tropText = collectTropText(section, i + 1);
      if (!tropText) continue;

      // Initialize ode entry
      if (!result[currentOde]) result[currentOde] = [];

      // Detect if this is a theotokion
      const isTheotokion = /^Theotokion:/i.test(tropText);
      const cleanedText = tropText.replace(/^Theotokion:\s*/i, '');

      result[currentOde].push({
        canon: currentCanon,
        refrain: REFRAINS[currentCanon] || refrainText,
        text: cleanedText,
        ...(isTheotokion ? { type: 'theotokion' } : {}),
      });

      // Skip past the troparion text
      for (let j = i + 1; j < section.length; j++) {
        const t = section[j].trim();
        if (!t) { i = j; break; }
        if (/^Refrain:|^Another|^Troparia|^The Troparia|^The small litany|^Irmos:|^Resurrection Kontakion|^Ikos:|^After the Troparia|^Verse:/i.test(t)) {
          i = j - 1;
          break;
        }
        if (/^ODE/i.test(t.replace(/\s+/g, ''))) { i = j - 1; break; }
        i = j;
      }
    }

    // "The Troparia from the Menaion" marks end of ode's Octoechos troparia
    if (/Troparia from the Menaion/i.test(line)) {
      // Reset canon type for next ode
      currentCanon = 'resurrection';
    }
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function parseTone(n) {
  console.log(`\nParsing Tone ${n}...`);
  const lines = readTone(n);

  // Find AT MATINS section
  const matinsStart = findLine(lines, /^AT MATINS/i);
  if (matinsStart === -1) {
    console.log(`  WARNING: No "AT MATINS" marker found for Tone ${n}`);
    return null;
  }

  const matinsEnd = findLine(lines, /^(SUNDAY MORNING|AT LITURGY)/i, matinsStart + 1);
  const matinsLines = lines.slice(matinsStart, matinsEnd === -1 ? lines.length : matinsEnd);

  const canonTroparia = parseCanonTroparia(matinsLines, n);

  if (!canonTroparia) return null;

  // Report
  const odes = Object.keys(canonTroparia).sort((a, b) => a - b);
  let total = 0;
  for (const ode of odes) {
    const troparia = canonTroparia[ode];
    const resCt = troparia.filter(t => t.canon === 'resurrection').length;
    const crossCt = troparia.filter(t => t.canon === 'crossResurrection').length;
    const thCt = troparia.filter(t => t.canon === 'theotokos').length;
    console.log(`  Ode ${ode}: ${troparia.length} troparia (res=${resCt}, cross=${crossCt}, theotokos=${thCt})`);
    total += troparia.length;
  }
  console.log(`  TOTAL: ${total} troparia across ${odes.length} odes`);

  return {
    _source: 'stSergius-octoechos',
    canonTroparia,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const doDownload = args.includes('--download');
  const toneArg = args.find((_, i, a) => a[i - 1] === '--tone');
  const tones = toneArg ? toneArg.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];

  if (doDownload) {
    console.log('Downloading St. Sergius Octoechos PDFs...');
    await downloadAll();
  }

  const result = {};
  for (const n of tones) {
    result[`tone${n}`] = await parseTone(n);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\nWritten to ${OUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
