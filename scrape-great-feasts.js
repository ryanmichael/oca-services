#!/usr/bin/env node
/**
 * scrape-great-feasts.js
 *
 * Downloads OCA service-text DOCX files for Great Feasts and extracts
 * all Vespers stichera (Lord I Call, Litya, Aposticha) into storage/oca.db.
 *
 * Unlike scrape-menaion-stichera.js (which filters out resurrectional hymns),
 * this captures ALL stichera — on great feasts everything is feast-specific.
 *
 * Available DOCX feasts: Transfiguration, Dormition, Meeting, Nativity of
 * Theotokos, Elevation, Entry of Theotokos.
 * NOT available as DOCX: Nativity, Theophany, Annunciation (published as PDFs).
 *
 * Usage:
 *   node scrape-great-feasts.js                 — all available feasts
 *   node scrape-great-feasts.js --feast meeting  — single feast
 *   node scrape-great-feasts.js --dry-run        — parse only, don't write DB
 */

'use strict';

const https      = require('https');
const http       = require('http');
const fs         = require('fs');
const os         = require('os');
const path       = require('path');
const { execSync }     = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH  = path.join(__dirname, 'storage', 'oca.db');
const BASE_URL = 'https://files.oca.org/service-texts';
const RATE_MS  = 800;

// ─── Great Feast definitions ─────────────────────────────────────────────────

const FEASTS = {
  transfiguration: { month: 8,  day: 6,  year: 2025, name: 'Transfiguration',        commId: 1572 },
  dormition:       { month: 8,  day: 15, year: 2025, name: 'Dormition',              commId: 1642 },
  meeting:         { month: 2,  day: 2,  year: 2026, name: 'Meeting of the Lord',    commId: 253  },
  nativityBVM:     { month: 9,  day: 8,  year: 2025, name: 'Nativity of Theotokos',  commId: 1843 },
  elevation:       { month: 9,  day: 14, year: 2025, name: 'Elevation of the Cross', commId: 1890 },
  entryBVM:        { month: 11, day: 21, year: 2025, name: 'Entry of Theotokos',     commId: 2380 },
};

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
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── DOCX → XML ─────────────────────────────────────────────────────────────

async function docxToXml(url) {
  const buf = await fetchBinary(url);
  if (!buf) return null;

  const tmpDocx = path.join(os.tmpdir(), `oca-feast-${Date.now()}.docx`);
  const tmpDir  = path.join(os.tmpdir(), `oca-feast-${Date.now()}`);
  fs.writeFileSync(tmpDocx, buf);

  try {
    execSync(`unzip -o "${tmpDocx}" word/document.xml -d "${tmpDir}"`,
      { encoding: 'utf8', stdio: 'pipe' });
    return fs.readFileSync(path.join(tmpDir, 'word', 'document.xml'), 'utf8');
  } finally {
    try { fs.unlinkSync(tmpDocx); } catch {}
    try { execSync(`rm -rf "${tmpDir}"`); } catch {}
  }
}

// ─── XML paragraph extraction ────────────────────────────────────────────────

function extractParagraphs(xml) {
  const paragraphs = [];
  const pRe = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let m;

  while ((m = pRe.exec(xml)) !== null) {
    const pXml = m[0];
    const pPrMatch = pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    const pPr = pPrMatch ? pPrMatch[0] : '';
    const centered        = /w:val="center"/.test(pPr);
    const firstLineIndent = /w:firstLine="720"/.test(pPr);

    const runs = [];
    const runRe = /<w:r[ >][\s\S]*?<\/w:r>/g;
    let rm;
    while ((rm = runRe.exec(pXml)) !== null) {
      const rXml = rm[0];
      const rPrM = rXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
      const rPr  = rPrM ? rPrM[0] : '';
      const bold   = /<w:b\/>/.test(rPr) || /<w:b w:val="true"/.test(rPr);
      const italic = /<w:i\/>/.test(rPr) || /<w:i w:val="true"/.test(rPr);
      const red    = /FF0000/i.test(rPr);

      const parts = [];
      const tRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let tm;
      while ((tm = tRe.exec(rXml)) !== null) parts.push(tm[1]);
      const hasTab = /<w:tab\/>/.test(rXml);
      const text = parts.join('') + (hasTab ? '\t' : '');

      if (text) runs.push({ text, bold, italic, red });
    }

    const fullText = runs.map(r => r.text).join('').trim();
    if (!fullText) continue;

    paragraphs.push({
      text:         fullText,
      runs,
      anyBold:      runs.some(r => r.bold),
      anyRed:       runs.some(r => r.red),
      hasItalicRed: runs.some(r => r.italic && r.red),
      centered,
      firstLineIndent,
    });
  }

  return paragraphs;
}

// ─── Text cleaning ───────────────────────────────────────────────────────────

function cleanText(lines) {
  return lines
    .join(' ')
    .replace(/\s*\/\/\s*/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

// ─── Section boundary detection ──────────────────────────────────────────────

function findSectionBounds(paras) {
  const sections = {};

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (!p.centered || !p.anyBold) continue;
    const t = p.text.toLowerCase();

    if (t.includes('lord i call')) sections.lordICall = i;
    else if (/^litya$/i.test(p.text.trim())) sections.litya = i;
    else if (/aposticha/i.test(t)) sections.aposticha = i;
    else if (/old testament|first antiphon|at matins|god is the lord/i.test(t)) {
      // Mark the end of vespers content
      if (!sections.end || i < sections.end) sections.end = i;
    }
  }

  return sections;
}

// ─── Parse tone from a label paragraph ───────────────────────────────────────

function parseToneFromLabel(p) {
  // Bold runs have tone info (may be split across multiple runs), italic+red has label text
  const boldRuns = p.runs.filter(r => r.bold && !r.italic && !r.red);
  let tone = null;
  // Concatenate all bold run texts and look for a digit
  const boldText = boldRuns.map(r => r.text).join('');
  const tm = boldText.match(/\d+/);
  if (tm) tone = parseInt(tm[0], 10);
  // Collect label from red/italic runs (everything after last bold run)
  const lastBoldIdx = boldRuns.length > 0
    ? p.runs.indexOf(boldRuns[boldRuns.length - 1])
    : -1;
  const label = lastBoldIdx >= 0
    ? p.runs.slice(lastBoldIdx + 1).filter(r => r.red || r.italic).map(r => r.text).join('').trim()
    : '';
  return { tone, label };
}

// ─── Lord I Call parser (great feast — captures ALL stichera) ────────────────

const VERSE_RE    = /^V\.\s*\((\d+)\)/;
const DOXOLOGY_RE = /^Glory to the Father|^Now and ever/i;
const REPEAT_RE   = /^\(Repeat:/i;

function parseFeastLordICall(paras, startIdx, endIdx) {
  const section = paras.slice(startIdx + 1, endIdx);
  const allHymns = [];
  let tone      = null;
  let label     = '';
  let hymnLines = [];
  let atGlory   = false;
  let combinesGloryNow = false;
  let inHymn    = false;
  let sawGlory  = false; // true after "Glory..." to detect combined Glory/Now

  function flush() {
    if (hymnLines.length === 0) return;
    const text = cleanText(hymnLines);
    if (text) allHymns.push({ isGlory: atGlory, tone, label, text });
    hymnLines = [];
  }

  for (const p of section) {
    // Verse marker: V. (8), V. (7), etc.
    if (VERSE_RE.test(p.text) && p.anyRed) {
      flush();
      atGlory  = false;
      sawGlory = false;
      inHymn   = true;
      continue;
    }

    // Repeat instruction — skip, we already have the hymn
    if (REPEAT_RE.test(p.text) && p.anyRed) {
      continue;
    }

    // Doxology markers
    if (DOXOLOGY_RE.test(p.text)) {
      flush();
      if (/^Glory/i.test(p.text)) {
        atGlory  = true;
        sawGlory = true;
        // Check if it's "Glory... now and ever..." combined in one paragraph
        if (/now and ever/i.test(p.text)) combinesGloryNow = true;
      } else if (/^Now and ever/i.test(p.text)) {
        // "Now and ever" immediately after "Glory" with no hymn in between = combined
        if (sawGlory && hymnLines.length === 0) {
          combinesGloryNow = true;
          // Keep atGlory = true — the combined hymn IS the doxastichon
        } else {
          atGlory = false;
        }
      }
      inHymn = true;
      continue;
    }

    // Label paragraph: bold tone + italic/red label
    if (p.hasItalicRed && p.runs.some(r => r.bold && !r.italic && !r.red)) {
      flush();
      const parsed = parseToneFromLabel(p);
      tone  = parsed.tone ?? tone;
      label = parsed.label;
      inHymn = true;
      continue;
    }

    // Bold-only tone line (e.g., "Tone 6" after Glory)
    if (p.anyBold && !p.anyRed && /^Tone\s+\d+$/i.test(p.text.trim())) {
      flush();
      const tm = p.text.match(/\d+/);
      if (tm) tone = parseInt(tm[0], 10);
      inHymn = true;
      continue;
    }

    // OT readings marker — stop parsing
    if (p.anyBold && /old testament/i.test(p.text)) break;

    // Hymn text
    if (!p.anyRed && !p.centered && inHymn && p.text) {
      hymnLines.push(p.text);
    }
  }
  flush();

  // Separate regular stichera from Glory doxastichon
  const stichera = [];
  let glory = null;
  let order = 1;
  for (const h of allHymns) {
    if (h.isGlory) {
      glory = { tone: h.tone, label: h.label, text: h.text, combinesGloryNow };
    } else {
      stichera.push({ order: order++, tone: h.tone, label: h.label, text: h.text });
    }
  }

  return { stichera, glory };
}

// ─── Litya parser ────────────────────────────────────────────────────────────

function parseFeastLitya(paras, startIdx, endIdx) {
  const section = paras.slice(startIdx + 1, endIdx);
  const allHymns = [];
  let tone      = null;
  let label     = '';
  let hymnLines = [];
  let atGlory   = false;
  let atNow     = false;
  let inHymn    = false;
  // Litya hymns have no verse markers — consecutive hymns flow as plain text.
  // Detect boundaries using the // pattern: after //, one more closing line,
  // then the next text paragraph starts a new hymn.
  let sawDoubleSlash = false; // true after a line containing //
  let hymnComplete   = false; // true after the closing line following //

  function flush() {
    if (hymnLines.length === 0) return;
    const text = cleanText(hymnLines);
    if (text) allHymns.push({ isGlory: atGlory, isNow: atNow, tone, label, text });
    hymnLines = [];
    hymnComplete   = false;
    sawDoubleSlash = false;
  }

  for (const p of section) {
    // Doxology markers
    if (DOXOLOGY_RE.test(p.text)) {
      flush();
      atGlory = /^Glory/i.test(p.text);
      atNow   = /^Now and ever/i.test(p.text);
      inHymn  = true;
      continue;
    }

    // Label paragraph: bold tone + italic/red label
    if (p.hasItalicRed && p.runs.some(r => r.bold && !r.italic && !r.red)) {
      flush();
      const parsed = parseToneFromLabel(p);
      tone  = parsed.tone ?? tone;
      label = parsed.label;
      atGlory = false;
      atNow   = false;
      inHymn  = true;
      continue;
    }

    // Bold-only tone line
    if (p.anyBold && !p.anyRed && /^Tone\s+\d+$/i.test(p.text.trim())) {
      flush();
      const tm = p.text.match(/\d+/);
      if (tm) tone = parseInt(tm[0], 10);
      inHymn = true;
      continue;
    }

    // Hymn text
    if (!p.anyRed && !p.centered && inHymn && p.text) {
      // If the previous hymn is complete (saw // + closing line), start new
      if (hymnComplete) {
        flush();
        atGlory = false;
        atNow   = false;
      }
      hymnLines.push(p.text);
      // Track // boundary: first see //, then the NEXT line is the closing line
      if (sawDoubleSlash) {
        hymnComplete = true;  // this line is the closing line after //
        sawDoubleSlash = false;
      }
      if (p.text.includes('//')) {
        sawDoubleSlash = true;
      }
    }
  }
  flush();

  // Split: regular stichera, glory, now-and-ever (theotokion)
  const stichera = [];
  let glory = null;
  let now   = null;
  let order = 1;
  for (const h of allHymns) {
    if (h.isGlory) {
      glory = { tone: h.tone, label: h.label, text: h.text };
    } else if (h.isNow) {
      now = { tone: h.tone, label: h.label, text: h.text };
    } else {
      stichera.push({ order: order++, tone: h.tone, label: h.label, text: h.text });
    }
  }

  return { stichera, glory, now };
}

// ─── Aposticha parser (great feast — captures ALL stichera) ──────────────────

function parseFeastAposticha(paras, startIdx, endIdx) {
  const section = paras.slice(startIdx + 1, endIdx);
  const allHymns = [];
  let tone      = null;
  let label     = '';
  let hymnLines = [];
  let atGlory   = false;
  let combinesGloryNow = false;
  let inHymn    = false;
  let sawGlory  = false;

  function flush() {
    if (hymnLines.length === 0) return;
    const text = cleanText(hymnLines);
    if (text) allHymns.push({ isGlory: atGlory, tone, label, text });
    hymnLines = [];
  }

  for (const p of section) {
    // Verse marker (aposticha uses "V." without ordinal)
    if (/^V\./i.test(p.text) && p.anyRed) {
      flush();
      atGlory  = false;
      sawGlory = false;
      inHymn   = true;
      continue;
    }

    // Repeat instruction
    if (REPEAT_RE.test(p.text) && p.anyRed) {
      continue;
    }

    // Doxology markers
    if (DOXOLOGY_RE.test(p.text)) {
      flush();
      if (/^Glory/i.test(p.text)) {
        atGlory  = true;
        sawGlory = true;
        if (/now and ever/i.test(p.text)) combinesGloryNow = true;
      } else if (/^Now and ever/i.test(p.text)) {
        if (sawGlory && hymnLines.length === 0) {
          combinesGloryNow = true;
          // Keep atGlory = true
        } else {
          atGlory = false;
        }
      }
      inHymn = true;
      continue;
    }

    // Label paragraph
    if (p.hasItalicRed && p.runs.some(r => r.bold && !r.italic && !r.red)) {
      flush();
      const parsed = parseToneFromLabel(p);
      tone  = parsed.tone ?? tone;
      label = parsed.label;
      inHymn = true;
      continue;
    }

    // Bold-only tone line
    if (p.anyBold && !p.anyRed && /^Tone\s+\d+$/i.test(p.text.trim())) {
      flush();
      const tm = p.text.match(/\d+/);
      if (tm) tone = parseInt(tm[0], 10);
      inHymn = true;
      continue;
    }

    // Troparion marker — stop parsing aposticha
    if (p.anyBold && /troparion/i.test(p.text)) break;

    // Red italic verse continuation (psalm verse text, not a hymn) — skip
    if (p.anyRed && p.hasItalicRed && !p.anyBold) continue;

    // Hymn text
    if (!p.anyRed && !p.centered && inHymn && p.text) {
      hymnLines.push(p.text);
    }
  }
  flush();

  const stichera = [];
  let glory = null;
  let order = 1;
  for (const h of allHymns) {
    if (h.isGlory) {
      glory = { tone: h.tone, label: h.label, text: h.text, combinesGloryNow };
    } else {
      stichera.push({ order: order++, tone: h.tone, label: h.label, text: h.text });
    }
  }

  return { stichera, glory };
}

// ─── Troparion parser ────────────────────────────────────────────────────────

function parseFeastTroparion(paras, apostEnd) {
  // Look for troparion after aposticha
  for (let i = apostEnd; i < paras.length; i++) {
    const p = paras[i];
    if (p.anyBold && /troparion/i.test(p.text)) {
      // Extract tone
      const tm = p.text.match(/\d+/);
      const tone = tm ? parseInt(tm[0], 10) : null;
      // Collect hymn lines
      const lines = [];
      for (let j = i + 1; j < paras.length; j++) {
        const q = paras[j];
        if (q.anyRed || q.centered || (q.anyBold && !/^\d/.test(q.text.trim()))) break;
        if (q.text) lines.push(q.text);
      }
      if (lines.length > 0) {
        return { tone, text: cleanText(lines) };
      }
    }
    // Stop at Matins markers
    if (p.centered && p.anyBold && /at matins|god is the lord/i.test(p.text)) break;
  }
  return null;
}

// ─── Per-feast scraper ───────────────────────────────────────────────────────

async function scrapeFeast(feast, dryRun) {
  const { month, day, year, name, commId } = feast;
  const mm  = String(month).padStart(2, '0');
  const dd  = String(day).padStart(2, '0');
  const url = `${BASE_URL}/${year}-${mm}${dd}-texts-tt.docx`;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${name} (${mm}/${dd}) — ${url}`);
  console.log('='.repeat(60));

  const xml = await docxToXml(url);
  if (!xml) {
    console.log('  DOCX not found (404)');
    return { stored: 0 };
  }

  const paras = extractParagraphs(xml);
  console.log(`  Extracted ${paras.length} paragraphs`);

  const bounds = findSectionBounds(paras);
  console.log(`  Sections found:`, Object.keys(bounds).join(', '));

  // Determine section boundaries
  const licStart  = bounds.lordICall ?? -1;
  const lityaStart = bounds.litya ?? -1;
  const apostStart = bounds.aposticha ?? -1;
  const end = bounds.end ?? paras.length;

  const licEnd   = lityaStart > licStart ? lityaStart : (apostStart > licStart ? apostStart : end);
  const lityaEnd = apostStart > lityaStart ? apostStart : end;
  const apostEnd = end;

  // Parse each section
  const lic    = licStart >= 0 ? parseFeastLordICall(paras, licStart, licEnd) : { stichera: [], glory: null };
  const litya  = lityaStart >= 0 ? parseFeastLitya(paras, lityaStart, lityaEnd) : { stichera: [], glory: null, now: null };
  const apost  = apostStart >= 0 ? parseFeastAposticha(paras, apostStart, apostEnd) : { stichera: [], glory: null };

  // Parse troparion
  const troparion = parseFeastTroparion(paras, apostStart >= 0 ? apostEnd : end);

  // Report
  console.log(`  Lord I Call: ${lic.stichera.length} stichera${lic.glory ? ' + Glory' : ''}`);
  for (const s of lic.stichera) {
    console.log(`    [${s.order}] Tone ${s.tone}: ${s.text.substring(0, 60)}...`);
  }
  if (lic.glory) {
    console.log(`    [Glory] Tone ${lic.glory.tone}: ${lic.glory.text.substring(0, 60)}...`);
    if (lic.glory.combinesGloryNow) console.log(`    (combines Glory/Now)`);
  }

  console.log(`  Litya: ${litya.stichera.length} stichera${litya.glory ? ' + Glory' : ''}${litya.now ? ' + Now' : ''}`);
  for (const s of litya.stichera) {
    console.log(`    [${s.order}] Tone ${s.tone}: ${s.text.substring(0, 60)}...`);
  }

  console.log(`  Aposticha: ${apost.stichera.length} stichera${apost.glory ? ' + Glory' : ''}`);
  for (const s of apost.stichera) {
    console.log(`    [${s.order}] Tone ${s.tone}: ${s.text.substring(0, 60)}...`);
  }
  if (apost.glory) {
    if (apost.glory.combinesGloryNow) console.log(`    (combines Glory/Now)`);
  }

  if (troparion) {
    console.log(`  Troparion: Tone ${troparion.tone}: ${troparion.text.substring(0, 60)}...`);
  }

  if (dryRun) {
    console.log('  (dry run — skipping DB write)');
    return { stored: lic.stichera.length + (lic.glory ? 1 : 0) +
                     litya.stichera.length + (litya.glory ? 1 : 0) + (litya.now ? 1 : 0) +
                     apost.stichera.length + (apost.glory ? 1 : 0) };
  }

  // ─── Write to DB ─────────────────────────────────────────────────────────
  const db = new DatabaseSync(DB_PATH);
  const sourceDate = `${year}-${mm}-${dd}`;
  let stored = 0;

  // Ensure litya section is allowed (stichera table accepts any section string)
  // Delete existing rows for this feast
  for (const sec of ['lordICall', 'litya', 'aposticha']) {
    db.prepare(`DELETE FROM stichera WHERE commemoration_id=? AND section=?`).run(commId, sec);
  }

  const upsert = db.prepare(`
    INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'oca-feast')
    ON CONFLICT (commemoration_id, section, "order") DO UPDATE SET
      tone=excluded.tone, label=excluded.label, text=excluded.text,
      source_date=excluded.source_date, source=excluded.source
  `);

  // Lord I Call
  for (const s of lic.stichera) {
    upsert.run(commId, 'lordICall', s.order, s.tone, s.label || null, s.text, sourceDate);
    stored++;
  }
  if (lic.glory) {
    upsert.run(commId, 'lordICall', 0, lic.glory.tone, lic.glory.label || null, lic.glory.text, sourceDate);
    stored++;
  }

  // Litya
  for (const s of litya.stichera) {
    upsert.run(commId, 'litya', s.order, s.tone, s.label || null, s.text, sourceDate);
    stored++;
  }
  if (litya.glory) {
    upsert.run(commId, 'litya', 0, litya.glory.tone, litya.glory.label || null, litya.glory.text, sourceDate);
    stored++;
  }
  if (litya.now) {
    // Store theotokion as order -1 (special)
    upsert.run(commId, 'litya', -1, litya.now.tone, litya.now.label || null, litya.now.text, sourceDate);
    stored++;
  }

  // Aposticha
  for (const s of apost.stichera) {
    upsert.run(commId, 'aposticha', s.order, s.tone, s.label || null, s.text, sourceDate);
    stored++;
  }
  if (apost.glory) {
    upsert.run(commId, 'aposticha', 0, apost.glory.tone, apost.glory.label || null, apost.glory.text, sourceDate);
    stored++;
  }

  db.close();
  console.log(`  Stored ${stored} rows in DB (commemoration_id=${commId})`);
  return { stored };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const dryRun  = args.includes('--dry-run');
  const feastArg = args.includes('--feast') ? args[args.indexOf('--feast') + 1] : null;

  const feastKeys = feastArg ? [feastArg] : Object.keys(FEASTS);
  let totalStored = 0;

  for (let i = 0; i < feastKeys.length; i++) {
    const key   = feastKeys[i];
    const feast = FEASTS[key];
    if (!feast) {
      console.log(`Unknown feast: ${key}. Available: ${Object.keys(FEASTS).join(', ')}`);
      continue;
    }

    const { stored } = await scrapeFeast(feast, dryRun);
    totalStored += stored;

    if (i < feastKeys.length - 1) await sleep(RATE_MS);
  }

  console.log(`\nTotal: ${totalStored} stichera stored across ${feastKeys.length} feast(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
