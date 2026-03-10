/**
 * scrape-menaion-stichera.js
 *
 * Downloads OCA service-text DOCX files from files.oca.org for any date
 * that has a published file, extracts the Menaion Lord I Call stichera
 * (non-resurrectional hymns), and stores them in storage/oca.db.
 *
 * URL pattern: https://files.oca.org/service-texts/YYYY-MMDD-texts-tt.docx
 * Files exist for dates with notable Menaion feasts (any day of week).
 * Plain days return 404 and are skipped.
 *
 * The `order` field (1,2,3…) gives ordinal position within the Menaion block;
 * 0 is reserved for the Glory doxastichon. On a typical Saturday the
 * 3 Menaion stichera (orders 1–3) go at psalm verses 3–1.
 *
 * Usage:
 *   node scrape-menaion-stichera.js                    — all dates in 2025 + 2026
 *   node scrape-menaion-stichera.js --date 2025-10-18  — single date
 *   node scrape-menaion-stichera.js --year 2025        — full year
 *   node scrape-menaion-stichera.js --reset            — drop and recreate table
 *
 * Prerequisites: system unzip (standard on macOS/Linux)
 */

'use strict';

const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH  = path.join(__dirname, 'storage', 'oca.db');
const BASE_URL = 'https://files.oca.org/service-texts';
const RATE_MS  = 800;

// ─── DB schema ────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS stichera (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  commemoration_id   INTEGER NOT NULL REFERENCES commemorations(id),
  section            TEXT    NOT NULL DEFAULT 'lordICall',
  "order"            INTEGER NOT NULL,   -- 1,2,3… within Menaion block; 0 = Glory
  tone               INTEGER,
  label              TEXT,
  text               TEXT    NOT NULL,
  source_date        TEXT,
  UNIQUE (commemoration_id, section, "order")
);
CREATE INDEX IF NOT EXISTS idx_stich_comm ON stichera (commemoration_id, section);
`;

const DROP_DDL = `DROP TABLE IF EXISTS stichera;`;

// ─── DB helpers ───────────────────────────────────────────────────────────────

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(DDL);
  return db;
}

function getPrimaryCommemoration(db, month, day) {
  return db.prepare(`
    SELECT c.id, c.title FROM commemorations c
    JOIN troparia t ON t.commemoration_id = c.id
    WHERE c.month = ? AND c.day = ? AND t.type = 'troparion'
    ORDER BY c.id LIMIT 1
  `).get(month, day) ?? null;
}

function upsertSticheron(db, { commemoration_id, section, order, tone, label, text, source_date }) {
  db.prepare(`
    INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (commemoration_id, section, "order") DO UPDATE SET
      tone        = excluded.tone,
      label       = excluded.label,
      text        = excluded.text,
      source_date = excluded.source_date
  `).run(commemoration_id, section, order, tone ?? null, label ?? null, text, source_date ?? null);
}

// ─── Network ──────────────────────────────────────────────────────────────────

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

// ─── DOCX → XML ───────────────────────────────────────────────────────────────

async function docxToXml(url) {
  const buf = await fetchBinary(url);
  if (!buf) return null;

  const tmpDocx = path.join(os.tmpdir(), `oca-stich-${Date.now()}.docx`);
  const tmpDir  = path.join(os.tmpdir(), `oca-stich-${Date.now()}`);
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

// ─── XML paragraph extraction ─────────────────────────────────────────────────

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

// ─── Stichera parser ──────────────────────────────────────────────────────────

const VERSE_RE    = /^V\.\s*\((\d+)\)/;
const DOXOLOGY_RE = /^Glory to the Father|^Now and ever/i;

function isResurrectional(label) {
  if (!label) return true;  // no label = continuation of previous, assume resurrectional
  const clean = label.replace(/[()]/g, '').trim();
  return /resurrect|anatolius|dogmatikon|theotokion/i.test(clean)
    || /^tone\s*\d+\s*$/i.test(clean);
}

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

/**
 * Parses Lord I Call from paragraphs.
 * Returns { stichera: [{order, tone, label, text}], glory: {tone,label,text}|null }
 * Only Menaion (non-resurrectional) stichera are returned.
 */
function parseLordICall(paras) {
  const licIdx = paras.findIndex(
    p => p.centered && p.anyBold && p.text.toLowerCase().includes('lord i call')
  );
  if (licIdx === -1) return { stichera: [], glory: null };

  // Stop at the next centered+bold section header (Litya, Aposticha, etc.)
  let endIdx = paras.findIndex(
    (p, i) => i > licIdx && p.centered && p.anyBold
  );
  if (endIdx === -1) endIdx = paras.length;

  const section = paras.slice(licIdx + 1, endIdx);

  const allMenaion = [];  // will include glory at the end if Menaion
  let inVerse     = false;  // have we seen the first verse marker?
  let tone        = null;
  let label       = '';
  let inMenaion   = false;
  let hymnLines   = [];
  let atGlory     = false;

  function flush() {
    if (hymnLines.length === 0) return;
    const text = cleanText(hymnLines);
    if (text && inMenaion) allMenaion.push({ isGlory: atGlory, tone, label, text });
    hymnLines = [];
  }

  for (const p of section) {
    if (VERSE_RE.test(p.text) && p.anyRed) {
      flush();
      inVerse  = true;
      atGlory  = false;
      continue;
    }
    if (DOXOLOGY_RE.test(p.text)) {
      flush();
      atGlory = /^Glory/i.test(p.text);
      if (!atGlory) inMenaion = false;  // "Now and ever" → Dogmatikon (Octoechos)
      inVerse = true;
      continue;
    }
    // Label paragraph: bold-only run (tone number) + italic+red run (source description)
    if (p.hasItalicRed && p.runs.some(r => r.bold && !r.italic && !r.red)) {
      flush();
      const boldRun  = p.runs.find(r => r.bold && !r.italic && !r.red);
      // Capture all red (or italic+red) runs after the bold run as the label
      const boldRunIdx = p.runs.indexOf(p.runs.find(r => r.bold && !r.italic && !r.red));
      const labelStr = p.runs.slice(boldRunIdx + 1).filter(r => r.red).map(r => r.text).join('').trim();
      if (boldRun) {
        const tm = boldRun.text.match(/\d+/);
        if (tm) tone = parseInt(tm[0], 10);
      }
      label     = labelStr;
      inMenaion = !isResurrectional(label);
      continue;
    }
    // Hymn text
    if (!p.anyRed && !p.centered && inVerse && p.text) {
      hymnLines.push(p.text);
    }
  }
  flush();

  // Split into regular stichera (ordered) and the Glory doxastichon
  let order = 1;
  const stichera = [];
  let glory = null;
  for (const entry of allMenaion) {
    if (entry.isGlory) {
      glory = { tone: entry.tone, label: entry.label, text: entry.text };
    } else {
      stichera.push({ order: order++, tone: entry.tone, label: entry.label, text: entry.text });
    }
  }

  return { stichera, glory };
}

/**
 * Parses Aposticha stichera from paragraphs.
 * Returns { stichera: [{order, tone, label, text}], glory: {tone,label,text}|null }
 * Only Menaion (non-resurrectional) stichera are returned.
 *
 * Key difference from parseLordICall: the idiomelon appears BEFORE the first
 * verse marker (V. without ordinal number). We collect it immediately after the
 * label paragraph, then skip all repeats once the first V. is seen.
 */
function parseAposticha(paras) {
  const apostIdx = paras.findIndex(
    p => p.centered && p.anyBold && /aposticha/i.test(p.text)
  );
  if (apostIdx === -1) return { stichera: [], glory: null };

  // Stop at the next centered+bold section header
  let endIdx = paras.findIndex(
    (p, i) => i > apostIdx && p.centered && p.anyBold
  );
  if (endIdx === -1) endIdx = paras.length;

  const section = paras.slice(apostIdx + 1, endIdx);

  const allMenaion  = [];
  const seenKeys    = new Set();  // (tone:label) pairs already flushed — prevents collecting repeats
  let tone      = null;
  let label     = '';
  let inMenaion = false;
  let hymnLines = [];
  let atGlory   = false;
  let collected = false;  // true = skip text until next new label or Glory
  let hasLabel  = false;

  function flush() {
    if (hymnLines.length === 0) return;
    const text = cleanText(hymnLines);
    if (text && inMenaion) {
      allMenaion.push({ isGlory: atGlory, tone, label, text });
      if (!atGlory) seenKeys.add(`${tone}:${label}`);
    }
    hymnLines = [];
  }

  for (const p of section) {
    // Aposticha verse marker: "V." (no ordinal) — flush first occurrence, mark done
    if (/^V\./i.test(p.text) && p.anyRed) {
      if (!collected) flush();
      collected = true;
      atGlory   = false;
      continue;
    }

    // Doxology markers
    if (DOXOLOGY_RE.test(p.text)) {
      if (!collected) flush();
      collected = false;
      atGlory   = /^Glory/i.test(p.text);
      if (!atGlory) inMenaion = false;  // "Now and ever" → Octoechos theotokion, stop
      continue;
    }

    // Label paragraph: bold run (tone) + italic+red run (source label)
    if (p.hasItalicRed && p.runs.some(r => r.bold && !r.italic && !r.red)) {
      if (!collected) flush();
      const boldRun    = p.runs.find(r => r.bold && !r.italic && !r.red);
      const boldRunIdx = p.runs.indexOf(boldRun);
      const labelStr   = p.runs.slice(boldRunIdx + 1).filter(r => r.red).map(r => r.text).join('').trim();
      let newTone = tone;
      if (boldRun) {
        const tm = boldRun.text.match(/\d+/);
        if (tm) newTone = parseInt(tm[0], 10);
      }
      // If we've already flushed a sticheron with this tone+label, it's a repeat — skip it
      const isRepeat = !atGlory && seenKeys.has(`${newTone}:${labelStr}`);
      tone      = newTone;
      label     = labelStr;
      inMenaion = isRepeat ? false : !isResurrectional(label);
      hasLabel  = true;
      collected = isRepeat;
      continue;
    }

    // Hymn text — collect immediately after label (before first V.)
    if (!p.anyRed && !p.centered && hasLabel && !collected && p.text) {
      hymnLines.push(p.text);
    }
  }
  if (!collected) flush();

  // Deduplicate by text fingerprint (handles cases where label key matching fails
  // due to whitespace variations between first occurrence and repeats)
  const seen    = new Set();
  const unique  = [];
  for (const entry of allMenaion) {
    const fp = entry.text.slice(0, 60);
    if (!seen.has(fp)) { seen.add(fp); unique.push(entry); }
  }

  // Split into regular stichera (ordered 1…) and the Glory doxastichon (order 0)
  let order = 1;
  const stichera = [];
  let glory = null;
  for (const entry of unique) {
    if (entry.isGlory) {
      glory = { tone: entry.tone, label: entry.label, text: entry.text };
    } else {
      stichera.push({ order: order++, tone: entry.tone, label: entry.label, text: entry.text });
    }
  }

  return { stichera, glory };
}

// ─── Per-date scraper ─────────────────────────────────────────────────────────

async function scrapeDate(db, dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const mm  = String(month).padStart(2, '0');
  const dd  = String(day).padStart(2, '0');
  const url = `${BASE_URL}/${year}-${mm}${dd}-texts-tt.docx`;

  const xml = await docxToXml(url);
  if (!xml) return { stored: 0, found: false };

  const paras      = extractParagraphs(xml);
  const lic        = parseLordICall(paras);
  const apost      = parseAposticha(paras);

  const hasLic   = lic.stichera.length > 0 || lic.glory;
  const hasApost = apost.stichera.length > 0 || apost.glory;
  if (!hasLic && !hasApost) return { stored: 0, found: true };

  const primary = getPrimaryCommemoration(db, month, day);
  if (!primary) return { stored: 0, found: true };

  let stored = 0;

  // Delete existing rows for this commemoration so stale higher-order rows
  // from previous (pre-dedup) runs don't persist alongside new ones.
  if (hasLic) {
    db.prepare(`DELETE FROM stichera WHERE commemoration_id=? AND section='lordICall'`)
      .run(primary.id);
  }
  if (hasApost) {
    db.prepare(`DELETE FROM stichera WHERE commemoration_id=? AND section='aposticha'`)
      .run(primary.id);
  }

  // Lord I Call
  for (const s of lic.stichera) {
    upsertSticheron(db, { commemoration_id: primary.id, section: 'lordICall',
      order: s.order, tone: s.tone, label: s.label, text: s.text, source_date: dateStr });
    stored++;
  }
  if (lic.glory) {
    upsertSticheron(db, { commemoration_id: primary.id, section: 'lordICall',
      order: 0, tone: lic.glory.tone, label: lic.glory.label, text: lic.glory.text, source_date: dateStr });
    stored++;
  }

  // Aposticha
  for (const s of apost.stichera) {
    upsertSticheron(db, { commemoration_id: primary.id, section: 'aposticha',
      order: s.order, tone: s.tone, label: s.label, text: s.text, source_date: dateStr });
    stored++;
  }
  if (apost.glory) {
    upsertSticheron(db, { commemoration_id: primary.id, section: 'aposticha',
      order: 0, tone: apost.glory.tone, label: apost.glory.label, text: apost.glory.text, source_date: dateStr });
    stored++;
  }

  return { stored, found: true, saint: primary.title,
           licCount: lic.stichera.length + (lic.glory ? 1 : 0),
           apostCount: apost.stichera.length + (apost.glory ? 1 : 0) };
}

// ─── Date range helpers ───────────────────────────────────────────────────────

function datesInYear(year) {
  const dates = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${year}-${mm}-${dd}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const db   = openDb();

  if (args.includes('--reset')) {
    db.exec(DROP_DDL);
    db.exec(DDL);
    console.log('Stichera table reset.\n');
  }

  let dates = [];
  if (args.includes('--date')) {
    dates = [args[args.indexOf('--date') + 1]];
  } else if (args.includes('--year')) {
    dates = datesInYear(parseInt(args[args.indexOf('--year') + 1], 10));
  } else {
    dates = [...datesInYear(2025), ...datesInYear(2026)];
  }

  console.log(`Checking ${dates.length} date(s) for published service texts…\n`);

  let totalStored = 0;
  let totalFeast  = 0;
  let totalMissed = 0;

  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];
    process.stdout.write(`  ${dateStr} … `);

    try {
      const { stored, found, saint, licCount = 0, apostCount = 0 } = await scrapeDate(db, dateStr);
      if (!found) {
        process.stdout.write('—\n');
        totalMissed++;
      } else if (stored > 0) {
        totalFeast++;
        totalStored += stored;
        const saintShort = saint ? saint.slice(0, 45) : '';
        const parts = [];
        if (licCount > 0)   parts.push(`${licCount} LIC`);
        if (apostCount > 0) parts.push(`${apostCount} apost`);
        console.log(`✓  ${parts.join(' + ')} — ${saintShort}`);
      } else {
        console.log('~ (file exists, no Menaion stichera found)');
      }
    } catch (err) {
      console.log(`✗  ${err.message}`);
    }

    if (i < dates.length - 1) await sleep(RATE_MS);
  }

  console.log(`\nDone. ${totalStored} stichera from ${totalFeast} feast day(s). ${totalMissed} dates had no published file.`);
  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
