/**
 * OCA Database Import
 *
 * Reads all parsed JSON files from storage/parsed/ and loads them into
 * a SQLite database at storage/oca.db using the built-in node:sqlite module.
 *
 * Usage:
 *   node import.js           — import new/updated files (idempotent)
 *   node import.js --reset   — drop and recreate all tables first
 *   node import.js --stats   — show row counts only (no import)
 *
 * Schema:
 *   source_files  — one row per parsed JSON file
 *   blocks        — one row per content block (hymn, verse, rubric, etc.)
 */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const PARSED_DIR = path.join(__dirname, 'storage', 'parsed');
const DB_PATH    = path.join(__dirname, 'storage', 'oca.db');

// ─── Schema ───────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS source_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT    NOT NULL UNIQUE,
  date        TEXT,
  pronoun     TEXT,
  file_type   TEXT,
  parsed_at   TEXT
);

CREATE TABLE IF NOT EXISTS blocks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file_id INTEGER NOT NULL REFERENCES source_files(id),
  date           TEXT,
  pronoun        TEXT,
  service        TEXT    NOT NULL,
  section        TEXT    NOT NULL,
  block_order    INTEGER NOT NULL,
  type           TEXT    NOT NULL,
  tone           INTEGER,
  label          TEXT,
  verse_number   INTEGER,
  verse_text     TEXT,
  position       TEXT,
  attribution    TEXT,
  text           TEXT,
  UNIQUE (source_file_id, service, section, block_order)
);

CREATE INDEX IF NOT EXISTS idx_blocks_date    ON blocks (date);
CREATE INDEX IF NOT EXISTS idx_blocks_svc_sec ON blocks (service, section);
CREATE INDEX IF NOT EXISTS idx_blocks_tone    ON blocks (tone, service, section);
CREATE INDEX IF NOT EXISTS idx_blocks_type    ON blocks (type);
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  return new DatabaseSync(DB_PATH);
}

function resetDb(db) {
  db.exec(`
    DROP TABLE IF EXISTS blocks;
    DROP TABLE IF EXISTS source_files;
  `);
  console.log('Tables dropped.');
}

function createSchema(db) {
  db.exec(DDL);
}

// ─── Import ───────────────────────────────────────────────────────────────────

function importFile(db, jsonPath, stmts) {
  const filename = path.basename(jsonPath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    console.warn(`  SKIP ${filename}: JSON parse error — ${err.message}`);
    return { inserted: 0, skipped: 0 };
  }

  const meta = parsed._meta || {};
  const date     = meta.date     || null;
  const pronoun  = meta.pronoun  || null;
  const fileType = meta.type     || null;
  const parsedAt = meta.parsedAt || null;

  // Upsert source_files row
  stmts.upsertFile.run(filename, date, pronoun, fileType, parsedAt);
  const fileId = db.prepare('SELECT id FROM source_files WHERE filename = ?').get(filename).id;

  const services = parsed.services || {};
  let inserted = 0;
  let skipped  = 0;

  for (const [service, svcObj] of Object.entries(services)) {
    const sections = svcObj.sections || {};
    for (const [section, secObj] of Object.entries(sections)) {
      const blocks = secObj.blocks || [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        try {
          stmts.insertBlock.run(
            fileId,
            date,
            pronoun,
            service,
            section,
            i,
            b.type           || 'other',
            b.tone           ?? null,
            b.label          || null,
            b.number         ?? null,   // verse_number
            null,                       // verse_text (reserved for future use)
            b.position       || null,
            b.attribution    || null,
            b.text           || null,
          );
          inserted++;
        } catch (err) {
          if (err.message && err.message.includes('UNIQUE constraint')) {
            skipped++;
          } else {
            throw err;
          }
        }
      }
    }
  }

  return { inserted, skipped };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function printStats(db) {
  const fileCount  = db.prepare('SELECT COUNT(*) AS n FROM source_files').get().n;
  const blockCount = db.prepare('SELECT COUNT(*) AS n FROM blocks').get().n;

  console.log(`\nDatabase: ${path.relative(__dirname, DB_PATH)}`);
  console.log(`  source_files : ${fileCount}`);
  console.log(`  blocks       : ${blockCount}\n`);

  console.log('Blocks by service/section:');
  const rows = db.prepare(`
    SELECT service, section, COUNT(*) AS n
    FROM blocks
    GROUP BY service, section
    ORDER BY service, section
  `).all();
  for (const r of rows) {
    console.log(`  ${r.service.padEnd(10)} ${r.section.padEnd(20)} ${r.n}`);
  }

  console.log('\nBlocks by type:');
  const typeRows = db.prepare(`
    SELECT type, COUNT(*) AS n FROM blocks GROUP BY type ORDER BY n DESC
  `).all();
  for (const r of typeRows) {
    console.log(`  ${r.type.padEnd(18)} ${r.n}`);
  }

  console.log('\nHymns by tone:');
  const toneRows = db.prepare(`
    SELECT tone, COUNT(*) AS n FROM blocks WHERE type = 'hymn' AND tone IS NOT NULL
    GROUP BY tone ORDER BY tone
  `).all();
  for (const r of toneRows) {
    console.log(`  Tone ${r.tone}: ${r.n} hymn(s)`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args   = new Set(process.argv.slice(2));
  const reset  = args.has('--reset');
  const stats  = args.has('--stats');

  const db = openDb();

  // Enable WAL for speed; foreign key enforcement
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  if (reset) resetDb(db);
  createSchema(db);

  if (stats) {
    printStats(db);
    db.close();
    return;
  }

  if (!fs.existsSync(PARSED_DIR)) {
    console.error(`Parsed directory not found: ${PARSED_DIR}`);
    console.error('Run parser.js first.');
    process.exit(1);
  }

  const files = fs.readdirSync(PARSED_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log('No parsed files found. Run parser.js first.');
    db.close();
    return;
  }

  console.log(`Importing ${files.length} file(s) into ${path.relative(__dirname, DB_PATH)}…\n`);

  // Prepare statements once, reuse across files
  const stmts = {
    upsertFile: db.prepare(`
      INSERT INTO source_files (filename, date, pronoun, file_type, parsed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(filename) DO UPDATE SET
        date      = excluded.date,
        pronoun   = excluded.pronoun,
        file_type = excluded.file_type,
        parsed_at = excluded.parsed_at
    `),
    insertBlock: db.prepare(`
      INSERT OR IGNORE INTO blocks
        (source_file_id, date, pronoun, service, section, block_order,
         type, tone, label, verse_number, verse_text, position, attribution, text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
  };

  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalFiles    = 0;

  // Wrap all imports in a single transaction for speed
  const importAll = db.prepare('BEGIN');
  const commitAll = db.prepare('COMMIT');
  importAll.run();

  for (const filename of files) {
    const jsonPath = path.join(PARSED_DIR, filename);
    process.stdout.write(`  ${filename} … `);
    const { inserted, skipped } = importFile(db, jsonPath, stmts);
    console.log(`${inserted} inserted, ${skipped} skipped`);
    totalInserted += inserted;
    totalSkipped  += skipped;
    totalFiles++;
  }

  commitAll.run();

  console.log(`\nDone.`);
  console.log(`  Files processed : ${totalFiles}`);
  console.log(`  Blocks inserted : ${totalInserted}`);
  console.log(`  Blocks skipped  : ${totalSkipped} (already present)`);

  console.log('');
  printStats(db);

  db.close();
}

main();
