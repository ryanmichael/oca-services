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
//
// Beyond the per-file schemas this also runs a text-hygiene pass (see
// checkQuoteBalance): a hymn whose quoted speech never closes is a scraper
// artifact that no schema can see, because the shape is still a valid string.

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

/**
 * Text hygiene: quoted speech in a hymn must close.
 *
 * On 2026-08-15 the Tone-2 resurrectional troparion — sung at every Tone-2
 * Sunday Liturgy and Saturday Vespers — rendered as
 *   …all the powers of heaven cried out:
 *   "O Giver of life, Christ our God, glory to Thee!
 * with no closing quote. Eight more Octoechos hymns carried the same dropped
 * character. Every one of them passed schema validation, because a truncated
 * string is still a string; only reading the rendered text caught it.
 *
 * Straight double quotes are a hard failure — the corpus is clean of them and
 * a new one means a scraper dropped a character. Curly quotes are reported as
 * warnings only: twelve strings imported from a non-OCA source carry tangled
 * “…” runs that need per-string editorial judgment, not a mechanical repair,
 * and gating on them would block unrelated work. Fix them and they stop
 * warning; the count is meant to shrink.
 */
function checkQuoteBalance(rel, node, at, errors, warnings) {
  if (typeof node === 'string') {
    if ((node.match(/"/g) || []).length % 2 === 1) {
      errors.push({ rel, at, text: node });
    } else if ((node.match(/“/g) || []).length !== (node.match(/”/g) || []).length) {
      warnings.push({ rel, at, text: node });
    }
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) checkQuoteBalance(rel, v, `${at}.${k}`, errors, warnings);
}

function reportQuote(list, heading, quiet) {
  if (!list.length || quiet) return;
  console.log('');
  console.log(heading);
  for (const q of list.slice(0, 15)) {
    console.log(`    ${q.rel} ${q.at}`);
    console.log(`      …${q.text.replace(/\n/g, ' ').slice(-90)}`);
  }
  if (list.length > 15) console.log(`    … +${list.length - 15} more`);
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
  const quoteErrors = [], quoteWarnings = [];

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
      checkQuoteBalance(rel, content, '', quoteErrors, quoteWarnings);
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

  reportQuote(quoteErrors,
    `✗ ${quoteErrors.length} string(s) with unclosed quoted speech (straight quotes):`, quiet);
  reportQuote(quoteWarnings,
    `⚠ ${quoteWarnings.length} string(s) with unbalanced curly quotes (pre-existing import noise, not gated):`,
    quiet);
  if (quiet) {
    console.log(`quote balance: ${quoteErrors.length} unclosed, ${quoteWarnings.length} curly warning(s)`);
  }

  process.exit(errs || quoteErrors.length ? 1 : 0);
}

try { main(); }
catch (err) {
  console.error('validate-schemas crashed:', err);
  process.exit(2);
}
