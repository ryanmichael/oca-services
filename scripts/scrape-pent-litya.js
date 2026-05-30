#!/usr/bin/env node
/**
 * scrape-pent-litya.js
 *
 * One-off scraper to fill the missing Litya stichera for Pentecost and
 * Ascension. The OCA published service text (e.g. 2025-0608-texts-tt.docx)
 * abbreviates the Litya to one sticheron + one theotokion. Slavonic-recension
 * practice has 3 stichera at Pentecost (Tone II) and 6 at Ascension (5 in
 * Tone I + 1 in Tone IV). Pulls Sergius's English Pentecostarion as the
 * source of the missing texts.
 *
 * Sources:
 *   Pentecost:  https://st-sergius.org/services/pent/80.pdf  (Litiya, Tone II)
 *   Ascension:  https://st-sergius.org/services/pent/64.pdf  (Litiya, Tones I and IV)
 *
 * Idempotent: uses INSERT OR REPLACE keyed on (commemoration_id|liturgical_key,
 * section, order) — re-running just re-writes the same blocks.
 *
 * Usage:
 *   node scripts/scrape-pent-litya.js
 */

'use strict';

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'storage', 'oca.db');

// ── Thee/Thou → You/Your converter (subset of server.js YOU_YOUR_RULES)
const YOU_YOUR_RULES = [
  [/\bThine(?=\s+is\b)/g, 'Yours'], [/\bthine(?=\s+is\b)/g, 'yours'],
  [/\bThou\b/g,  'You'],     [/\bthou\b/g,  'you'],
  [/\bThee\b/g,  'You'],     [/\bthee\b/g,  'you'],
  [/\bThy\b/g,   'Your'],    [/\bthy\b/g,   'your'],
  [/\bThine\b/g, 'Your'],    [/\bthine\b/g, 'your'],
  [/\bThyself\b/g, 'Yourself'], [/\bthyself\b/g, 'yourself'],
  [/\bArt\b/g,   'Are'],     [/\bart\b/g,   'are'],
  [/\bHast\b/g,  'Have'],    [/\bhast\b/g,  'have'],
  [/\bHath\b/g,  'Has'],     [/\bhath\b/g,  'has'],
  [/\bDost\b/g,  'Do'],      [/\bdost\b/g,  'do'],
  [/\bDoth\b/g,  'Does'],    [/\bdoth\b/g,  'does'],
  [/\bDidst\b/g, 'Did'],     [/\bdidst\b/g, 'did'],
  [/\bWast\b/g,  'Were'],    [/\bwast\b/g,  'were'],
  [/\bWilt\b/g,  'Will'],    [/\bwilt\b/g,  'will'],
];
function ttToYy(text) {
  for (const [re, rep] of YOU_YOUR_RULES) text = text.replace(re, rep);
  return text;
}

// ── Litya stichera (Sergius English Pentecostarion translations, Thee/Thou)
// Pentecost: 3 stichera in Tone II + Glory/Both now in Tone VIII. The first
// sticheron and the Glory/Both now theotokion are already in the DB from the
// OCA scrape (orders 0 and 3) — we add the missing 2nd and 3rd stichera at
// orders 4 and 5, preserving the existing entries.
const PENT_LITYA_EXTRA = [
  {
    order: 4,
    tone: 2,
    text: 'In Thy courts shall I praise Thee,\nthe Savior of the world,\nand bending my knee I shall worship Thine invincible might.\nIn the evening, in the morn, at midday,//\nand at all times shall I bless Thee, O Lord.',
    label: 'Sticheron (Sergius Pentecostarion)',
  },
  {
    order: 5,
    tone: 2,
    text: 'In Thy courts, O Lord, as we the faithful\nbend the knee of the soul and the body,\nwe praise Thee, the beginningless Father,\nthe co-beginningless Son,\nand the co-eternal and Most holy Spirit,//\nWho dost enlighten and sanctify our souls.',
    label: 'Sticheron (Sergius Pentecostarion)',
  },
];

// Ascension: OCA scrape has 2 stichera (Sergius #1 in Tone I at order 0 and
// Sergius #4 in Tone IV at order 1) but missed the Glory/Both-now theotokion
// at position=now. Sergius has 6 stichera total + Glory/Both-now in Tone IV.
// We append the four missing stichera (#2, #3, #5, #6) plus the doxastichon.
// (Note: Sergius's #4 is already in the DB as OCA order=1, so we skip it here
// to avoid a duplicate.)
const ASC_LITYA_EXTRA = [
  {
    order: 4,
    tone: 1,
    text: 'Though Thou wast not parted from His uncircumscribable bosom,\nThou didst ascend unto Thy beginningless Father, O Christ,\nand the hosts on high accepted no addition to the thrice-holy praise.\nBut even after Thou didst become man\nthey recognized Thee as the one Son, only-begotten of the Father, O Lord.//\nIn the multitude of Thy compassions, have mercy on us.',
    label: 'Sticheron (Sergius Pentecostarion)',
  },
  {
    order: 5,
    tone: 1,
    text: 'Thine angels said unto the apostles, O Lord:\nYe men of Galilee, why stand ye looking up into heaven?\nThis is Christ God, Who hath been taken up from you into heaven.\nHe shall come again in the manner ye have seen Him going into heaven.//\nWorship Him in holiness and righteousness.',
    label: 'Sticheron (Sergius Pentecostarion)',
  },
  {
    order: 6,
    tone: 1,
    text: 'Thou hast renewed in Thyself Adam’s nature, which had gone down into the lower parts of the earth,\nand Thou didst raise it up above every principality and authority today.\nFor since Thou didst love it, Thou didst seat it together with Thyself;\nsince Thou hast taken compassion on it, Thou didst unite it to Thyself;\nsince Thou didst unite it to Thyself, Thou didst suffer with it;\nand enduring the Passion, though Thou art impassable, Thou didst glorify it.\nBut the Bodiless ones said: Who is this comely man?\nBut not only is He man, but God and man; that which is manifest is twofold.\nWherefore, beside themselves, the angels, flying about clad in radiant vesture,\ncried unto the disciples: Ye men of Galilee, He that is gone from you, Jesus, Man and God,\nshall come again as the God-man to judge the living and the dead;//\nand He granteth unto the faithful the forgiveness of sins and great mercy.',
    label: 'Sticheron (Sergius Pentecostarion)',
  },
  {
    order: 7,
    tone: 1,
    text: 'When Thou didst ascend in glory, O Christ God, while the disciples were watching,\nthe clouds took Thee up with Thy flesh;\nthe heavenly gates were lifted up;\nthe choir of the angels rejoiced with rejoicing;\nthe powers above cried aloud, saying:\nLift up thy gates, O ye princes, and the King of Glory shall enter therein.\nAnd the disciples were astonished and said://\nBe Thou not parted from us, O Good Shepherd, but send unto us Thy most holy Spirit to guide and establish our souls.',
    label: 'Sticheron (Sergius Pentecostarion)',
  },
  // Glory/Both-now combined doxastichon, in Tone IV — placed at position='now'
  // so it surfaces as the Litya theotokion via lityaSpec.now in the assembler.
  {
    order: 8,
    tone: 4,
    position: 'now',
    text: 'O Lord, having fulfilled the mystery that was hidden from before the ages and from all generations,\nas Thou art good Thou didst come with Thy disciples to the Mount of Olives,\nhaving together with Thyself her that gave birth unto Thee, the Creator and Fashioner of all things;\nfor it was meet that she who, as Thy Mother, suffered at Thy Passion more than all,\nshould also enjoy the surpassing joy of the glorification of Thy flesh, O Master,//\nwhich we have attained by Thine Ascension to the heavens, and we glorify Thy great mercy toward us.',
    label: 'Glory/Both now doxastichon (Sergius Pentecostarion)',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function ensureSourceFile(db, filename, pronoun) {
  const existing = db.prepare('SELECT id FROM source_files WHERE filename = ?').get(filename);
  if (existing) return existing.id;
  const info = db.prepare(`
    INSERT INTO source_files (filename, pronoun, file_type, parsed_at)
    VALUES (?, ?, 'stSergius-pentecostarion-pdf', datetime('now'))
  `).run(filename, pronoun);
  return info.lastInsertRowid;
}

function insertBlock(db, sourceFileId, litKey, pronoun, order, type, tone, label, text, position) {
  // Delete any existing block at this (litKey, pronoun, section, order) slot first
  // so re-runs don't accumulate duplicates.
  db.prepare(`
    DELETE FROM blocks
    WHERE liturgical_key = ? AND pronoun = ? AND service = 'vespers' AND section = 'litya' AND block_order = ?
  `).run(litKey, pronoun, order);
  db.prepare(`
    INSERT INTO blocks (source_file_id, pronoun, liturgical_key, service, section, block_order, type, tone, label, text, position)
    VALUES (?, ?, ?, 'vespers', 'litya', ?, ?, ?, ?, ?, ?)
  `).run(sourceFileId, pronoun, litKey, order, type, tone, label, text, position);
}

function importFeast(db, litKey, sergiusFile, extras) {
  const ttFile = `stSergius-${sergiusFile}-tt`;
  const yyFile = `stSergius-${sergiusFile}-yy`;
  const ttSrc = ensureSourceFile(db, ttFile, 'tt');
  const yySrc = ensureSourceFile(db, yyFile, 'yy');
  for (const e of extras) {
    insertBlock(db, ttSrc, litKey, 'tt', e.order, 'hymn', e.tone, e.label, e.text,         e.position || null);
    insertBlock(db, yySrc, litKey, 'yy', e.order, 'hymn', e.tone, e.label, ttToYy(e.text), e.position || null);
  }
  console.log(`  ${litKey}: ${extras.length} stichera written (tt + yy)`);
}

// ── Main ───────────────────────────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);
try {
  console.log('Filling missing Pentecost / Ascension Litya stichera…');
  db.exec('BEGIN');
  importFeast(db, 'pentecostarion.pentecost', 'pent-80.pdf', PENT_LITYA_EXTRA);
  importFeast(db, 'pentecostarion.ascension', 'pent-64.pdf', ASC_LITYA_EXTRA);
  db.exec('COMMIT');
  console.log('Done.');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Failed:', err.message);
  process.exit(1);
} finally {
  db.close();
}
