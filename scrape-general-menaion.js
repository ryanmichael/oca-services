#!/usr/bin/env node
/**
 * scrape-general-menaion.js
 *
 * Downloads General Menaion PDFs from https://st-sergius.org/services/menaion/
 * for each saint category (Martyr, Hierarch, Monastic, etc.), parses the
 * Vespers sections (Lord I Call stichera, Aposticha, Troparion), and inserts
 * them into storage/oca.db in a `general_menaion` table.
 *
 * Also adds/updates a `saint_type` column on the `commemorations` table.
 *
 * Usage:
 *   node scrape-general-menaion.js --dry-run        # parse only, don't write to DB
 *   node scrape-general-menaion.js                   # download + parse + insert all
 *   node scrape-general-menaion.js --type martyr     # single type only
 *   node scrape-general-menaion.js --classify-only   # only run saint_type classification
 */

'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { DatabaseSync } = require('node:sqlite');

// ── CLI flags ────────────────────────────────────────────────────────────────
const args          = process.argv.slice(2);
const DRY_RUN       = args.includes('--dry-run');
const CLASSIFY_ONLY = args.includes('--classify-only');
const ONLY_TYPE     = (() => { const i = args.indexOf('--type'); return i >= 0 ? args[i+1] : null; })();

const BASE_URL = 'https://st-sergius.org/services/menaion';
const DB_PATH  = path.join(__dirname, 'storage', 'oca.db');

// ── PDF map ──────────────────────────────────────────────────────────────────

const PDF_MAP = [
  { file: 'Angels.pdf',           type: 'angels' },
  { file: 'Apostle.pdf',          type: 'apostle' },
  { file: 'Apostles.pdf',         type: 'apostles' },
  { file: 'Fools.pdf',            type: 'fool' },
  { file: 'Heirarch.pdf',         type: 'hierarch' },
  { file: 'Heirarchs.pdf',        type: 'hierarchs' },
  { file: 'Hieromartyr.pdf',      type: 'hieromartyr' },
  { file: 'Heiromartyrs.pdf',     type: 'hieromartyrs' },
  { file: 'Martyress.pdf',        type: 'maidenMartyr' },
  { file: 'Martyresses.pdf',      type: 'maidenMartyrs' },
  { file: 'Martyr.pdf',           type: 'martyr' },
  { file: 'Martyrs.pdf',          type: 'martyrs' },
  { file: 'Monastic.pdf',         type: 'monastic' },
  { file: 'Monastics.pdf',        type: 'monastics' },
  { file: 'HieroConfessor.pdf',   type: 'monasticConfessor' },
  { file: 'MonasticMartyr.pdf',   type: 'monasticMartyr' },
  { file: 'MonasticMartyrs.pdf',  type: 'monasticMartyrs' },
  { file: 'Holy%20Fathers.pdf',   type: 'holyFathers' },
  { file: 'Nun.pdf',              type: 'nun' },
  { file: 'Nuns.pdf',             type: 'nuns' },
  { file: 'NunMartyr.pdf',        type: 'nunMartyr' },
  { file: 'Theotokos.pdf',        type: 'theotokos' },
  { file: 'Cross.pdf',            type: 'cross' },
  { file: 'St%20John%20Baptist.pdf', type: 'forerunner' },
  { file: 'Prophet.pdf',          type: 'prophet' },
  { file: 'Unmercenaries.pdf',    type: 'unmercenaries' },
];

// ── Database ─────────────────────────────────────────────────────────────────

function openDb() {
  return new DatabaseSync(DB_PATH);
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS general_menaion (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      saint_type  TEXT    NOT NULL,
      section     TEXT    NOT NULL,
      "order"     INTEGER NOT NULL,
      tone        INTEGER,
      label       TEXT,
      verse       TEXT,
      text        TEXT    NOT NULL,
      source      TEXT    NOT NULL DEFAULT 'stSergius-general',
      UNIQUE (saint_type, section, "order")
    )
  `);

  // Add saint_type column to commemorations if not present
  try {
    db.exec(`ALTER TABLE commemorations ADD COLUMN saint_type TEXT`);
    console.log('Added saint_type column to commemorations.');
  } catch {
    // Column already exists
  }
}

// ── PDF helpers ───────────────────────────────────────────────────────────────

function downloadPdf(filename) {
  const url = `${BASE_URL}/${filename}`;
  const tmp = path.join(os.tmpdir(), `gm-${filename.replace(/%20/g, '_')}`);
  execSync(`curl -s -f -o "${tmp}" "${url}"`, { stdio: 'pipe' });
  return tmp;
}

function pdfToText(pdfPath) {
  return execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

function cleanText(raw) {
  return raw
    .split('\n')
    .map(l => l.replace(/[\uE000-\uF8FF]/g, ''))
    .map(l => l.replace(/[ \t]{2,}(Soprano|Alto|Tenor|Bass)[ \t]+/g, ' '))
    .map(l => l.replace(/\bw{1,2}\b/g, ''))
    .map(l => l.replace(/\s*#\s*/g, ' '))
    .map(l => l.trim())
    .join('\n');
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

function parseToneFromHeader(line) {
  const m = line.match(/in\s+Tone\s+([IVXivx]+|\d+)/i);
  return m ? romanToInt(m[1]) : null;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a General Menaion PDF text into Vespers sections.
 *
 * Returns:
 *   {
 *     lordICall:  { hymns: [{text, tone}], glory: {text,tone}, theotokion: {text,tone} },
 *     aposticha:  { hymns: [{text, tone, verse}], glory: {text,tone}, theotokion: {text,tone} },
 *     troparion:  { text, tone },
 *   }
 */
function parseGeneralMenaion(text, saintType) {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const lic   = { hymns: [], glory: null, theotokion: null };
  const apost = { hymns: [], glory: null, theotokion: null };
  let troparion = null;

  // State
  let mode       = null;   // 'lic' | 'apost' | 'troparion' | null
  let hymnLines  = [];
  let hymnTone   = null;
  let hymnVerse  = null;
  let isGlory    = false;
  let isGloryNow = false;
  let isTheotokion = false;
  let verseMode  = false;
  let skipUntilSection = false;  // skip OT readings, conditional sections, etc.

  function flushHymn() {
    if (!hymnLines.length) return;
    const rawText = hymnLines.join(' ').replace(/\s+/g, ' ').trim();
    hymnLines = [];
    if (!rawText) return;

    // Strip trailing (Twice), (Thrice)
    const text = rawText.replace(/\s*\((Twice|Thrice)\)\s*$/i, '').trim();

    if (mode === 'troparion') {
      troparion = { text, tone: hymnTone };
      mode = null;
      return;
    }

    // Don't accumulate hymns when not in a valid section mode
    if (mode !== 'lic' && mode !== 'apost') {
      isGlory = false; isGloryNow = false; isTheotokion = false;
      hymnVerse = null;
      return;
    }

    const bucket = mode === 'lic' ? lic : apost;

    if (isGloryNow) {
      bucket.glory     = { text, tone: hymnTone };
      bucket.theotokion = { text, tone: hymnTone };
    } else if (isGlory) {
      bucket.glory = { text, tone: hymnTone };
    } else if (isTheotokion) {
      bucket.theotokion = { text, tone: hymnTone };
    } else {
      const obj = { text, tone: hymnTone };
      if (hymnVerse) obj.verse = hymnVerse;
      obj.order = bucket.hymns.length;
      bucket.hymns.push(obj);
    }

    hymnVerse      = null;
    isGlory        = false;
    isGloryNow     = false;
    isTheotokion   = false;
  }

  function verseComplete(v) {
    if (!/ \* /.test(v)) return false;
    return /[.!?,;]"?\s*$/.test(v) ||
           /\b(Lord|God|Thee|Him|us|good things|things|peoples?|nations?)\s*$/i.test(v);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Hard stop: AT MATINS or AT THE LITURGY ─────────────────────────────
    if (/^AT\s+MATINS\b/i.test(line) || /^AT\s+THE\s+LITURGY\b/i.test(line)) {
      flushHymn();
      break;
    }

    // ── Skip rubric-only blocks ────────────────────────────────────────────
    // Skip conditional sections (idiomelon, polyeleos dogmatikon, stavrotheotokion)
    if (/^If\s+(an\s+Idiomelon|the\s+Celebration)/i.test(line)) {
      flushHymn();
      skipUntilSection = true;
      continue;
    }
    // Stavrotheotokion after regular theotokion — skip
    if (/^Stavrotheotokion:/i.test(line)) {
      flushHymn();
      skipUntilSection = true;
      continue;
    }
    // Otherwise, Theotokion — skip (conditional fallback)
    if (/^Otherwise,?\s*Theotokion:/i.test(line)) {
      flushHymn();
      skipUntilSection = true;
      continue;
    }

    // ── Lord I Call header ──────────────────────────────────────────────────
    if (/(?:On|At)\s+.{1,5}Lord,?\s*I\s*have\s*cried/i.test(line)) {
      flushHymn();
      mode = 'lic'; skipUntilSection = false;
      hymnTone = parseToneFromHeader(line);
      continue;
    }

    // ── Aposticha header ───────────────────────────────────────────────────
    if (/On\s+the\s+Aposticha/i.test(line)) {
      flushHymn();
      mode = 'apost'; skipUntilSection = false;
      hymnTone = parseToneFromHeader(line);
      continue;
    }

    // ── Troparion header ───────────────────────────────────────────────────
    if (/^Troparion,?\s+in\s+Tone/i.test(line) || /^Troparion\s+of\s+the/i.test(line)) {
      flushHymn();
      mode = 'troparion'; skipUntilSection = false;
      hymnTone = parseToneFromHeader(line);
      continue;
    }

    // ── Skip: "The Troparion from the Typicon..." and similar rubric lines ──
    if (/^The\s+Troparion\s+(from|of)\s+the\s+(Typicon|Festival)/i.test(line)) {
      flushHymn();
      continue;
    }

    // ── The Entrance / The Dismissal / readings — skip section ─────────────
    if (/^The\s+Entrance\b/i.test(line) || /^The\s+Dismissal/i.test(line) ||
        /^THE\s+READING\b/i.test(line) || /^THE\s+WISDOM\b/i.test(line)) {
      flushHymn();
      skipUntilSection = true;
      continue;
    }

    // In skip mode, wait for a real section header (Aposticha, Troparion) to resume.
    // Glory/Both now within conditional sections (stavrotheotokion, etc.) stay skipped.
    if (skipUntilSection) continue;

    if (!mode) continue;

    // ── Spec. Mel. lines — skip ────────────────────────────────────────────
    if (/^Spec\.\s*Mel\./i.test(line)) continue;

    // ── "If the celebration be with a Polyeleos" rubric (mid-section) ──────
    // This can appear between Glory and Both now within aposticha or LIC.
    // Skip it and any conditional content that follows until next real content.
    if (/^If\s+the\s+celebration/i.test(line)) {
      flushHymn();
      skipUntilSection = true;
      continue;
    }

    // ── Rubric line "Glory ..., Both now ..., Theotokion or Stavrotheotokion:" ──
    // This is a closing rubric after a troparion/section, not actual content.
    if (/Theotokion\s+or\s+Stavrotheotokion/i.test(line)) {
      flushHymn();
      mode = null;
      continue;
    }

    // ── Glory ..., Both now ... ────────────────────────────────────────────
    const gloryBothNow = /^Glory\s*\.\.\.,\s*Both\s*now\s*\.\.\./i.test(line);
    const gloryOnly    = /^Glory\s*\.\.\.,?\s*(?!Both)/i.test(line);
    const bothNowOnly  = /^Both\s*now\s*\.\.\./i.test(line);

    if (gloryBothNow) {
      flushHymn(); verseMode = false;
      const t = parseToneFromHeader(line);
      if (t) hymnTone = t;
      isGloryNow = true;
      // Check if text follows on the same line (after "Theotokion in Tone X:")
      const after = line
        .replace(/^Glory\s*\.\.\.,\s*Both\s*now\s*\.\.\.,?\s*/i, '')
        .replace(/^(the\s+)?Theotokion\s*(or\s+Stavrotheotokion)?\s*,?\s*/i, '')
        .replace(/,?\s*in\s+Tone\s+[IVXivx\d]+\s*:?\s*/i, '')
        .trim();
      // Skip pure rubric remainders (ending with ":")
      if (after && after.length > 10 && !after.endsWith(':')) hymnLines.push(after);
      continue;
    }
    if (gloryOnly) {
      flushHymn(); verseMode = false;
      const t = parseToneFromHeader(line);
      if (t) hymnTone = t;
      isGlory = true;
      const after = line
        .replace(/^Glory\s*\.\.\.,?\s*/i, '')
        .replace(/,?\s*in\s+Tone\s+[IVXivx\d]+\s*:?\s*/i, '')
        .trim();
      if (after && after.length > 10) hymnLines.push(after);
      continue;
    }
    if (bothNowOnly) {
      flushHymn(); verseMode = false;
      const t = parseToneFromHeader(line);
      if (t) hymnTone = t;
      isTheotokion = true;
      const after = line
        .replace(/^Both\s*now\s*\.\.\.,?\s*/i, '')
        .replace(/^Theotokion,?\s*/i, '')
        .replace(/,?\s*in\s+Tone\s+[IVXivx\d]+\s*:?\s*/i, '')
        .trim();
      if (after && after.length > 10) hymnLines.push(after);
      continue;
    }

    // ── Verse: lines ─────────────────────────────────────────────────────────
    // In aposticha: capture the verse text for the hymn
    // In LIC: flush current hymn and skip the verse (it's a psalm verse, not hymn text)
    if (/^Verse:/i.test(line)) {
      flushHymn();
      if (mode === 'apost') {
        verseMode = true;
        hymnVerse = line.replace(/^Verse:\s*/i, '').trim();
        if (verseComplete(hymnVerse)) verseMode = false;
      } else {
        // LIC mode — skip multi-line verse
        verseMode = true;
        hymnVerse = line.replace(/^Verse:\s*/i, '').trim();
        if (verseComplete(hymnVerse)) { verseMode = false; hymnVerse = null; }
      }
      continue;
    }
    if (verseMode) {
      if (mode === 'apost') {
        hymnVerse += ' ' + line;
        if (verseComplete(hymnVerse)) verseMode = false;
      } else {
        // LIC verse continuation — skip
        hymnVerse = (hymnVerse || '') + ' ' + line;
        if (verseComplete(hymnVerse)) { verseMode = false; hymnVerse = null; }
      }
      continue;
    }

    // ── Double-asterisk sticheron boundary (LIC) ───────────────────────────
    if (mode === 'lic' && line.includes('**')) {
      const noTwice = line.replace(/\s*\((Twice|Thrice)\)\s*$/i, '').trim();
      if (/[.!?]["']?\s*$/.test(noTwice)) {
        hymnLines.push(noTwice);
        flushHymn();
        continue;
      }
      hymnLines.push(noTwice);
      continue;
    }

    // Continuation after ** (LIC only) — sentence completion
    if (mode === 'lic' && hymnLines.length > 0 &&
        hymnLines.some(l => l.includes('**')) &&
        /[.!?]["']?\s*$/.test(line) &&
        !/^Glory|^Both now|^Verse:|^Troparion/i.test(line)) {
      const noTwice = line.replace(/\s*\((Twice|Thrice)\)\s*$/i, '').trim();
      hymnLines.push(noTwice);
      flushHymn();
      continue;
    }

    // ── Rubric lines to skip ───────────────────────────────────────────────
    if (/^\(Twice\)\s*$/i.test(line) || /^\(Thrice\)\s*$/i.test(line)) continue;
    if (/^Repeat:/i.test(line)) continue;
    // Repeat instructions: "Before the morning star ...," — abbreviated hymn reference
    if (/\.\.\.,\s*$/.test(line) && line.length < 80 && !line.includes('**')) {
      flushHymn();
      continue;
    }
    if (/^(Then,|Then )/i.test(line)) continue;
    if (line.endsWith(':') && line.length < 100 && !line.includes('**')) {
      // Short label lines like "Kontakion of the martyr, in Tone II:" — skip if rubric
      if (/^(Kontakion|Ikos|The Ikos|Sessional|Exapostilarion|The Canon|Irmos|Refrain)/i.test(line)) continue;
      if (/chant the following/i.test(line)) continue;
      // Tone header — update tone but skip
      const t = parseToneFromHeader(line);
      if (t) hymnTone = t;
      continue;
    }

    // ── Hymn text accumulation ─────────────────────────────────────────────
    hymnLines.push(line);
  }

  flushHymn();

  return { lordICall: lic, aposticha: apost, troparion };
}

// ── Saint type classification ────────────────────────────────────────────────

const SAINT_TYPE_RULES = [
  // Most specific first
  { pattern: /^Nun Martyr/i,                                      type: 'nunMartyr' },
  { pattern: /^(?:Monastic|Venerable New) Martyrs/i,              type: 'monasticMartyrs' },
  { pattern: /^(?:Monastic|Venerable New) Martyr\b/i,             type: 'monasticMartyr' },
  { pattern: /^Hieromartyrs?\b/i,                                 type: 'hieromartyr' },
  { pattern: /^(?:Holy )?Hieromartyrs\b/i,                        type: 'hieromartyrs' },
  { pattern: /^(?:Virgin|Maiden) Martyr/i,                        type: 'maidenMartyr' },
  { pattern: /^(?:Great[- ])?Martyr(?:ess)?\b(?!.*Martyrs)/i,     type: 'martyr' },
  { pattern: /^New Martyr/i,                                      type: 'martyr' },
  { pattern: /^(?:\d+\s+)?(?:Holy\s+)?Martyrs\b|^Martyred/i,     type: 'martyrs' },
  { pattern: /Fool.for.Christ/i,                                  type: 'fool' },
  { pattern: /^(?:Holy )?Prophet\b/i,                             type: 'prophet' },
  { pattern: /Forerunner|Baptist\s*John|Baptist,?\s*John/i,       type: 'forerunner' },
  { pattern: /^(?:Holy,?\s*Glorious\s+)?Apostle\b(?!.*Apostles)/i, type: 'apostle' },
  { pattern: /^(?:Holy\s+)?Apostles\b|Synaxis of the.*Apostle/i, type: 'apostles' },
  { pattern: /Equal.*Apostle/i,                                   type: 'apostle' },
  { pattern: /Unmercen/i,                                         type: 'unmercenaries' },
  { pattern: /^(?:Five )?Nuns?\b/i,                               type: 'nun' },
  // Icons / Theotokos feasts
  { pattern: /Icon.*(?:Mother of God|Theotokos)/i,                type: 'theotokos' },
  { pattern: /(?:Mother of God|Theotokos)/i,                      type: 'theotokos' },
  // Hierarchs: "Archbishop", "Bishop", "Patriarch", etc.
  { pattern: /Archbishop|Bishop|Patriarch|Metropolitan|^(?:Holy )?Hierarch/i, type: 'hierarch' },
  // Confessor
  { pattern: /Confessor/i,                                        type: 'monasticConfessor' },
  // Monastics: "Venerable" = monastic in OCA naming
  { pattern: /^Venerable\b/i,                                     type: 'monastic' },
  { pattern: /^Righteous\b/i,                                     type: 'monastic' },
  { pattern: /^Blessed\b/i,                                       type: 'monastic' },
  // Cross feasts
  { pattern: /Cross/i,                                            type: 'cross' },
  // Generic "Saint X" — often hierarchs, sometimes monastics
  { pattern: /^Saint\b/i,                                         type: 'hierarch' },
];

function classifySaintType(title) {
  for (const { pattern, type } of SAINT_TYPE_RULES) {
    if (pattern.test(title)) return type;
  }
  return null;
}

function classifyAllSaints(db) {
  const comms = db.prepare(`SELECT id, title FROM commemorations`).all();
  const update = db.prepare(`UPDATE commemorations SET saint_type = ? WHERE id = ?`);

  let updated = 0;
  for (const { id, title } of comms) {
    const type = classifySaintType(title);
    if (type) {
      update.run(type, id);
      updated++;
    }
  }
  console.log(`Classified ${updated} of ${comms.length} commemorations.`);
}

// ── DB insertion ─────────────────────────────────────────────────────────────

function insertGeneralMenaion(db, saintType, parsed, dryRun) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO general_menaion (saint_type, section, "order", tone, label, verse, text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;

  // Lord I Call stichera
  for (const h of parsed.lordICall.hymns) {
    if (!dryRun) insert.run(saintType, 'lordICall', h.order, h.tone ?? null, null, null, h.text);
    count++;
  }
  if (parsed.lordICall.glory) {
    if (!dryRun) insert.run(saintType, 'lordICall', 90, parsed.lordICall.glory.tone ?? null, 'Glory', null, parsed.lordICall.glory.text);
    count++;
  }
  if (parsed.lordICall.theotokion && parsed.lordICall.theotokion !== parsed.lordICall.glory) {
    if (!dryRun) insert.run(saintType, 'lordICall', 91, parsed.lordICall.theotokion.tone ?? null, 'Theotokion', null, parsed.lordICall.theotokion.text);
    count++;
  }

  // Aposticha
  for (const h of parsed.aposticha.hymns) {
    if (!dryRun) insert.run(saintType, 'aposticha', h.order, h.tone ?? null, null, h.verse ?? null, h.text);
    count++;
  }
  if (parsed.aposticha.glory) {
    if (!dryRun) insert.run(saintType, 'aposticha', 90, parsed.aposticha.glory.tone ?? null, 'Glory', null, parsed.aposticha.glory.text);
    count++;
  }
  if (parsed.aposticha.theotokion && parsed.aposticha.theotokion !== parsed.aposticha.glory) {
    if (!dryRun) insert.run(saintType, 'aposticha', 91, parsed.aposticha.theotokion.tone ?? null, 'Theotokion', null, parsed.aposticha.theotokion.text);
    count++;
  }

  // Troparion
  if (parsed.troparion) {
    if (!dryRun) insert.run(saintType, 'troparion', 0, parsed.troparion.tone ?? null, null, null, parsed.troparion.text);
    count++;
  }

  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = openDb();
  ensureSchema(db);

  if (CLASSIFY_ONLY) {
    classifyAllSaints(db);
    db.close();
    return;
  }

  // Filter PDFs if --type specified
  let pdfs = PDF_MAP;
  if (ONLY_TYPE) {
    pdfs = pdfs.filter(p => p.type === ONLY_TYPE);
    if (pdfs.length === 0) {
      console.log(`Unknown type: ${ONLY_TYPE}`);
      console.log('Available types:', PDF_MAP.map(p => p.type).join(', '));
      db.close(); return;
    }
  }

  console.log(`Processing ${pdfs.length} General Menaion PDF(s)${DRY_RUN ? ' (DRY RUN)' : ''}…\n`);

  let totalInserted = 0;
  let processed     = 0;
  let skipped       = 0;

  for (const { file, type } of pdfs) {
    // Download
    let pdfPath;
    try {
      pdfPath = downloadPdf(file);
    } catch {
      console.log(`  ${type}: download failed (${file})`);
      skipped++;
      continue;
    }

    // Extract text
    let rawText;
    try {
      rawText = pdfToText(pdfPath);
    } catch (err) {
      console.log(`  ${type}: pdftotext failed — ${err.message}`);
      try { fs.unlinkSync(pdfPath); } catch {}
      skipped++;
      continue;
    }
    try { fs.unlinkSync(pdfPath); } catch {}

    const cleaned = cleanText(rawText);
    const parsed  = parseGeneralMenaion(cleaned, type);

    const licCount   = parsed.lordICall.hymns.length +
                       (parsed.lordICall.glory ? 1 : 0) +
                       (parsed.lordICall.theotokion && parsed.lordICall.theotokion !== parsed.lordICall.glory ? 1 : 0);
    const apostCount = parsed.aposticha.hymns.length +
                       (parsed.aposticha.glory ? 1 : 0) +
                       (parsed.aposticha.theotokion && parsed.aposticha.theotokion !== parsed.aposticha.glory ? 1 : 0);
    const hasTrop    = parsed.troparion ? 1 : 0;

    console.log(`  ${type}: LIC ${licCount} | Aposticha ${apostCount} | Troparion ${hasTrop}`);

    if (DRY_RUN) {
      // Print preview of first sticheron
      if (parsed.lordICall.hymns[0]) {
        console.log(`    LIC[0] Tone ${parsed.lordICall.hymns[0].tone}: "${parsed.lordICall.hymns[0].text.slice(0, 80)}…"`);
      }
      if (parsed.aposticha.hymns[0]) {
        console.log(`    Apost[0] Tone ${parsed.aposticha.hymns[0].tone}: "${parsed.aposticha.hymns[0].text.slice(0, 80)}…"`);
        if (parsed.aposticha.hymns[0].verse) {
          console.log(`      Verse: "${parsed.aposticha.hymns[0].verse.slice(0, 60)}…"`);
        }
      }
      if (parsed.troparion) {
        console.log(`    Trop Tone ${parsed.troparion.tone}: "${parsed.troparion.text.slice(0, 80)}…"`);
      }
    }

    const inserted = insertGeneralMenaion(db, type, parsed, DRY_RUN);
    totalInserted += inserted;
    processed++;
  }

  // Classify all saints
  if (!DRY_RUN) {
    console.log('');
    classifyAllSaints(db);
  }

  db.close();

  const dryTag = DRY_RUN ? ' (DRY RUN — nothing written)' : '';
  console.log(`\nDone. Inserted ${totalInserted} rows for ${processed} types. Skipped ${skipped}.${dryTag}`);
}

main().catch(err => { console.error(err); process.exit(1); });
