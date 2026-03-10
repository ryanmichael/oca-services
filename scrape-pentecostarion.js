/**
 * scrape-pentecostarion.js
 *
 * Downloads L'vov-Bakhmetev TT PDFs from oca.org/PDF/Music/Pentecostarion/
 * and inserts blocks into storage/oca.db for Pentecostarion services.
 *
 * Prerequisites:  pdftotext (brew install poppler)
 *
 * Usage:
 *   node scrape-pentecostarion.js          — scrape all feasts (idempotent)
 *   node scrape-pentecostarion.js --reset  — delete existing Pentecostarion blocks first
 *   node scrape-pentecostarion.js --feast paralytic  — scrape a single feast
 */

'use strict';

const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const BASE     = 'https://www.oca.org';
const PDF_BASE = '/PDF/Music/Pentecostarion/';
const DB_PATH  = path.join(__dirname, 'storage', 'oca.db');
const PRONOUN  = 'tt';
const SERVICE  = 'vespers';
const RATE_MS  = 1200;

// ─── Feast definitions ────────────────────────────────────────────────────────
//
// Each PDF entry:
//   file    — filename under PDF_BASE
//   parse   — 'stichera' | 'single'
//   section — DB section name: 'lordICall' | 'aposticha' | 'troparia' | 'kontakia'
//   role    — 'hymns' | 'glory' | 'troparion' | 'kontakion'
//   label   — display label for hymn blocks

const FEASTS = [
  {
    slug:  'thomas',
    key:   'pentecostarion.week.2.sunday',
    label: 'Thomas Sunday',
    pdfs:  [
      { file: 'thom.sun.tropar.obikhod-tt.pdf',  parse: 'single',   section: 'troparia', role: 'troparion', label: 'Thomas Sunday' },
      { file: 'thom.sun.kondak.obikhod-tt.pdf',   parse: 'single',   section: 'kontakia', role: 'kontakion', label: 'Thomas Sunday' },
    ],
  },
  {
    slug:  'myrrhbearers',
    key:   'pentecostarion.week.3.sunday',
    label: 'Sunday of the Myrrhbearers',
    pdfs:  [
      { file: 'myrrhbearers.troparia.obikhod-tt.pdf', parse: 'single',   section: 'troparia', role: 'troparion', label: 'Sunday of the Myrrhbearers' },
      { file: 'myrrhbearers.kondak.obikhod-tt.pdf',   parse: 'single',   section: 'kontakia', role: 'kontakion', label: 'Sunday of the Myrrhbearers' },
    ],
  },
  {
    slug:  'paralytic',
    key:   'pentecostarion.week.4.sunday',
    label: 'Sunday of the Paralytic',
    pdfs:  [
      { file: '4.1-1-Paralytic-LIC-stichera-CC-tt.pdf',        parse: 'stichera', section: 'lordICall', role: 'hymns',     label: 'for the Paralytic' },
      { file: '4.1-2-Paralytic-LIC-doxastichon-CC-tt.pdf',     parse: 'single',   section: 'lordICall', role: 'glory',     label: 'for the Paralytic' },
      { file: '4.1-3-Paralytic-Aposticha-doxastichon-CC-tt.pdf', parse: 'single', section: 'aposticha', role: 'glory',     label: 'for the Paralytic' },
      { file: 'paralytic.kondak.obikhod-tt.pdf',               parse: 'single',   section: 'kontakia',  role: 'kontakion', label: 'Sunday of the Paralytic' },
    ],
  },
  {
    slug:  'samaritanwoman',
    key:   'pentecostarion.week.5.sunday',
    label: 'Sunday of the Samaritan Woman',
    pdfs:  [
      { file: 'Pn5-SamaritanWoman-Stichera-LIC-CC-tt.pdf',           parse: 'stichera', section: 'lordICall', role: 'hymns',     label: 'for the Samaritan Woman' },
      { file: 'Pn5-SamaritanWoman-Doxastichon-Aposticha-CC-tt.pdf',  parse: 'single',   section: 'aposticha', role: 'glory',     label: 'for the Samaritan Woman' },
      { file: 'samaritan.kondak.obikhod-tt.pdf',                     parse: 'single',   section: 'kontakia',  role: 'kontakion', label: 'Sunday of the Samaritan Woman' },
    ],
  },
  {
    slug:  'blindman',
    key:   'pentecostarion.week.6.sunday',
    label: 'Sunday of the Blind Man',
    pdfs:  [
      { file: 'Pn6-BlindMan-Stichera-LIC-CC-tt.pdf',             parse: 'stichera', section: 'lordICall', role: 'hymns',     label: 'for the Blind Man' },
      { file: 'Pn6-BlindMan-Doxastichon-LIC-CC-tt.pdf',          parse: 'single',   section: 'lordICall', role: 'glory',     label: 'for the Blind Man' },
      { file: 'Pn6-BlindMan-Doxastichon-Aposticha-CC-tt.pdf',    parse: 'single',   section: 'aposticha', role: 'glory',     label: 'for the Blind Man' },
      { file: 'manbornblind.kondak.obikhod-tt.pdf',              parse: 'single',   section: 'kontakia',  role: 'kontakion', label: 'Sunday of the Blind Man' },
    ],
  },
  {
    slug:  'holyfathers',
    key:   'pentecostarion.week.7.sunday',
    label: 'Sunday of the Holy Fathers',
    pdfs:  [
      { file: 'Pn7-HolyFathers-Stichera-LIC-CC-tt.pdf',          parse: 'stichera', section: 'lordICall', role: 'hymns',     label: 'for the Holy Fathers' },
      { file: 'Pn7-HolyFathers-Doxastichon-Aposticha-CC-tt.pdf', parse: 'single',   section: 'aposticha', role: 'glory',     label: 'for the Holy Fathers' },
      { file: 'fathers.tropar.obikhod-tt.pdf',                   parse: 'single',   section: 'troparia',  role: 'troparion', label: 'Sunday of the Holy Fathers' },
    ],
  },
  {
    slug:  'ascension',
    key:   'pentecostarion.ascension',
    label: 'The Ascension of our Lord',
    pdfs:  [
      { file: 'ascension.tropar.obikhod-tt.pdf',  parse: 'single', section: 'troparia', role: 'troparion', label: 'The Ascension of our Lord' },
      { file: 'ascension.kondak.obikhod-tt.pdf',  parse: 'single', section: 'kontakia', role: 'kontakion', label: 'The Ascension of our Lord' },
    ],
  },
  {
    slug:  'pentecost',
    key:   'pentecostarion.pentecost',
    label: 'Holy Pentecost',
    pdfs:  [
      { file: 'pentecost.tropar.obikhod-tt.pdf',  parse: 'single', section: 'troparia', role: 'troparion', label: 'Holy Pentecost' },
      { file: 'pentecost.kondak.obikhod-tt.pdf',  parse: 'single', section: 'kontakia', role: 'kontakion', label: 'Holy Pentecost' },
    ],
  },
];

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pdfToText(filename) {
  const url = BASE + PDF_BASE + filename;
  const buf = await fetchBinary(url);
  const tmp = path.join(os.tmpdir(), `oca-pent-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, buf);
  try {
    return execSync(`pdftotext -layout "${tmp}" -`, { encoding: 'utf8' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

// ─── Text cleaning (shared with scrape-octoechos.js) ─────────────────────────

const MUSIC_CHARS = /[œ˙ϖ∀αβ%>∃∂−]/;

function cleanLines(raw) {
  const preprocessed = raw
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[ \t]{2,}(Soprano|Alto|Tenor|Bass)[ \t]+/g, ' ');

  return preprocessed
    .split('\n')
    .map(l => l.trim())
    .map(l => l.replace(/^(Soprano|Alto|Tenor|Bass)\s{2,}/, ''))
    .map(l => l.replace(/^[#`]\s*/, ''))
    .filter(l => l.length > 0)
    .filter(l => !MUSIC_CHARS.test(l))
    .filter(l => !/^(Soprano|Alto|Tenor|Bass)\s*$/.test(l))
    .filter(l => !/©/.test(l))
    .filter(l => !/- p\.\s*\d+$/.test(l))
    .filter(l => !/^arr\. from/.test(l))
    .filter(l => !/^(L'vov|Bakhmetev|Obikhod|Kievan|Serbian|Russian|Imperial)\s/.test(l))
    .filter(l => !/^(Octoechos|Common Chant)(\s|$)/.test(l))
    .filter(l => !/^w{1,3}$/.test(l))
    .filter(l => l !== '−' && l !== '-');
}

function joinFragments(fragments) {
  let text = fragments.map(l => l.trim()).filter(Boolean).join(' ');
  text = text.replace(/(\w)\s+-\s*(\w)/g, '$1$2');
  text = text.replace(/(\w)\s*-\s+(\w)/g, '$1$2');
  text = text.replace(/([a-z])-([a-z]{1,2})(?=[^a-z]|$)/g, '$1$2');
  text = text.replace(/([a-z])-([a-z])/g, '$1$2');
  text = text.replace(/\s*\/\/\s*/g, '\n');
  text = text.replace(/ \? /g, ' ');
  text = text.replace(/\? /g, '');
  text = text.replace(/\s+w{1,3}(?=\s)/g, '');
  text = text.replace(/\s+w{1,3}$/gm, '');
  text = text.replace(/\s*\[[^\]]{0,60}\]\s*/g, ' ');
  text = text.replace(/_/g, '');
  text = text.replace(/(\w)\s+b\s+([a-z])/g, '$1 $2');
  text = text.replace(/  +/g, ' ');
  text = text.replace(/"\s*$/, '');
  return text.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

// ─── Tone extraction ──────────────────────────────────────────────────────────

/**
 * Tries to extract the tone number from the first few lines of cleaned text.
 * Returns null if not found.
 */
function extractTone(lines) {
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const m = lines[i].match(/^Tone\s+(\d)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Parses a stichera PDF (numbered "Sticheron N" blocks).
 * Also extracts a Glory doxastichon if present after the numbered stichera.
 * Returns { tone, hymns: string[], glory: string|null }
 */
function parseStichera(raw) {
  const lines = cleanLines(raw);
  const tone  = extractTone(lines);

  const hymns   = [];
  let current   = [];
  let inHymn    = false;
  let glory     = null;
  let inGlory   = false;

  for (const line of lines) {
    if (/^Sticheron\s+\d+/i.test(line)) {
      if (inHymn && current.length > 0) hymns.push(joinFragments(current));
      if (inGlory && current.length > 0) glory = joinFragments(current);
      current  = [];
      inHymn   = true;
      inGlory  = false;
    } else if (/^Glory\b/i.test(line)) {
      if (inHymn && current.length > 0) hymns.push(joinFragments(current));
      current = [];
      inHymn  = false;
      inGlory = true;
    } else if (/^Now and ever\b/i.test(line)) {
      if (inGlory && current.length > 0) { glory = joinFragments(current); current = []; inGlory = false; }
    } else if (inHymn || inGlory) {
      if (/^Tone\s+\d/.test(line) || /^arr\./.test(line)) continue;
      current.push(line);
    }
  }
  if (inHymn  && current.length > 0) hymns.push(joinFragments(current));
  if (inGlory && current.length > 0) glory = joinFragments(current);

  return { tone, hymns, glory };
}

/**
 * Parses a single-hymn PDF (troparion, kontakion, doxastichon).
 * Returns { tone, text: string }
 */
function parseSingle(raw) {
  const lines = cleanLines(raw);
  const tone  = extractTone(lines);

  const HEADERS = /^(Tone\s+\d|Resurrectional|Theotokion|Troparion|Kontakion|Dogmatikon|Dismissal|Doxastichon|Obikhod|Kievan|Common\s+Chant|Sticheron\s+\d|Paralytic|Samaritan|Blind\s+Man|Holy\s+Fathers|Thomas|Myrrhbearers|Ascension|Pentecost|Mid-?feast|All\s+Saints)/i;
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    if (HEADERS.test(lines[i])) start = i + 1;
  }

  const RUBRIC = /^(Then\b|If there is|The tone of|Gloria[^r]|Glory\b)/i;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (RUBRIC.test(lines[i])) { end = i; break; }
  }

  return { tone, text: joinFragments(lines.slice(start, end)) };
}

// ─── Database ─────────────────────────────────────────────────────────────────

function openDb() {
  return new DatabaseSync(DB_PATH);
}

function getOrCreateSourceFile(db, slug) {
  const filename = `pentecostarion-tt-${slug}`;
  const existing = db.prepare('SELECT id FROM source_files WHERE filename = ?').get(filename);
  if (existing) return existing.id;
  const result = db.prepare(`
    INSERT INTO source_files (filename, pronoun, file_type, parsed_at)
    VALUES (?, 'tt', 'pentecostarion-pdf', datetime('now'))
  `).run(filename);
  return result.lastInsertRowid;
}

function deleteExistingBlocks(db, sourceFileId) {
  db.prepare('DELETE FROM blocks WHERE source_file_id = ?').run(sourceFileId);
}

/**
 * Inserts blocks for one feast into the DB.
 *
 * blocks is an array of:
 *   { section, block_order, type, tone, label, position, text }
 */
function insertBlocks(db, sourceFileId, litKey, blocks) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO blocks
      (source_file_id, pronoun, liturgical_key, service,
       section, block_order, type, tone, label, position, text)
    VALUES (?, 'tt', ?, 'vespers', ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const b of blocks) {
    stmt.run(
      sourceFileId,
      litKey,
      b.section,
      b.block_order,
      b.type,
      b.tone ?? null,
      b.label ?? null,
      b.position ?? null,
      b.text ?? null,
    );
  }
}

// ─── Block builders ───────────────────────────────────────────────────────────

/**
 * Builds the block array for a feast from parsed PDF data.
 *
 * Accumulates block_order per section independently:
 *   lordICall: dummy verse at 0, hymns at 1+, glory at end
 *   aposticha: glory block
 *   troparia: troparion at 0
 *   kontakia:  kontakion at 0
 */
function buildBlocks(sectionOrders, parsed, pdfSpec) {
  const blocks = [];
  const { section, role } = pdfSpec;

  const nextOrder = () => {
    sectionOrders[section] = (sectionOrders[section] ?? -1) + 1;
    return sectionOrders[section];
  };

  if (role === 'hymns') {
    // Insert a dummy verse at block_order 0 so transformSectionBlocks
    // sets seenVerse=true and includes the subsequent hymns.
    // Only insert if this is the first item for this section.
    if ((sectionOrders[section] ?? -1) < 0) {
      sectionOrders[section] = 0;
      blocks.push({
        section,
        block_order: 0,
        type:        'verse',
        tone:        null,
        label:       null,
        position:    null,
        text:        null,
      });
    }
    for (const [i, text] of parsed.hymns.entries()) {
      blocks.push({
        section,
        block_order: nextOrder(),
        type:        'hymn',
        tone:        parsed.tone,
        label:       pdfSpec.label,
        position:    null,
        text,
      });
    }
    if (parsed.glory) {
      blocks.push({
        section,
        block_order: nextOrder(),
        type:        'hymn',
        tone:        parsed.tone,
        label:       pdfSpec.label,
        position:    'glory',
        text:        parsed.glory,
      });
    }

  } else if (role === 'glory') {
    blocks.push({
      section,
      block_order: nextOrder(),
      type:        'hymn',
      tone:        parsed.tone,
      label:       pdfSpec.label,
      position:    'glory',
      text:        parsed.text,
    });

  } else {
    // 'troparion' | 'kontakion' — single hymn
    blocks.push({
      section,
      block_order: nextOrder(),
      type:        'hymn',
      tone:        parsed.tone,
      label:       pdfSpec.label,
      position:    null,
      text:        parsed.text,
    });
  }

  return blocks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args  = process.argv.slice(2);
  const reset = args.includes('--reset');

  const feastArg = args.find(a => !a.startsWith('--'));
  let feasts = FEASTS;
  if (feastArg) {
    feasts = FEASTS.filter(f => f.slug === feastArg || f.key.includes(feastArg));
    if (feasts.length === 0) {
      console.error(`Unknown feast slug: ${feastArg}`);
      console.error(`Available: ${FEASTS.map(f => f.slug).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`Scraping Pentecostarion (L'vov-Bakhmetev TT): ${feasts.map(f => f.slug).join(', ')}\n`);

  const db = openDb();

  for (const feast of feasts) {
    console.log(`\n${feast.label}  [${feast.key}]`);

    const sourceFileId  = getOrCreateSourceFile(db, feast.slug);
    deleteExistingBlocks(db, sourceFileId);

    const sectionOrders = {};
    const allBlocks     = [];

    for (const pdf of feast.pdfs) {
      process.stdout.write(`  ${pdf.file} … `);
      try {
        const raw = await pdfToText(pdf.file);
        let parsed;
        if (pdf.parse === 'stichera') {
          parsed = parseStichera(raw);
          const gloryInfo = parsed.glory ? ' [+glory]' : '';
          console.log(`✓  ${parsed.hymns.length} stichera, tone=${parsed.tone}${gloryInfo}`);
        } else {
          parsed = parseSingle(raw);
          const preview = parsed.text.slice(0, 50).replace(/\n/g, ' ') + '…';
          console.log(`✓  tone=${parsed.tone}  "${preview}"`);
        }
        const blocks = buildBlocks(sectionOrders, parsed, pdf);
        allBlocks.push(...blocks);
      } catch (err) {
        console.log(`✗  ${err.message}`);
      }
      await sleep(RATE_MS);
    }

    insertBlocks(db, sourceFileId, feast.key, allBlocks);
    console.log(`  → ${allBlocks.length} blocks inserted for ${feast.key}`);
  }

  db.close();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
