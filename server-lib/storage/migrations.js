'use strict';

const fs   = require('fs');
const path = require('path');
const { openDbWrite } = require('../cache/sqlite');

const ROOT       = path.resolve(__dirname, '..', '..');
const MIGRATIONS = path.join(ROOT, 'storage', 'migrations');

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS)) return [];
  return fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
}

function appliedSet(db) {
  const rows = db.prepare('SELECT filename FROM _schema_migrations').all();
  return new Set(rows.map(r => r.filename));
}

// Brownfield bootstrap: the project shipped 3 SQL files in storage/migrations/
// that were applied by hand before the runner existed. On first creation of
// _schema_migrations, we mark every existing file as already-applied without
// running it, so the runner doesn't try to replay them.
function bootstrapHistorical(db) {
  const files = listMigrationFiles();
  const stmt = db.prepare(
    'INSERT INTO _schema_migrations (filename, applied_at) VALUES (?, ?)'
  );
  const now = Date.now();
  for (const f of files) stmt.run(f, now);
  return files.length;
}

function applyOne(db, file) {
  const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
  // Each .sql file is responsible for its own BEGIN/COMMIT if it wants atomicity.
  // We do not wrap here because some files (e.g. CREATE INDEX) cannot run in
  // an implicit txn alongside other DDL in the same exec().
  db.exec(sql);
  db.prepare(
    'INSERT INTO _schema_migrations (filename, applied_at) VALUES (?, ?)'
  ).run(file, Date.now());
}

function runMigrations({ verbose = false } = {}) {
  const db = openDbWrite();
  if (!db) {
    if (verbose) console.warn('[migrate] storage/oca.db not found; skipping');
    return { applied: [], bootstrapped: 0 };
  }
  try {
    const tableExisted = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_schema_migrations'"
    ).get();
    ensureMigrationsTable(db);

    let bootstrapped = 0;
    if (!tableExisted) {
      bootstrapped = bootstrapHistorical(db);
      if (verbose && bootstrapped > 0) {
        console.log(`[migrate] bootstrapped ${bootstrapped} historical migration(s) as already-applied`);
      }
    }

    const already = appliedSet(db);
    const pending = listMigrationFiles().filter(f => !already.has(f));
    const applied = [];
    for (const file of pending) {
      if (verbose) console.log(`[migrate] applying ${file}`);
      applyOne(db, file);
      applied.push(file);
    }
    if (verbose && applied.length === 0 && bootstrapped === 0) {
      console.log('[migrate] up to date');
    }
    return { applied, bootstrapped };
  } finally {
    db.close();
  }
}

module.exports = { runMigrations, listMigrationFiles };
