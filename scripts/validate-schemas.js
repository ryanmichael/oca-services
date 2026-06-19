#!/usr/bin/env node
'use strict';

// Walks the three data layers, validates each JSON file against its registered
// schema, and prints a summary.
//
//   node scripts/validate-schemas.js              # full run
//   node scripts/validate-schemas.js --max=20     # cap errors printed
//   node scripts/validate-schemas.js --quiet      # only summary
//
// Exit codes: 0 = all valid · 1 = schema violations · 2 = unexpected error.

const fs   = require('fs');
const path = require('path');

const { validate, resolveSchema } = require('../schemas');

const REPO_ROOT = path.resolve(__dirname, '..');
const ROOTS     = ['service-structure', 'fixed-texts', 'variable-sources'];

function listJsonFiles(dir) {
  const out = [];
  function walk(p) {
    let entries;
    try { entries = fs.readdirSync(p, { withFileTypes: true }); }
    catch { return; }
    for (const ent of entries) {
      const full = path.join(p, ent.name);
      if (ent.isDirectory())  walk(full);
      else if (ent.isFile() && ent.name.endsWith('.json')) out.push(full);
    }
  }
  walk(dir);
  return out;
}

function main() {
  const args  = process.argv.slice(2);
  const quiet = args.includes('--quiet');
  const max   = (() => {
    const m = args.find((a) => a.startsWith('--max='));
    return m ? Number(m.slice(6)) : 25;
  })();

  let total = 0, valid = 0, skipped = 0, errs = 0;
  const fails = [];

  for (const root of ROOTS) {
    const abs = path.join(REPO_ROOT, root);
    for (const f of listJsonFiles(abs)) {
      const rel = path.relative(REPO_ROOT, f);
      let content;
      try { content = JSON.parse(fs.readFileSync(f, 'utf8')); }
      catch (parseErr) {
        total++; errs++;
        fails.push({ rel, errors: [{ keyword: 'parse', message: parseErr.message, path: '(root)' }] });
        continue;
      }
      total++;
      const schemaPath = resolveSchema(rel);
      if (!schemaPath) { skipped++; continue; }

      const result = validate(rel, content);
      if (result.ok) valid++;
      else { errs++; fails.push({ rel, errors: result.errors }); }
    }
  }

  if (!quiet) {
    console.log(`Validated ${total} JSON files (${valid} pass · ${skipped} unmapped · ${errs} fail)`);
    if (fails.length) {
      console.log('');
      let printed = 0;
      for (const f of fails) {
        if (printed >= max) {
          console.log(`… and ${fails.length - printed} more file(s) with errors. Use --max= to see more.`);
          break;
        }
        console.log(`✗ ${f.rel}`);
        for (const e of f.errors.slice(0, 5)) {
          console.log(`    ${e.path} — ${e.keyword}: ${e.message}`);
        }
        if (f.errors.length > 5) console.log(`    … +${f.errors.length - 5} more error(s)`);
        printed++;
      }
    }
  } else {
    console.log(`schema validate: ${valid}/${total} pass, ${errs} fail, ${skipped} unmapped`);
  }

  process.exit(errs ? 1 : 0);
}

try { main(); }
catch (err) {
  console.error('validate-schemas crashed:', err);
  process.exit(2);
}
