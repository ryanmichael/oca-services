#!/usr/bin/env node
/**
 * scrape-triodion-stsergiusmenaion.js
 *
 * Downloads St-Sergius Triodion PDFs (https://st-sergius.org/services/triod/XY.pdf)
 * for each Lenten weekday that is missing vespers texts in the blocks table,
 * parses the VESPERS section, and inserts Lord I Call and Aposticha stichera.
 *
 * PDF naming: XY.pdf where X = week (1-6), Y = day (1=Mon .. 7=Sun)
 *
 * Usage:
 *   node scrape-triodion-stsergiusmenaion.js --dry-run
 *   node scrape-triodion-stsergiusmenaion.js --key lent.week.1.tuesday
 *   node scrape-triodion-stsergiusmenaion.js --force
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const os   = require('os');
const { DatabaseSync } = require('node:sqlite');

// ── CLI flags ────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const FORCE    = args.includes('--force');
const ONLY_KEY = (() => { const i = args.indexOf('--key'); return i >= 0 ? args[i + 1] : null; })();

const BASE_URL = 'https://st-sergius.org/services/triod';
const DB_PATH  = path.join(__dirname, 'storage', 'oca.db');

// ── Mapping: liturgical key → PDF filename ───────────────────────────────────

const DOW_NUM = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };

function litKeyToPdfName(key) {
  // lent.week.N.dayname → "NY.pdf"
  const m = key.match(/^lent\.week\.(\d)\.(\w+)$/);
  if (!m) return null;
  const week = m[1];
  const dayNum = DOW_NUM[m[2]];
  if (!dayNum) return null;
  return `${week}${dayNum}.pdf`;
}

// ── PDF helpers ──────────────────────────────────────────────────────────────

function downloadPdf(pdfName) {
  const url = `${BASE_URL}/${pdfName}`;
  const tmp = path.join(os.tmpdir(), `triod-${pdfName}`);
  try {
    execSync(`curl -s -f -o "${tmp}" "${url}"`, { stdio: 'pipe' });
    return tmp;
  } catch {
    return null;
  }
}

function pdfToText(pdfPath) {
  return execSync(`pdftotext "${pdfPath}" -`, { maxBuffer: 4 * 1024 * 1024 }).toString('utf8');
}

// ── Text extraction ──────────────────────────────────────────────────────────

/**
 * Extract the VESPERS section from the PDF text.
 * Start: standalone "VESPERS" line (not "AT VESPERS" — that's Menaion style)
 * Stop: GREAT COMPLINE | CANON OF ST | MATINS | end of file
 */
function extractVespersSection(text) {
  const lines = text.split('\n');
  let startIdx = -1;
  // Find the VESPERS or AT VESPERS heading (standalone line)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(AT\s+)?VESPERS\s*$/i.test(lines[i])) {
      startIdx = i;
    }
  }
  if (startIdx === -1) return null;

  // Find end
  const stopRe = /^\s*(GREAT COMPLINE|CANON OF ST|MATINS|THE HOURS)/i;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (stopRe.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join('\n').trim();
}

/**
 * Parse the vespers section into Lord I Call stichera and Aposticha stichera.
 * Returns { lordICall: { hymns: [...], glory: {...}|null }, aposticha: { hymns: [...], glory: {...}|null } }
 */
function parseVespersSection(text) {
  const result = {
    lordICall: { hymns: [], glory: null },
    aposticha: { hymns: [], glory: null },
  };

  // Split into Lord I Call section and Aposticha section
  const licMatch = text.match(/On\s+.{0,5}Lord,?\s*I\s*have\s*cried/i);
  const apostMatch = text.match(/On\s+the\s+Aposticha/i);

  if (!licMatch) return result;

  const licStart = licMatch.index;
  const licEnd = apostMatch ? apostMatch.index : text.length;
  const licText = text.slice(licStart, licEnd);

  if (apostMatch) {
    // Aposticha ends at "Now lettest Thou" or "Litany" or "Then:" or end of text
    const apostText = text.slice(apostMatch.index);
    const apostEnd = apostText.search(/\n\s*("Now lettest|"Now lettest|Litany:|Then:|And the rest|Lord Have Mercy \(40)/i);
    const apostSection = apostEnd >= 0 ? apostText.slice(0, apostEnd) : apostText;
    result.aposticha = parseHymnSection(apostSection, 'aposticha');
  }

  // Parse Lord I Call — stop at Prokeimenon, Menaion reference, or Entrance hymn
  const licStop = licText.search(/\n\s*(Prokeimenon|And \d+ Stichera from the Menaion|Glory.*Both now.*from the Menaion|Then,?\s+.{0,3}O joyous Light|Then,?\s+[\u201C""]O joyous Light)/i);
  const licSection = licStop >= 0 ? licText.slice(0, licStop) : licText;
  result.lordICall = parseHymnSection(licSection, 'lordICall');

  return result;
}

/**
 * Parse a section of text into individual hymns.
 *
 * Strategy: the Triodion PDFs have no blank lines between hymns.
 * Instead, each hymn ends with ** (double-asterisk melodic break marker)
 * followed by a closing phrase. We split the continuous text on this pattern.
 *
 * Structural markers (tone headers, Verse:, Glory, Repeat, etc.) are handled
 * first as line-level signals, then hymn text is accumulated and split on **.
 */
function parseHymnSection(text, sectionName) {
  const lines = text.split('\n');
  const hymns = [];
  let glory = null;

  // State
  let currentTone = null;
  let currentLabel = null;
  let textBuf = [];   // accumulates hymn text lines between structural markers
  let isGlory = false;

  /**
   * Split accumulated text buffer into hymns using the ** pattern.
   * Each ** marks the penultimate phrase of a hymn; the hymn ends on the same
   * or next line (at a sentence-ending punctuation).
   */
  function flushBuffer() {
    if (!textBuf.length) return;
    let raw = textBuf.join('\n').trim();
    textBuf = [];
    if (!raw) return;

    // Handle (Twice) — remove it and we'll duplicate after splitting
    let twice = false;
    if (/\(Twice\)\s*$/.test(raw)) {
      twice = true;
      raw = raw.replace(/\s*\(Twice\)\s*$/, '').trim();
    }

    // Split on ** boundaries
    const split = splitOnDoubleStar(raw);
    for (const hymnText of split) {
      const entry = { text: hymnText.trim(), tone: currentTone, label: currentLabel || 'Triodion' };
      if (!entry.text) continue;
      if (isGlory) {
        glory = entry;
      } else {
        hymns.push(entry);
        if (twice) hymns.push({ ...entry });
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip the section header line itself
    if (i === 0 && /On\s+.{0,5}(Lord|the Aposticha)/i.test(trimmed)) continue;

    // Skip bare stichera count headers: "6 Stichera:" or "10 Stichera:"
    if (/^\d+\s+Stichera:?\s*$/i.test(trimmed)) continue;

    // Tone/attribution headers
    const toneMatch = trimmed.match(/in\s+Tone\s+([IVX]+):?\s*$/i);
    if (toneMatch && (
      /^\d+\s+Stichera/i.test(trimmed) ||
      /^(Six|Five|Four|Three|Two|One|And\s+\d+)\s+(Stichera|by)/i.test(trimmed) ||
      /^In\s+Tone/i.test(trimmed) ||
      /^(Two|One|Three|Four)\s+by/i.test(trimmed)
    )) {
      flushBuffer();
      currentTone = romanToInt(toneMatch[1]);
      const labelMatch = trimmed.match(/by\s+(St\.\s+)?(\w+)/i);
      currentLabel = labelMatch ? `by ${labelMatch[1] || ''}${labelMatch[2]}`.trim() : 'Triodion';
      isGlory = false;
      continue;
    }

    // "these Stichera in Tone VIII:" (aposticha header)
    if (/these\s+Stichera\s+in\s+Tone\s+([IVX]+)/i.test(trimmed)) {
      flushBuffer();
      const m = trimmed.match(/Tone\s+([IVX]+)/i);
      if (m) currentTone = romanToInt(m[1]);
      currentLabel = 'Triodion';
      isGlory = false;
      continue;
    }

    // Verse lines — flush accumulated hymn text, skip the verse itself
    if (/^Verse:\s/i.test(trimmed)) {
      flushBuffer();
      continue;
    }

    // "Repeat:" directive — duplicate the previous hymn
    if (/^Repeat:/i.test(trimmed)) {
      flushBuffer();
      if (hymns.length > 0) hymns.push({ ...hymns[hymns.length - 1] });
      continue;
    }

    // Glory..., Both now... (combined) — marks the final theotokion
    if (/^Glory\s*\.{2,}.*Both\s+now/i.test(trimmed)) {
      flushBuffer();
      isGlory = true;
      const gTone = trimmed.match(/in\s+Tone\s+([IVX]+)/i);
      if (gTone) currentTone = romanToInt(gTone[1]);
      currentLabel = /Stavrotheotokion/i.test(trimmed) ? 'Stavrotheotokion' : 'Theotokion';
      // If text follows on same line after colon
      const afterColon = trimmed.replace(/^Glory.*?:\s*/i, '');
      if (afterColon && afterColon !== trimmed && !/^(from the Menaion|The Dogmaticon)/i.test(afterColon)) {
        textBuf.push(afterColon);
      }
      continue;
    }

    // "Glory ..." alone
    if (/^Glory\s*\.{2,}/i.test(trimmed) && !/Both\s+now/i.test(trimmed)) {
      flushBuffer();
      isGlory = true;
      const gTone = trimmed.match(/in\s+Tone\s+([IVX]+)/i);
      if (gTone) currentTone = romanToInt(gTone[1]);
      currentLabel = 'Triodion';
      // Text after colon on same line
      const m = trimmed.match(/:\s*(.+)/);
      if (m) textBuf.push(m[1]);
      continue;
    }

    // Stavrotheotokion label
    if (/^Stavrotheotokion:\s*/i.test(trimmed)) {
      flushBuffer();
      currentLabel = 'Stavrotheotokion';
      isGlory = true;
      const rest = trimmed.replace(/^Stavrotheotokion:\s*/i, '');
      if (rest) textBuf.push(rest);
      continue;
    }

    // Skip rubric/instruction lines
    if (/^(And \d+ Stichera from|After which we chant|And four Stichera|Then,?\s|Prokeimenon|THE READING|Litany|"O joyous|O joyous|\u201CNow lettest|"Now lettest|Lord Have Mercy|Then the Prayer|Both now.*Dogmaticon|It is good to give)/i.test(trimmed)) {
      flushBuffer();
      continue;
    }

    // Empty line — paragraph break
    if (!trimmed) {
      // Don't flush — hymns may not be separated by blank lines in these PDFs
      continue;
    }

    // Regular text line — accumulate
    textBuf.push(trimmed);
  }

  flushBuffer();
  return { hymns, glory };
}

/**
 * Split a continuous block of hymn text on ** boundaries.
 * Each ** marks near the end of a hymn; the hymn continues to the end of
 * the sentence (next period, !, or closing quote).
 */
function splitOnDoubleStar(text) {
  const results = [];
  let remaining = text;

  while (remaining.trim()) {
    const dblStar = remaining.indexOf('**');
    if (dblStar === -1) {
      // No more ** — rest is the last hymn
      if (remaining.trim()) results.push(remaining.trim());
      break;
    }
    // Find end of this hymn: sentence-ending punctuation after **
    const afterStar = remaining.slice(dblStar + 2);
    const endMatch = afterStar.match(/[.!"\u201D]\s*\n/);
    if (endMatch) {
      const hymnEnd = dblStar + 2 + endMatch.index + endMatch[0].length;
      results.push(remaining.slice(0, hymnEnd).trim());
      remaining = remaining.slice(hymnEnd);
    } else {
      // Last hymn (no newline after ending punctuation)
      results.push(remaining.trim());
      break;
    }
  }

  return results;
}

function romanToInt(roman) {
  const map = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
  return map[roman.toUpperCase()] || null;
}

// ── Gap detection ────────────────────────────────────────────────────────────

/**
 * Returns liturgical keys that need scraping.
 * These are lent.week.N.dayname keys that have no blocks in the DB.
 */
function getGapKeys(db) {
  const allKeys = [];
  for (let week = 1; week <= 6; week++) {
    for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']) {
      allKeys.push(`lent.week.${week}.${day}`);
    }
  }

  const existing = new Set(
    db.prepare("SELECT DISTINCT liturgical_key FROM blocks WHERE liturgical_key LIKE 'lent.week.%'")
      .all().map(r => r.liturgical_key)
  );

  return allKeys.filter(k => !existing.has(k));
}

// ── Database insertion ───────────────────────────────────────────────────────

/**
 * Get or create a source_file entry for a given PDF/pronoun combination.
 */
function getOrCreateSourceFile(db, pdfName, pronoun) {
  const filename = `stSergius-triod-${pdfName}-${pronoun}`;
  const existing = db.prepare("SELECT id FROM source_files WHERE filename = ?").get(filename);
  if (existing) return existing.id;
  db.prepare(
    "INSERT INTO source_files (filename, pronoun, file_type, parsed_at) VALUES (?, ?, 'stSergius-triodion', ?)"
  ).run(filename, pronoun, new Date().toISOString());
  return db.prepare("SELECT id FROM source_files WHERE filename = ?").get(filename).id;
}

function insertBlocks(db, litKey, section, hymns, glory, sourceFileIdTt, sourceFileIdYy) {
  const insert = db.prepare(`
    INSERT INTO blocks (source_file_id, liturgical_key, pronoun, service, section, block_order, type, tone, label, text)
    VALUES (?, ?, ?, 'vespers', ?, ?, ?, ?, ?, ?)
  `);

  let order = 0;

  for (const hymn of hymns) {
    insert.run(sourceFileIdTt, litKey, 'tt', section, order, 'hymn', hymn.tone, hymn.label, hymn.text);
    // St Sergius texts are Thee/Thy only — insert same for yy as placeholder
    insert.run(sourceFileIdYy, litKey, 'yy', section, order, 'hymn', hymn.tone, hymn.label, hymn.text);
    order++;
  }

  if (glory) {
    insert.run(sourceFileIdTt, litKey, 'tt', section, order, 'hymn', glory.tone, glory.label, glory.text);
    insert.run(sourceFileIdYy, litKey, 'yy', section, order, 'hymn', glory.tone, glory.label, glory.text);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const db = new DatabaseSync(DB_PATH);
  let gapKeys;

  if (ONLY_KEY) {
    gapKeys = [ONLY_KEY];
  } else {
    gapKeys = FORCE ? (() => {
      const all = [];
      for (let w = 1; w <= 6; w++)
        for (const d of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
          all.push(`lent.week.${w}.${d}`);
      return all;
    })() : getGapKeys(db);
  }

  console.log(`Processing ${gapKeys.length} key(s)${DRY_RUN ? ' (DRY RUN)' : ''}…\n`);

  let added = 0;
  let skipped = 0;

  for (const key of gapKeys) {
    const pdfName = litKeyToPdfName(key);
    if (!pdfName) {
      console.log(`  ${key}: — cannot map to PDF name`);
      skipped++;
      continue;
    }

    let pdfPath;
    try {
      pdfPath = downloadPdf(pdfName);
    } catch {
      pdfPath = null;
    }
    if (!pdfPath) {
      console.log(`  ${key}: ✗ download failed (${pdfName})`);
      skipped++;
      continue;
    }

    const rawText = pdfToText(pdfPath);
    const vespersText = extractVespersSection(rawText);
    if (!vespersText) {
      console.log(`  ${key}: — no VESPERS section found in ${pdfName}`);
      skipped++;
      continue;
    }

    const parsed = parseVespersSection(vespersText);
    const licCount = parsed.lordICall.hymns.length;
    const apostCount = parsed.aposticha.hymns.length;
    const gloryLic = parsed.lordICall.glory ? ' +glory' : '';
    const gloryApost = parsed.aposticha.glory ? ' +glory' : '';

    console.log(`  ${key}: LIC ${licCount} hymns${gloryLic} | Aposticha ${apostCount} hymns${gloryApost}  (${pdfName})`);

    if (!DRY_RUN && (licCount > 0 || apostCount > 0)) {
      // Delete existing blocks for this key if --force
      if (FORCE) {
        db.prepare("DELETE FROM blocks WHERE liturgical_key = ? AND service = 'vespers' AND section IN ('lordICall', 'aposticha')").run(key);
      }

      const sfTt = getOrCreateSourceFile(db, pdfName, 'tt');
      const sfYy = getOrCreateSourceFile(db, pdfName, 'yy');

      if (licCount > 0) {
        insertBlocks(db, key, 'lordICall', parsed.lordICall.hymns, parsed.lordICall.glory, sfTt, sfYy);
      }
      if (apostCount > 0) {
        insertBlocks(db, key, 'aposticha', parsed.aposticha.hymns, parsed.aposticha.glory, sfTt, sfYy);
      }
      added++;
    } else if (licCount > 0 || apostCount > 0) {
      added++;
    }
  }

  db.close();
  console.log(`\nDone. Added ${added} day(s). Skipped ${skipped} day(s).${DRY_RUN ? ' (DRY RUN — nothing written)' : ''}`);
}

main();
