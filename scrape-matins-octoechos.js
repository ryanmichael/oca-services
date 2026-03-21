#!/usr/bin/env node
/**
 * scrape-matins-octoechos.js
 *
 * Parses the St. Sergius Octoechos Sunday PDFs (pre-converted to .txt via
 * pdftotext) and extracts all Sunday Matins variable content for each tone.
 *
 * Source: https://st-sergius.org/services/oktiochos/Tone{N}.pdf
 *
 * For each tone, extracts:
 *   - Sessional hymns (after Kathisma II and III)
 *   - Hypakoë (post-evlogitaria sessional hymn)
 *   - Antiphons of Degrees (Songs of Ascent) — 3 antiphons (4 for Tone 8)
 *   - Matins prokeimenon
 *   - Post-Gospel sticheron (the tone-specific one, not the eothinon)
 *   - Lauds/Praises stichera (8 resurrectional)
 *   - Canon irmoi (Odes I, III-IX)
 *
 * Output: matins-octoechos-scraped.json for review before merging.
 *
 * Prerequisites: pdftotext (brew install poppler)
 *
 * Usage:
 *   node scrape-matins-octoechos.js              — parse all 8 tones
 *   node scrape-matins-octoechos.js --tone 1     — parse a single tone
 *   node scrape-matins-octoechos.js --download   — download PDFs first
 */

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const os    = require('os');
const path  = require('path');
const { execSync } = require('child_process');

const SRC_DIR  = '/tmp';
const OUT_FILE = path.join(__dirname, 'matins-octoechos-scraped.json');

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

/**
 * Clean St. Sergius text: remove phrasing marks (* and **), normalize
 * whitespace, join hyphenated words from line breaks.
 */
function cleanText(raw) {
  let text = raw
    .replace(/\r\n/g, '\n')
    // Join lines that are continuation (next line starts lowercase or with punctuation)
    .replace(/\n(?=[a-z,;])/g, ' ')
    // Remove phrasing marks
    .replace(/\s*\*\*\s*/g, ' ')
    .replace(/\s*\*\s*/g, ' ')
    // Remove breath marks
    .replace(/\s*\/\/\s*/g, ' ')
    // Collapse whitespace
    .replace(/  +/g, ' ')
    .trim();
  return text;
}

/**
 * Clean a hymn text block: handles multi-line blocks from the PDF.
 */
function cleanHymn(lines) {
  return cleanText(lines.join('\n'));
}

// ─── Section extractors ─────────────────────────────────────────────────────

function readTone(n) {
  const txtPath = path.join(SRC_DIR, `tone${n}-sunday.txt`);
  if (!fs.existsSync(txtPath)) {
    throw new Error(`Missing ${txtPath} — run with --download first`);
  }
  return fs.readFileSync(txtPath, 'utf8').replace(/\f/g, '').split('\n');
}

/**
 * Find line index matching a pattern, starting from `from`.
 */
function findLine(lines, pattern, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

/**
 * Extract lines between two patterns (exclusive of the boundary lines).
 */
function extractBetween(lines, startPattern, endPattern, from = 0) {
  const start = findLine(lines, startPattern, from);
  if (start === -1) return { lines: [], startIdx: -1, endIdx: -1 };
  const end = findLine(lines, endPattern, start + 1);
  if (end === -1) return { lines: lines.slice(start + 1), startIdx: start, endIdx: lines.length };
  return { lines: lines.slice(start + 1, end), startIdx: start, endIdx: end };
}

/**
 * Parse sessional hymns after a kathisma reading.
 * Returns { hymn1, hymn2, theotokion } or similar structure.
 */
function parseSessionalHymns(allLines, kathismaMarker) {
  const startIdx = findLine(allLines, kathismaMarker);
  if (startIdx === -1) return null;

  // Find the next major section boundary
  const endPatterns = [
    /After the 2nd chanting/,
    /After the 3rd chanting/,
    /POLYELEOS/i,
    /Resurrectional Verses/i,
    /EVLOGITARIA/i,
  ];

  let endIdx = allLines.length;
  for (const pat of endPatterns) {
    const idx = findLine(allLines, pat, startIdx + 1);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }

  const block = allLines.slice(startIdx, endIdx);
  const hymns = [];
  let current = [];
  let currentLabel = null;

  let skipVerseContinuation = false;
  for (const line of block) {
    const trimmed = line.trim();
    if (!trimmed) { skipVerseContinuation = false; continue; }

    // Detect verse markers or Glory/Now markers — these start a new hymn
    if (/^Verse:/.test(trimmed) || /^Glory\s*\.\.\./.test(trimmed)) {
      if (current.length > 0) {
        hymns.push({ label: currentLabel, text: cleanHymn(current) });
        current = [];
      }
      currentLabel = /^Glory/.test(trimmed) ? 'Glory…, Now…, Theotokion' : null;
      skipVerseContinuation = /^Verse:/.test(trimmed);
      continue;
    }

    // Skip continuation lines of Verse: text (before hymn text begins)
    // Verse continuations are lowercase-start or short (< 60 chars)
    if (skipVerseContinuation) {
      if (/^[a-z]/.test(trimmed) || trimmed.length < 60) {
        continue;
      }
      skipVerseContinuation = false;
    }

    // Skip rubric lines
    if (/^After the \d/.test(trimmed)) continue;
    if (/^(the |The )?(Sessional hymns?|Resurrection)/i.test(trimmed) && /Tone/i.test(trimmed)) continue;
    if (/^Stavrotheotokion/i.test(trimmed)) {
      currentLabel = 'Stavrotheotokion';
      continue;
    }
    if (/^Theotokion/i.test(trimmed)) {
      currentLabel = 'Theotokion';
      continue;
    }
    if (/^Spec\. Mel\./.test(trimmed)) continue;

    current.push(trimmed);
  }
  if (current.length > 0) {
    hymns.push({ label: currentLabel, text: cleanHymn(current) });
  }

  return hymns;
}

/**
 * Parse the Hypakoë (sessional hymn after the evlogitaria).
 */
function parseHypakoe(allLines) {
  // Find "Sessional Hymn" that comes after the Evlogitaria/Alleluia section
  const evlogEnd = findLine(allLines, /Alleluia.*Glory.*God.*Thrice/i);
  if (evlogEnd === -1) return null;

  const sessionalIdx = findLine(allLines, /Sessional Hymn/i, evlogEnd);
  if (sessionalIdx === -1) return null;

  // Collect until "Songs of Ascent" or "Antiphon"
  const endIdx = findLine(allLines, /Songs of Ascent|Antiphon/i, sessionalIdx + 1);
  if (endIdx === -1) return null;

  const hymnLines = [];
  for (let i = sessionalIdx + 1; i < endIdx; i++) {
    const trimmed = allLines[i].trim();
    if (!trimmed) continue;
    if (/^(The )?Sessional Hymn/i.test(trimmed)) continue;
    if (/^in Tone/i.test(trimmed)) continue;
    hymnLines.push(trimmed);
  }

  return cleanHymn(hymnLines);
}

/**
 * Parse the Antiphons of Degrees (Songs of Ascent).
 */
function parseAntiphons(allLines) {
  const startIdx = findLine(allLines, /Songs of Ascent|1st Antiphon/);
  if (startIdx === -1) return null;

  const endIdx = findLine(allLines, /^Prokeimenon/i, startIdx + 1);
  if (endIdx === -1) return null;

  const block = allLines.slice(startIdx, endIdx);
  const antiphons = [];
  let currentAntiphon = null;
  let currentTroparia = [];
  let currentTroparion = [];

  for (const line of block) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect antiphon markers
    const antiphonMatch = trimmed.match(/(\d+)(?:st|nd|rd|th)\s+Antiphon/i);
    if (antiphonMatch) {
      // Save previous antiphon
      if (currentTroparion.length > 0) {
        currentTroparia.push(cleanHymn(currentTroparion));
        currentTroparion = [];
      }
      if (currentAntiphon !== null) {
        antiphons.push({ number: currentAntiphon, troparia: currentTroparia });
      }
      currentAntiphon = parseInt(antiphonMatch[1]);
      currentTroparia = [];
      continue;
    }

    // Glory/Now marker — starts a new troparion (the triadikon)
    if (/^Glory\s*\.\.\..*Both now/i.test(trimmed) || /^Glory\s*\.\.\.,?\s*Both now/i.test(trimmed)) {
      if (currentTroparion.length > 0) {
        currentTroparia.push(cleanHymn(currentTroparion));
        currentTroparion = [];
      }
      continue;
    }

    // Skip section headers
    if (/^(The )?Songs of Ascent/i.test(trimmed)) continue;
    if (/^in Tone/i.test(trimmed)) continue;

    currentTroparion.push(trimmed);
  }

  // Save last
  if (currentTroparion.length > 0) {
    currentTroparia.push(cleanHymn(currentTroparion));
  }
  if (currentAntiphon !== null) {
    antiphons.push({ number: currentAntiphon, troparia: currentTroparia });
  }

  return antiphons;
}

/**
 * Parse the Matins prokeimenon.
 */
function parseProkeimenon(allLines, toneNum) {
  // Find the prokeimenon that appears in the Matins section (after Antiphons, before "Let every breath")
  const antiphonEnd = findLine(allLines, /3rd Antiphon|4th Antiphon/i);
  if (antiphonEnd === -1) return null;

  const prokIdx = findLine(allLines, /^Prokeimenon/i, antiphonEnd);
  if (prokIdx === -1) return null;

  // Check this is actually the matins one (before "Let every breath" or "Sunday Resurrection Gospel")
  const breathIdx = findLine(allLines, /Let every breath/i, prokIdx);
  const gospelIdx = findLine(allLines, /Sunday Resurrection Gospel/i, prokIdx);
  const boundary = Math.min(
    breathIdx === -1 ? Infinity : breathIdx,
    gospelIdx === -1 ? Infinity : gospelIdx
  );

  if (prokIdx > boundary) return null;

  // Extract prokeimenon text — it's on the same line or next lines
  const prokLine = allLines[prokIdx];
  const refMatch = prokLine.match(/Prokeimenon.*?:\s*(.*)/i);
  let refrain = refMatch ? refMatch[1].replace(/^:\s*/, '').trim() : '';

  // Check next line(s) for continuation (lowercase start or short line < 60 chars)
  for (let ci = prokIdx + 1; ci < Math.min(prokIdx + 3, allLines.length); ci++) {
    const cont = allLines[ci].trim();
    if (!cont) break;
    if (/^Verse:|^The Verse:|^Let every/i.test(cont)) break;
    if (/^[a-z]/.test(cont) || cont.length < 60) {
      refrain += ' ' + cont;
    } else {
      break;
    }
  }

  // Find verse
  let verse = '';
  const verseIdx = findLine(allLines, /^The Verse:|^Verse:/i, prokIdx + 1);
  if (verseIdx !== -1 && verseIdx < boundary) {
    const verseLine = allLines[verseIdx];
    const verseMatch = verseLine.match(/(?:The )?Verse:\s*(.*)/i);
    verse = verseMatch ? verseMatch[1].trim() : '';
    // Check continuation (lowercase start or short line < 60 chars)
    for (let ci = verseIdx + 1; ci < Math.min(verseIdx + 3, allLines.length); ci++) {
      const cont = allLines[ci].trim();
      if (!cont || /^Let every|^Sunday|^Then:/i.test(cont)) break;
      if (/^[a-z]/.test(cont) || cont.length < 60) {
        verse += ' ' + cont;
      } else {
        break;
      }
    }
  }

  // Clean phrasing marks
  refrain = cleanText(refrain);
  verse = cleanText(verse);

  return { refrain, verse };
}

/**
 * Parse the post-Gospel sticheron (tone-specific, before the Canon).
 */
function parsePostGospelSticheron(allLines) {
  // Find "Psalm 50" or "Have mercy on me" after "Having beheld"
  const beheldIdx = findLine(allLines, /Having beheld the Resurrection/i);
  if (beheldIdx === -1) return null;

  const psalm50Idx = findLine(allLines, /Psalm 50|Have mercy on me/i, beheldIdx);
  if (psalm50Idx === -1) return null;

  // The sticheron comes after the Glory/Now/Verse10 section
  // Look for a line that starts with a capital letter after the "blot out my transgressions" line
  const blotIdx = findLine(allLines, /blot out my transgressions/i, psalm50Idx);
  if (blotIdx === -1) return null;

  // The sticheron is the next non-rubric text block
  const canonIdx = findLine(allLines, /Canon|O God, save Thy people/i, blotIdx);
  if (canonIdx === -1) return null;

  const hymnLines = [];
  for (let i = blotIdx + 1; i < canonIdx; i++) {
    const trimmed = allLines[i].trim();
    if (!trimmed) continue;
    if (/^After which|^Then|^O God, save/i.test(trimmed)) break;
    hymnLines.push(trimmed);
  }

  return hymnLines.length > 0 ? cleanHymn(hymnLines) : null;
}

/**
 * Parse the Lauds stichera (8 resurrectional stichera on "Let every breath").
 */
function parseLaudsStichera(allLines) {
  // Find the Lauds section — after exapostilarion, starts with "Let every breath" or "Aposticha"
  const laudsMarker = findLine(allLines, /On the Aposticha.*Let every breath|On the.*Praises|8 Stichera/i);
  if (laudsMarker === -1) return null;

  // Find the stichera start — look for "Stichera, in Tone" or verse markers
  const sticheraStart = findLine(allLines, /Stichera.*in Tone|^Verse:/i, laudsMarker);
  if (sticheraStart === -1) return null;

  // Find end — "Glory" for the Eothinon or "Both now" theotokion
  const eothinonIdx = findLine(allLines, /Eothinon|Glory.*The Eothinon/i, sticheraStart);
  const theotokionIdx = findLine(allLines, /Both now.*Theotokion/i, sticheraStart);

  let endIdx;
  if (eothinonIdx !== -1) endIdx = eothinonIdx;
  else if (theotokionIdx !== -1) endIdx = theotokionIdx;
  else endIdx = allLines.length;

  const block = allLines.slice(sticheraStart, endIdx);
  const stichera = [];
  let current = [];
  let currentVerse = null;
  let inAnatolius = false;

  let collectingVerse = false;
  for (const line of block) {
    const trimmed = line.trim();
    if (!trimmed) { collectingVerse = false; continue; }

    // Detect verse markers
    if (/^Verse:/.test(trimmed)) {
      if (current.length > 0) {
        stichera.push({
          verse: currentVerse,
          text: cleanHymn(current),
          byAnatolius: inAnatolius,
        });
        current = [];
      }
      currentVerse = cleanText(trimmed.replace(/^Verse:\s*/, ''));
      collectingVerse = true;
      continue;
    }

    // Verse continuation: lowercase start, or short line (verse wraps are < 60 chars)
    if (collectingVerse) {
      if (/^[a-z]/.test(trimmed) || trimmed.length < 60) {
        currentVerse += ' ' + cleanText(trimmed);
        continue;
      }
      collectingVerse = false;
    }

    // Detect "Other Stichera by Anatolius" marker
    if (/Anatolius/i.test(trimmed)) {
      inAnatolius = true;
      continue;
    }

    // Skip section headers
    if (/^On the Aposticha|^Resurrection Stichera|^however|^the first|^from the/i.test(trimmed)) continue;
    if (/^Stichera.*in Tone/i.test(trimmed)) continue;
    if (/^8 Stichera/i.test(trimmed)) continue;

    current.push(trimmed);
  }

  if (current.length > 0) {
    stichera.push({
      verse: currentVerse,
      text: cleanHymn(current),
      byAnatolius: inAnatolius,
    });
  }

  return stichera;
}

/**
 * Parse canon irmoi only (not full troparia) for each ode.
 */
function parseCanonIrmoi(allLines) {
  const irmoi = {};

  for (let i = 0; i < allLines.length; i++) {
    if (/^Irmos:/.test(allLines[i].trim())) {
      // Determine which ode this belongs to by looking backwards
      let odeNum = null;
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        // Match ODE with possible spaces: "ODE III", "O D E IV", "OD E V"
        const normalized = allLines[j].replace(/\s+/g, '');
        const odeMatch = normalized.match(/^ODE([IVX]+)/i);
        if (odeMatch) {
          odeNum = romanToInt(odeMatch[1]);
          break;
        }
        if (/Resurrection Canon/i.test(allLines[j]) && !odeNum) {
          odeNum = 1; // First ode
          break;
        }
      }
      if (!odeNum) continue;
      // Only take the first irmos per ode (resurrection canon, not cross/theotokos)
      if (irmoi[odeNum]) continue;

      // Collect irmos text until "Refrain:" or blank line
      const irmosLines = [allLines[i].trim().replace(/^Irmos:\s*/, '')];
      for (let j = i + 1; j < allLines.length; j++) {
        const t = allLines[j].trim();
        if (!t || /^Refrain:|^Glory|^Another|^ODE/i.test(t)) break;
        irmosLines.push(t);
      }
      irmoi[odeNum] = cleanHymn(irmosLines);
    }
  }

  return irmoi;
}

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

  // Find end of matins (AT LITURGY or end of file)
  const matinsEnd = findLine(lines, /^(SUNDAY MORNING|AT LITURGY)/i, matinsStart + 1);
  const matinsLines = lines.slice(matinsStart, matinsEnd === -1 ? lines.length : matinsEnd);

  const sessionalK2 = parseSessionalHymns(matinsLines, /After the 1st chanting/);
  const sessionalK3 = parseSessionalHymns(matinsLines, /After the 2nd chanting/);
  const hypakoe = parseHypakoe(matinsLines);
  const antiphons = parseAntiphons(matinsLines);
  const prokeimenon = parseProkeimenon(matinsLines, n);
  const postGospel = parsePostGospelSticheron(matinsLines);
  const lauds = parseLaudsStichera(matinsLines);
  const canonIrmoi = parseCanonIrmoi(matinsLines);

  const result = {
    _source: 'stSergius-octoechos',
    sessionalHymns: {
      afterKathisma2: sessionalK2,
      afterKathisma3: sessionalK3,
    },
    hypakoe,
    antiphonsOfDegrees: antiphons,
    prokeimenon,
    postGospelSticheron: postGospel,
    laudsStichera: lauds,
    canonIrmoi,
  };

  // Report
  console.log(`  Sessional K2: ${sessionalK2 ? sessionalK2.length + ' hymns' : 'MISSING'}`);
  console.log(`  Sessional K3: ${sessionalK3 ? sessionalK3.length + ' hymns' : 'MISSING'}`);
  console.log(`  Hypakoë: ${hypakoe ? hypakoe.substring(0, 50) + '...' : 'MISSING'}`);
  console.log(`  Antiphons: ${antiphons ? antiphons.length + ' antiphons' : 'MISSING'}`);
  console.log(`  Prokeimenon: ${prokeimenon ? prokeimenon.refrain.substring(0, 50) + '...' : 'MISSING'}`);
  console.log(`  Post-Gospel: ${postGospel ? postGospel.substring(0, 50) + '...' : 'MISSING'}`);
  console.log(`  Lauds: ${lauds ? lauds.length + ' stichera' : 'MISSING'}`);
  console.log(`  Canon irmoi: ${Object.keys(canonIrmoi).length} odes`);

  return result;
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
    result[`tone${n}`] = { sunday: { matins: await parseTone(n) } };
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\nWritten to ${OUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
