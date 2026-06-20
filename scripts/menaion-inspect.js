#!/usr/bin/env node
'use strict';

// menaion-inspect.js — given a date (or month/day), dump everything the
// menaion DB knows about that day side-by-side with orthocal.com's listing.
// Sibling to find-slot.js (which works on the cascade/library layer).
//
// Saves writing ad-hoc sqlite3 queries when triaging audit findings: who's
// commemorated, what troparia/stichera each has, what orthocal says, where
// they disagree.
//
// Usage:
//   node scripts/menaion-inspect.js 2026-06-21
//   node scripts/menaion-inspect.js 06-21
//   node scripts/menaion-inspect.js --month 6 --day 21
//   node scripts/menaion-inspect.js 2026-06-21 --json
//   node scripts/menaion-inspect.js 2026-06-21 --principal-only
//
// Flags:
//   --json             Emit JSON (default: human-readable table)
//   --principal-only   Show only the principal-saint pick (per getMenaionRanked)
//   --no-orthocal      Skip the orthocal cross-reference
//   --text-limit N     Trim text preview to N chars (default 80)

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { getMenaionRanked } = require(path.join(ROOT, 'server-lib/sources/menaion.js'));

function parseArgs(argv) {
  const out = { textLimit: 80 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json')             out.json = true;
    else if (a === '--principal-only') out.principalOnly = true;
    else if (a === '--no-orthocal') out.noOrthocal = true;
    else if (a === '--month')       out.month = Number(argv[++i]);
    else if (a === '--day')         out.day   = Number(argv[++i]);
    else if (a === '--text-limit')  out.textLimit = Number(argv[++i]);
    else if (!a.startsWith('--'))   positional.push(a);
  }
  if (positional[0]) {
    const m = positional[0].match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
    if (m) {
      out.year  = m[1] ? Number(m[1]) : new Date().getUTCFullYear();
      out.month = Number(m[2]);
      out.day   = Number(m[3]);
    }
  }
  return out;
}

function readOrthocal(year, month, day) {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const p = path.join(ROOT, 'data', 'orthocal', `${dateStr}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function trim(s, n) {
  if (!s) return '';
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n) + '…' : flat;
}

function fmtCommemoration(c, opts) {
  const lines = [];
  lines.push(`#${c.id}  ${c.title}`);
  lines.push(`   rank=${c.rank || '-'}  tone=${c.tone || '-'}  saint_type=${c.saint_type || '-'}  hasTroparion=${c.hasTroparion}  hasStichera=${c.hasStichera}`);
  if (c.troparia?.length) {
    lines.push(`   troparia (${c.troparia.length}):`);
    for (const t of c.troparia) {
      lines.push(`     [${t.type} tone=${t.tone || '-'} ${t.pronoun}] ${trim(t.text, opts.textLimit)}`);
    }
  }
  if (c.stichera?.length) {
    lines.push(`   stichera (${c.stichera.length}):`);
    for (const s of c.stichera) {
      lines.push(`     [${s.section} order=${s.order} tone=${s.tone || '-'} ${s.label || '-'}] ${trim(s.text, opts.textLimit)}`);
    }
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.month || !args.day) {
    console.error('Usage: node scripts/menaion-inspect.js YYYY-MM-DD');
    console.error('       node scripts/menaion-inspect.js --month M --day D');
    process.exit(1);
  }
  const year = args.year || new Date().getUTCFullYear();

  const ranked = getMenaionRanked(args.month, args.day);
  if (!ranked) {
    console.error(`No menaion entries for month=${args.month} day=${args.day}.`);
    process.exit(2);
  }

  const orthocal = args.noOrthocal ? null : readOrthocal(year, args.month, args.day);

  if (args.json) {
    console.log(JSON.stringify({
      query:  { year, month: args.month, day: args.day },
      menaion: {
        principal: ranked.principal ? { id: ranked.principal.id, title: ranked.principal.title } : null,
        all: args.principalOnly ? [ranked.principal] : ranked.all,
      },
      orthocal: orthocal ? {
        summary_title: orthocal.summary_title,
        feasts:        orthocal.feasts,
        saints:        orthocal.saints,
      } : null,
    }, null, 2));
    return;
  }

  // Human-readable output
  console.log(`# Menaion inspection — ${year}-${String(args.month).padStart(2,'0')}-${String(args.day).padStart(2,'0')}\n`);
  console.log(`## Menaion DB principal pick`);
  console.log(`  ${ranked.principal ? `#${ranked.principal.id}  ${ranked.principal.title}` : '(none)'}\n`);

  const list = args.principalOnly ? [ranked.principal].filter(Boolean) : ranked.all;
  console.log(`## All commemorations (${list.length})\n`);
  for (const c of list) {
    console.log(fmtCommemoration(c, args));
    console.log('');
  }

  if (orthocal) {
    console.log('## Orthocal.com cross-reference\n');
    console.log(`  summary_title: ${orthocal.summary_title || '(none)'}`);
    console.log(`  feasts:        ${(orthocal.feasts || []).map(s => `"${s}"`).join(', ') || '(none)'}`);
    console.log(`  saints:        ${(orthocal.saints || []).map(s => `"${s}"`).join(', ') || '(none)'}`);

    // Lightweight mismatch hint: principal title vs orthocal saints
    if (ranked.principal) {
      const ourTitleLc = ranked.principal.title.toLowerCase();
      const orthocalAll = [
        orthocal.summary_title,
        ...(orthocal.feasts || []),
        ...(orthocal.saints || []),
      ].filter(Boolean).map(s => s.toLowerCase());
      const matched = orthocalAll.some(s => {
        // Crude substring overlap on the first distinctive word.
        const distinctive = ourTitleLc.match(/[a-z]{4,}/g) || [];
        return distinctive.some(w => s.includes(w));
      });
      if (!matched) {
        console.log(`\n  ⚠ Possible mismatch: our principal does not share a 4+ char token with any orthocal entry.`);
        console.log(`    Run audit rule A2-saint-aligns-orthocal for a more rigorous check.`);
      }
    }
  } else if (!args.noOrthocal) {
    console.log('## Orthocal.com cross-reference\n  (no orthocal data file for this date)');
  }
}

main();
