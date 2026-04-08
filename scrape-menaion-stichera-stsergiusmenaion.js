#!/usr/bin/env node
/**
 * scrape-menaion-stichera-stsergiusmenaion.js
 *
 * Downloads St-Sergius Menaion PDFs (https://st-sergius.org/services/Emenaion/MM-DD.pdf)
 * for each calendar day that is missing stichera in the database, parses the
 * AT GREAT VESPERS section, and inserts Lord I Call and Aposticha stichera into
 * storage/oca.db under `source = 'stSergius'`.
 *
 * Usage:
 *   node scrape-menaion-stichera-stsergiusmenaion.js --dry-run
 *   node scrape-menaion-stichera-stsergiusmenaion.js --month 1
 *   node scrape-menaion-stichera-stsergiusmenaion.js --date 01/01
 *   node scrape-menaion-stichera-stsergiusmenaion.js --force
 *   node scrape-menaion-stichera-stsergiusmenaion.js --fill-aposticha [--month N] [--dry-run]
 */

'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { DatabaseSync } = require('node:sqlite');

// ── CLI flags ────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const FORCE    = args.includes('--force');
const FILL_APOSTICHA = args.includes('--fill-aposticha');
const ONLY_MONTH = (() => { const i = args.indexOf('--month'); return i >= 0 ? parseInt(args[i+1], 10) : null; })();
const ONLY_DATE  = (() => { const i = args.indexOf('--date');  return i >= 0 ? args[i+1] : null; })();

const BASE_URL = 'https://st-sergius.org/services/Emenaion';
const DB_PATH  = path.join(__dirname, 'storage', 'oca.db');

// ── Database ─────────────────────────────────────────────────────────────────

function openDb() {
  return new DatabaseSync(DB_PATH);
}

// ── PDF helpers ───────────────────────────────────────────────────────────────

function downloadPdf(mm, dd) {
  const url = `${BASE_URL}/${mm}-${dd}.pdf`;
  const tmp = path.join(os.tmpdir(), `menaion-stsergiusmenaion-${mm}-${dd}.pdf`);
  execSync(`curl -s -f -o "${tmp}" "${url}"`, { stdio: 'pipe' });
  return tmp;
}

function pdfToText(pdfPath) {
  return execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

function cleanText(raw) {
  return raw
    .split('\n')
    // Remove Private Use Area characters (choral score layout artifacts)
    .map(l => l.replace(/[\uE000-\uF8FF]/g, ''))
    // Strip inline SATB voice labels
    .map(l => l.replace(/[ \t]{2,}(Soprano|Alto|Tenor|Bass)[ \t]+/g, ' '))
    // Strip note-value symbols
    .map(l => l.replace(/\bw{1,2}\b/g, ''))
    // Strip rubric markers
    .map(l => l.replace(/\s*#\s*/g, ' '))
    .map(l => l.trim())
    // Preserve blank lines as paragraph-break sentinels so the parser can detect
    // sticheron boundaries in PDFs that use plain paragraphs (no ** notation)
    .map(l => l === '' ? '\x00PARA\x00' : l)
    .join('\n');
}

/**
 * Extract the AT GREAT VESPERS (or AT VESPERS) section.
 *
 * Major feasts have both "AT LITTLE VESPERS" and "AT GREAT VESPERS"; we want
 * the latter.  Regular saints' days have a single "AT VESPERS" heading.
 *
 * Strategy: find the LAST occurrence of /^AT (GREAT )?VESPERS:?\s*$/im so that
 * if both "AT LITTLE VESPERS" and "AT GREAT VESPERS" are present we get the
 * Great Vespers one, and if only "AT VESPERS" is present we get that.
 *
 * Stop: /^(AT MATINS|AT ORTHROS|THE DISMISSAL|DISMISSAL TROPARIA)/im
 */
function extractGreatVespersSection(text) {
  // Find all occurrences of AT [GREAT] VESPERS (not AT LITTLE VESPERS)
  const headingRe = /^AT (?:GREAT )?VESPERS:?\s*$/gim;
  let lastMatch = null;
  let m;
  while ((m = headingRe.exec(text)) !== null) {
    // Skip "AT LITTLE VESPERS"
    if (/LITTLE/i.test(m[0])) continue;
    lastMatch = m;
  }
  if (!lastMatch) return null;
  const rest = text.slice(lastMatch.index + lastMatch[0].length);
  const stop = rest.search(/^(AT MATINS|AT ORTHROS|THE DISMISSAL|DISMISSAL TROPARIA)/im);
  return (stop >= 0 ? rest.slice(0, stop) : rest).trim();
}

// ── Roman numeral helper ──────────────────────────────────────────────────────

function romanToInt(s) {
  const map = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
  const upper = s.toUpperCase().trim();
  const num = parseInt(upper, 10);
  if (!isNaN(num)) return num;
  let result = 0, prev = 0;
  for (let i = upper.length - 1; i >= 0; i--) {
    const cur = map[upper[i]] || 0;
    result += cur < prev ? -cur : cur;
    prev = cur;
  }
  return result || null;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse the AT GREAT VESPERS section into:
 *   lordICall : { hymns: [{order, tone, label, text}], glory, theotokion }
 *   aposticha : { hymns: [{order, tone, label, text}], glory, theotokion }
 *
 * Lord I Call:
 *   - Sticheron boundary: a line containing `**` followed by text and ending
 *     with [.!?] (optionally followed by `(Twice)`)
 *   - Sub-group headers: "And N Stichera of ..., in Tone T:" update tone+label
 *   - No Verse: lines (unlike Aposticha)
 *
 * Aposticha:
 *   - Uses verseMode exactly like the Octoechos parser: `Verse:` lines
 *     accumulate until `*` + sentence end, then the next hymn text follows
 */
function parseGreatVespers(section, month, day) {
  // Detect whether this PDF uses ** notation or plain paragraphs.
  // Plain-paragraph PDFs (no asterisks) need paragraph-break detection for LIC boundaries.
  const usesAsterisks = section.includes('**');

  const lines = section
    .split('\n')
    .map(l => l.trim())
    // Keep paragraph sentinels (\x00PARA\x00) so plain-paragraph LIC boundaries work;
    // filter out truly empty lines (after sentinel substitution, empties are gone already).
    .filter(l => l.length > 0);

  // ── Shared result objects ──
  const lic   = { hymns: [], glory: null, theotokion: null };
  const apost = { hymns: [], glory: null, theotokion: null };

  // ── State ──
  let mode       = null;    // 'lic' | 'apost' | null
  let verseMode  = false;   // aposticha only: accumulating a multi-line Verse:
  let rubricMode = false;

  let hymnLines       = [];
  let hymnVerse       = null;
  let hymnTone        = null;
  let hymnLabel       = null;
  let hymnTarget      = null;   // 'lic' | 'apost'
  let hymnIsGlory     = false;
  let hymnIsTheotokion = false;
  let hymnIsGloryNow  = false;

  // ── flushHymn ────────────────────────────────────────────────────────────
  function flushHymn() {
    if (!hymnLines.length) return;
    const text = hymnLines.join(' ').replace(/\s+/g, ' ').trim();
    hymnLines = [];
    if (!text) return;

    const obj = { text };
    if (hymnVerse)  obj.verse = hymnVerse;
    if (hymnTone)   obj.tone  = hymnTone;
    if (hymnLabel)  obj.label = hymnLabel;

    if (hymnIsGloryNow) {
      // Single "Glory and Both now" text — set for both slots
      if (hymnTarget === 'lic')   { lic.glory   = obj; lic.theotokion   = obj; }
      if (hymnTarget === 'apost') { apost.glory = obj; apost.theotokion = obj; }
    } else if (hymnIsGlory) {
      if (hymnTarget === 'lic')   lic.glory   = obj;
      if (hymnTarget === 'apost') apost.glory = obj;
    } else if (hymnIsTheotokion) {
      if (hymnTarget === 'lic')   lic.theotokion   = obj;
      if (hymnTarget === 'apost') apost.theotokion = obj;
    } else {
      const bucket = hymnTarget === 'lic' ? lic.hymns : apost.hymns;
      obj.order = bucket.length;   // 0-based counter
      bucket.push(obj);
    }

    hymnVerse       = null;
    hymnIsGlory     = false;
    hymnIsTheotokion = false;
    hymnIsGloryNow  = false;
  }

  // ── verseComplete (aposticha) ─────────────────────────────────────────────
  function verseComplete(v) {
    if (!/ \* /.test(v)) return false;
    return /[.!?,;]"?\s*$/.test(v) ||
           /\b(Lord|God|Thee|Him|us|good things|things|peoples?|nations?)\s*$/i.test(v);
  }

  // ── stripTypeLabel ────────────────────────────────────────────────────────
  function stripTypeLabel(s) {
    return s
      .replace(/^([A-Za-z]+\s*)?theotokion:?\s*/i, '')
      .replace(/^(Dogmatikon|Kontakion|Resurrectional|Stavrotheotokion):?\s*/i, '')
      .trim();
  }

  // ── parseToneFromHeader ───────────────────────────────────────────────────
  // Matches "in Tone IV" or "in Tone 4" or "Tone IV:" etc.
  function parseToneFromHeader(line) {
    const m = line.match(/in\s+Tone\s+([IVXivx]+|\d+)/i);
    return m ? romanToInt(m[1]) : null;
  }

  // ── parseLabelFromHeader ──────────────────────────────────────────────────
  // "And 4 Stichera of the holy hierarch, in Tone IV:"
  // "On \"Lord, I have cried ...,\" 8 Stichera: 4 of the circumcision, in Tone VIII:"
  // "4 of the holy hierarch, in Tone IV:"
  // We want just the saint description part, e.g. "of the holy hierarch"
  function parseLabelFromHeader(line) {
    // Try "N Stichera of <desc>, in Tone" or "N of <desc>, in Tone"
    let m = line.match(/\d+\s+(?:stichera\s+)?of\s+([^,]+?)(?:,|\s+in\s+Tone)/i);
    if (m) return m[1].trim();
    // Try "Stichera of <desc>"
    m = line.match(/stichera\s+of\s+([^,]+?)(?:,|\s+in\s+Tone|:)/i);
    if (m) return m[1].trim();
    return null;
  }

  // ── Main line loop ─────────────────────────────────────────────────────────
  for (const line of lines) {

    // ── Major section headers ────────────────────────────────────────────────

    // Start of Lord I Call block
    if (/(?:On|At)\s+.{1,5}Lord,?\s*I\s*have\s*cried/i.test(line)) {
      flushHymn(); verseMode = false;
      mode = 'lic'; hymnTarget = 'lic'; rubricMode = true;
      // Parse initial tone and label from the header itself
      const t = parseToneFromHeader(line);
      const l = parseLabelFromHeader(line);
      if (t) hymnTone  = t;
      if (l) hymnLabel = l;
      continue;
    }

    // Start of Aposticha block
    if (/On\s+the\s+Aposticha/i.test(line)) {
      flushHymn(); verseMode = false;
      mode = 'apost'; hymnTarget = 'apost'; rubricMode = true;
      const t = parseToneFromHeader(line);
      const l = parseLabelFromHeader(line);
      if (t) hymnTone  = t;
      if (l) hymnLabel = l;
      continue;
    }

    // End of relevant sections: Vouchsafe, Troparion, Dismissal, etc.
    if (/Vouchsafe,\s*O\s*Lord/i.test(line) ||
        /^Troparion\s+(of|in)\s/i.test(line) ||
        /^At\s+Litiya/i.test(line) ||
        /^Entrance\./i.test(line)) {
      flushHymn(); verseMode = false; rubricMode = false;
      // "At Litiya" and "Entrance" are inside the GV section but not LIC/apost —
      // exit the current mode
      if (/^At\s+Litiya/i.test(line) || /^Entrance\./i.test(line)) {
        mode = null;
      }
      continue;
    }

    // ── Sub-group headers in LIC (between stichera groups) ──────────────────
    // "And N Stichera of ..., in Tone T:"
    // In ** PDFs the buffer is empty here (previous sticheron was flushed by **).
    // In plain-paragraph PDFs the last non-Twice sticheron may be in the buffer.
    if (mode === 'lic' && /(?:And\s+)?\d+\s+(?:stichera\s+)?of\s+/i.test(line) &&
        /in\s+Tone/i.test(line)) {
      flushHymn();  // flush any accumulated plain-paragraph sticheron
      const t = parseToneFromHeader(line);
      const l = parseLabelFromHeader(line);
      if (t !== null) hymnTone  = t;
      if (l !== null) hymnLabel = l;
      rubricMode = true;
      continue;
    }

    // Also flush for "And N Stichera, in Tone T:" (no "of") — same pattern without saint label
    if (mode === 'lic' && /(?:And\s+)?\d+\s+stichera,?\s+in\s+Tone/i.test(line)) {
      flushHymn();
      const t = parseToneFromHeader(line);
      if (t !== null) hymnTone = t;
      hymnLabel = null;
      rubricMode = true;
      continue;
    }

    // ── Spec. Mel. lines ─────────────────────────────────────────────────────
    // These are rubric lines giving the melodic model; skip them.
    if (/^Spec\.\s*Mel\./i.test(line)) {
      // If inside a glory/theotokion accumulation, also skip
      continue;
    }

    // ── Mode-independent skip ────────────────────────────────────────────────
    if (mode !== 'lic' && mode !== 'apost') continue;

    // ── (Twice) / paragraph sentinels ───────────────────────────────────────
    // "(Twice)" on its own line: the previous sticheron is repeated — flush if in
    // plain-paragraph LIC mode (so the accumulated text becomes one sticheron), else skip.
    if (/^\(Twice\)\s*$/.test(line)) {
      if (mode === 'lic' && !usesAsterisks && hymnLines.length) flushHymn();
      continue;
    }

    // Paragraph-break sentinel from cleanText() — used only in plain-paragraph PDFs.
    if (line === '\x00PARA\x00') {
      if (mode === 'lic' && !usesAsterisks) flushHymn();
      continue;
    }

    // ── Verse: lines (aposticha only) ────────────────────────────────────────
    if (mode === 'apost' && /^Verse:/i.test(line)) {
      flushHymn();
      verseMode = true; rubricMode = false;
      hymnVerse = line.replace(/^Verse:\s*/i, '').trim();
      if (verseComplete(hymnVerse)) verseMode = false;
      continue;
    }

    // While collecting a multi-line Verse (aposticha)
    if (mode === 'apost' && verseMode) {
      hymnVerse += ' ' + line;
      if (verseComplete(hymnVerse)) verseMode = false;
      continue;
    }

    // ── Glory / Both now ─────────────────────────────────────────────────────
    const gloryBothNow = /^Glory\s*\.\.\.,\s*Both\s*now\s*\.\.\./i.test(line);
    const gloryOnly    = /^Glory\s*\.\.\.,\s*(?!Both)/i.test(line);
    const bothNowOnly  = /^Both\s*now\s*\.\.\./i.test(line);

    if (gloryBothNow) {
      flushHymn(); rubricMode = false; verseMode = false;
      const after = stripTypeLabel(
        line.replace(/^Glory\s*\.\.\.,\s*Both\s*now\s*\.\.\.,?\s*/i, '').trim()
      );
      hymnIsGloryNow = true;
      // Update tone if present in the Glory line
      const t = parseToneFromHeader(line);
      if (t) hymnTone = t;
      if (after && !/^in\s+Tone/i.test(after) && !/^,/.test(after)) hymnLines.push(after);
      continue;
    }
    if (gloryOnly) {
      flushHymn(); rubricMode = false; verseMode = false;
      const after = line.replace(/^Glory\s*\.\.\.,\s*/i, '').trim();
      hymnIsGlory = true;
      const t = parseToneFromHeader(line);
      if (t) hymnTone = t;
      const cleaned = stripTypeLabel(after.replace(/,?\s*in\s+Tone\s+[IVXivx\d]+\s*:?\s*/i, '').trim());
      if (cleaned && !/^\.\.\.$/.test(cleaned)) hymnLines.push(cleaned);
      continue;
    }
    if (bothNowOnly) {
      flushHymn(); rubricMode = false; verseMode = false;
      const after = line.replace(/^Both\s*now\s*\.\.\.,?\s*/i, '').trim();
      hymnIsTheotokion = true;
      const t = parseToneFromHeader(line);
      if (t) hymnTone = t;
      const cleaned = stripTypeLabel(after.replace(/,?\s*in\s+Tone\s+[IVXivx\d]+\s*:?\s*/i, '').trim());
      if (cleaned) hymnLines.push(cleaned);
      continue;
    }

    // ── Double-asterisk end-of-sticheron detection (LIC only, ** PDFs) ─────────
    // A line containing `**` followed by the final melodic phrase marks the END of
    // a sticheron — but ONLY when the line ends with sentence-closing punctuation
    // (the final phrase may sometimes wrap to the next line).
    if (mode === 'lic' && usesAsterisks && line.includes('**')) {
      const noTwice = line.replace(/\s*\(Twice\)\s*$/, '').trim();
      if (/[.!?]["']?\s*$/.test(noTwice)) {
        // Line ends the sentence — this is a complete sticheron boundary
        hymnLines.push(noTwice);
        flushHymn();
        rubricMode = false;
        continue;
      }
      // Otherwise the sentence continues on the next line — add this line to the
      // buffer and keep accumulating (next line will complete it, no ** needed).
      hymnLines.push(noTwice);
      continue;
    }

    // ── Sentence-ending continuation after a mid-line ** (LIC only, ** PDFs) ──
    // After a `**` line that did not end the sentence, the next line(s) complete it.
    // We detect sentence completion: a line ending with [.!?] when hymnLines has
    // a `**` somewhere and we're in LIC mode.
    if (mode === 'lic' && usesAsterisks && hymnLines.length > 0 &&
        hymnLines.some(l => l.includes('**')) &&
        /[.!?]["']?\s*$/.test(line) &&
        !/^Glory|^Both now|^Verse:|^And\s+\d+|^On .+Lord/i.test(line)) {
      const noTwice = line.replace(/\s*\(Twice\)\s*$/, '').trim();
      hymnLines.push(noTwice);
      flushHymn();
      rubricMode = false;
      continue;
    }

    // ── Inline (Twice) end-of-sticheron detection (LIC only, plain-paragraph PDFs) ──
    // In plain-paragraph PDFs, stichera end with "(Twice)" but have no "**" on the line.
    // (In ** PDFs, "(Twice)" always appears on the same line as "**" and is handled above.)
    if (mode === 'lic' && /\(Twice\)\s*$/.test(line) && !line.includes('**')) {
      const cleanLine = line.replace(/\s*\(Twice\)\s*$/, '').trim();
      if (cleanLine) hymnLines.push(cleanLine);
      flushHymn();
      rubricMode = false;
      continue;
    }

    // ── Double-asterisk in aposticha lines ──────────────────────────────────
    // In aposticha, `**` can appear mid-hymn. Include it in the text and continue
    // accumulating — the actual flush happens when the next Verse: or Glory appears.
    // (The aposticha section uses verseMode-based flushing.)
    // So we just fall through to normal hymn text accumulation.

    // ── Rubric lines ─────────────────────────────────────────────────────────
    if (/^Repeat:/i.test(line)) continue;

    if (/^(Then,|Then )/i.test(line)) {
      if (/Now lettest|servant depart/i.test(line)) {
        flushHymn(); verseMode = false; rubricMode = false; mode = null;
      } else {
        flushHymn(); rubricMode = true;
      }
      continue;
    }

    // Skip composition attribution lines (e.g. "The composition of Byzantius:")
    if (/^The\s+composition\s+of\s+/i.test(line) && line.endsWith(':')) {
      continue;
    }
    // Note: "The composition of X: text..." (inline) should NOT be skipped —
    // these carry the start of the hymn text. Only pure label lines ending in ":"

    if (rubricMode) {
      if (line.endsWith(':')) continue;
      rubricMode = false;
      // Fall through to text accumulation
    }

    // Strip type labels from inline sticheron openers
    const labelStripped = stripTypeLabel(line);
    if (labelStripped !== line) {
      if (labelStripped) hymnLines.push(labelStripped);
      continue;
    }

    // ── Hymn text ─────────────────────────────────────────────────────────────
    hymnLines.push(line);
  }

  flushHymn();

  return { lordICall: lic, aposticha: apost };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function getPrimaryCommemoration(db, month, day) {
  return db.prepare(
    `SELECT id FROM commemorations WHERE month=? AND day=? ORDER BY id LIMIT 1`
  ).get(month, day) ?? null;
}

function hasExistingStichera(db, commId) {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM stichera WHERE commemoration_id=? AND source != 'placeholder'`
  ).get(commId);
  return row && row.n > 0;
}

const INSERT_STICHERON = `
  INSERT OR IGNORE INTO stichera (commemoration_id, section, "order", tone, label, text, source)
  VALUES (?, ?, ?, ?, ?, ?, 'stSergius')
`;

function insertStichera(db, commId, section, hymns, glory, theotokion, dryRun) {
  let count = 0;

  for (const h of hymns) {
    if (!h.text) continue;
    if (!dryRun) {
      db.prepare(INSERT_STICHERON).run(
        commId, section, h.order,
        h.tone ?? null, h.label ?? null, h.text
      );
    }
    count++;
  }

  if (glory && glory.text) {
    if (!dryRun) {
      db.prepare(INSERT_STICHERON).run(
        commId, section, 90,
        glory.tone ?? null, glory.label ?? null, glory.text
      );
    }
    count++;
  }

  if (theotokion && theotokion.text && theotokion !== glory) {
    // Separate theotokion (not a combined gloryNow object): insert at order=91
    if (!dryRun) {
      db.prepare(INSERT_STICHERON).run(
        commId, section, 91,
        theotokion.tone ?? null, theotokion.label ?? null, theotokion.text
      );
    }
    count++;
  }

  return count;
}

// ── Gap query ─────────────────────────────────────────────────────────────────

function getGapDays(db) {
  // Only return days where the PRIMARY commemoration (lowest id) has no stichera.
  // Secondary commemorations on the same day may lack stichera — that is expected.
  return db.prepare(`
    SELECT c.month, c.day
    FROM commemorations c
    WHERE c.id = (
      SELECT MIN(c2.id) FROM commemorations c2 WHERE c2.month = c.month AND c2.day = c.day
    )
    AND NOT EXISTS (
      SELECT 1 FROM stichera s WHERE s.commemoration_id = c.id
    )
    ORDER BY c.month, c.day
  `).all();
}

function getApostichaGapDays(db) {
  // Days that have Lord I Call stichera but NO aposticha
  return db.prepare(`
    SELECT c.month, c.day
    FROM commemorations c
    WHERE c.id = (
      SELECT MIN(c2.id) FROM commemorations c2 WHERE c2.month = c.month AND c2.day = c.day
    )
    AND EXISTS (
      SELECT 1 FROM stichera s WHERE s.commemoration_id = c.id AND s.section = 'lordICall'
    )
    AND NOT EXISTS (
      SELECT 1 FROM stichera s WHERE s.commemoration_id = c.id AND s.section = 'aposticha'
    )
    ORDER BY c.month, c.day
  `).all();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = openDb();

  // Determine which days to process
  let days = FILL_APOSTICHA ? getApostichaGapDays(db) : getGapDays(db);

  // Apply --month filter
  if (ONLY_MONTH !== null) {
    days = days.filter(d => d.month === ONLY_MONTH);
  }

  // Apply --date MM/DD filter
  if (ONLY_DATE) {
    const [mStr, dStr] = ONLY_DATE.split('/');
    const m = parseInt(mStr, 10), d = parseInt(dStr, 10);
    days = days.filter(row => row.month === m && row.day === d);
    // If --date specified but the day already has stichera and no --force,
    // still allow --force to include it
    if (!days.length && !FORCE) {
      // Also try --force path: query all days for that date
      const row = db.prepare(
        `SELECT DISTINCT c.month, c.day FROM commemorations c WHERE c.month=? AND c.day=? LIMIT 1`
      ).get(m, d);
      if (row) {
        console.log(`${mStr}/${dStr}: no gap found (already has stichera). Use --force to override.`);
        db.close(); return;
      } else {
        console.log(`${mStr}/${dStr}: not found in commemorations table.`);
        db.close(); return;
      }
    }
  }

  // If --force, don't filter by gaps — just process the specified dates
  if (FORCE && ONLY_DATE) {
    const [mStr, dStr] = ONLY_DATE.split('/');
    const m = parseInt(mStr, 10), d = parseInt(dStr, 10);
    days = [{ month: m, day: d }];
  }

  if (!days.length) {
    console.log('No gap days to process.');
    db.close(); return;
  }

  console.log(`Processing ${days.length} gap day(s)${DRY_RUN ? ' (DRY RUN)' : ''}…\n`);

  let totalInserted = 0;
  let totalDays     = 0;
  let skippedDays   = 0;

  for (const { month, day } of days) {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateLabel = `${mm}/${dd}`;

    // Check for existing stichera unless --force
    const comm = getPrimaryCommemoration(db, month, day);
    if (!comm) {
      console.log(`  ${dateLabel}: no primary commemoration found — skipped`);
      skippedDays++;
      continue;
    }
    if (!FORCE && !FILL_APOSTICHA && hasExistingStichera(db, comm.id)) {
      console.log(`  ${dateLabel}: already has stichera — skipped (use --force to override)`);
      skippedDays++;
      continue;
    }

    // Download PDF
    let pdfPath;
    try {
      pdfPath = downloadPdf(mm, dd);
    } catch {
      console.log(`  ${dateLabel}: ✗ download failed (404 or network error)`);
      skippedDays++;
      continue;
    }

    // Extract text
    let rawText;
    try {
      rawText = pdfToText(pdfPath);
    } catch (err) {
      console.log(`  ${dateLabel}: ✗ pdftotext failed — ${err.message}`);
      try { fs.unlinkSync(pdfPath); } catch {}
      skippedDays++;
      continue;
    }
    try { fs.unlinkSync(pdfPath); } catch {}

    const cleaned = cleanText(rawText);
    const section = extractGreatVespersSection(cleaned);
    if (!section) {
      console.log(`  ${dateLabel}: — no AT GREAT VESPERS section found`);
      skippedDays++;
      continue;
    }

    // Parse
    const { lordICall, aposticha } = parseGreatVespers(section, month, day);

    const licCount   = lordICall.hymns.length +
                       (lordICall.glory ? 1 : 0) +
                       (lordICall.theotokion && lordICall.theotokion !== lordICall.glory ? 1 : 0);
    const apostCount = aposticha.hymns.length +
                       (aposticha.glory ? 1 : 0) +
                       (aposticha.theotokion && aposticha.theotokion !== aposticha.glory ? 1 : 0);

    console.log(`  ${dateLabel}: LIC ${licCount} hymns | Aposticha ${apostCount} hymns`);

    if (licCount === 0 && apostCount === 0) {
      skippedDays++;
      continue;
    }

    // Insert
    let inserted = 0;
    inserted += insertStichera(db, comm.id, 'lordICall',
      lordICall.hymns, lordICall.glory, lordICall.theotokion, DRY_RUN);
    inserted += insertStichera(db, comm.id, 'aposticha',
      aposticha.hymns, aposticha.glory, aposticha.theotokion, DRY_RUN);

    totalInserted += inserted;
    totalDays++;
  }

  db.close();

  const dryTag = DRY_RUN ? ' (DRY RUN — nothing written)' : '';
  console.log(`\nDone. Added ${totalInserted} stichera to ${totalDays} day(s). Skipped ${skippedDays} day(s).${dryTag}`);
}

main().catch(err => { console.error(err); process.exit(1); });
