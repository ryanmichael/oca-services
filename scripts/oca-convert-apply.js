#!/usr/bin/env node
'use strict';

// CLI: node scripts/oca-convert-apply.js [--apply] [--only ID,ID]
//
// Chunk 3 step 2 of 2: write the conversions that scripts/oca-convert-plan.js
// proposed. DRY-RUN BY DEFAULT — `--apply` is required to touch the database.
//
// Deliberately dumb. Every judgement lives in the plan; this script only writes
// what the plan already proved, slot by slot, so a reviewer reads the plan and
// not this file to know what will change.
//
// It writes `text`, `tone`, `source` and `source_date` for the mapped rows, and
// NOTHING else — no inserts, no deletes. A sticheron we cannot source stays as
// it is, because the alternative is a saint losing their proper hymn to the
// generic General Menaion.

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const PLAN   = path.join(ROOT, 'audit', 'reports', 'oca-convert-plan.json');
const BACKUP = path.join(ROOT, 'storage', `oca.db.bak.${new Date().toISOString().slice(0, 10)}-convert`);

function main() {
  const args  = process.argv.slice(2);
  const apply = args.includes('--apply');
  const only  = args.includes('--only')
    ? new Set(args[args.indexOf('--only') + 1].split(',').map(Number))
    : null;

  if (!fs.existsSync(PLAN)) {
    console.error(`No plan at ${path.relative(ROOT, PLAN)} — run: node scripts/oca-convert-plan.js`);
    process.exit(2);
  }
  const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
  const todo = plan.proposed.filter(p => !only || only.has(p.id));

  if (!todo.length) { console.log('nothing to apply'); return; }

  const { openDb, openDbWrite } = require('../server-lib/cache/sqlite');

  // Verify every target row still looks exactly as the plan expects before any
  // write. A plan generated against a since-changed DB must not be replayed.
  const ro = openDb();
  const stale = [];
  for (const p of todo) {
    for (const op of p.ops) {
      const row = ro.prepare(
        'SELECT source FROM stichera WHERE commemoration_id = ? AND section = ? AND "order" = ?'
      ).get(p.id, 'lordICall', op.order);
      if (!row) stale.push(`${p.id} order ${op.order}: row is gone`);
      else if (!['lambertsen', 'stSergius', 'raphaela'].includes(row.source)) {
        stale.push(`${p.id} order ${op.order}: source is now '${row.source}', not the non-OCA row the plan saw`);
      }
    }
  }
  ro.close();
  if (stale.length) {
    console.error('Plan is stale — regenerate it. Offending rows:');
    for (const s of stale.slice(0, 10)) console.error(`  ${s}`);
    process.exit(3);
  }

  const srcDate = (file) => (/^(\d{4}-\d{2}-\d{2})\.docx$/.exec(file) || [])[1] || null;

  console.log(apply ? 'APPLYING' : 'DRY RUN (pass --apply to write)');
  let rows = 0;
  for (const p of todo) {
    console.log(`  ${p.md.padEnd(6)} ${p.title.slice(0, 44).padEnd(44)} ${p.ops.length} row(s)  <- ${p.file}`);
    rows += p.ops.length;
  }
  console.log(`\n${todo.length} commemoration(s), ${rows} row(s)`);
  if (!apply) { console.log('\nNothing written.'); return; }

  fs.copyFileSync(path.join(ROOT, 'storage', 'oca.db'), BACKUP);
  console.log(`backup: ${path.relative(ROOT, BACKUP)}`);

  const db = openDbWrite();
  let written = 0;
  try {
    db.exec('BEGIN');
    const upd = db.prepare(`
      UPDATE stichera SET text = ?, tone = ?, source = 'oca-menaion', source_date = ?
       WHERE commemoration_id = ? AND section = 'lordICall' AND "order" = ?
    `);
    for (const p of todo) {
      for (const op of p.ops) {
        upd.run(op.text, op.tone, srcDate(p.file), p.id, op.order);
        written++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('rolled back:', e.message);
    process.exit(4);
  } finally { db.close(); }

  console.log(`\nwrote ${written} row(s).`);
  console.log('Restore with: cp ' + path.relative(ROOT, BACKUP) + ' storage/oca.db');
}

if (require.main === module) main();
