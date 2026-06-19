#!/usr/bin/env node
'use strict';

// CLI: node scripts/migrate.js
// Applies any SQL files in storage/migrations/ not yet recorded in
// _schema_migrations. Safe to run repeatedly.

const { runMigrations } = require('../server-lib/storage/migrations');

try {
  const { applied, bootstrapped } = runMigrations({ verbose: true });
  if (bootstrapped > 0) {
    console.log(`bootstrap complete (${bootstrapped} historical files marked applied)`);
  }
  console.log(`done — ${applied.length} migration(s) applied this run`);
  process.exit(0);
} catch (err) {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
}
