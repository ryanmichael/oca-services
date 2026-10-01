#!/usr/bin/env node
'use strict';

/**
 * CLI: correct one attachment's date mapping in a packet manifest, with a
 * recorded reason.
 *
 *   node scripts/choir-packet-remap.js --packet 2026-09-24 \
 *     --attachment "Daily Vespers 10.01.26.pdf" --api-date 2026-09-30 \
 *     --reason "body says 'DV (Wed 10.01)'; 10-01 is the liturgical day"
 *
 * Exists because the director uses two filename conventions — the civil evening
 * ("Great Vespers 09.26.26", a Saturday) and the liturgical day ("Daily Vespers
 * 10.01.26", sung Wednesday 09-30). `choir-week-verify` detects the collision
 * but never guesses; this records the human's decision so it survives a re-fetch
 * and is visible to the next reader.
 *
 * Only the date mapping changes. The stored PDF, its hash and its provenance are
 * left exactly as they were.
 */

const fs   = require('fs');
const path = require('path');
const { DATE_SHIFTED, addDays } = require('./choir-mail-parse.js');

const REPO        = path.resolve(__dirname, '..');
const PACKET_ROOT = path.join(REPO, 'docs', 'choir-packets');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if      (a === '--packet')     out.packet     = argv[++i];
    else if (a === '--attachment') out.attachment = argv[++i];
    else if (a === '--api-date')   out.apiDate    = argv[++i];
    else if (a === '--reason')     out.reason     = argv[++i];
    else if (a === '--dry-run')    out.dryRun     = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else { console.error(`unknown argument: ${a}`); process.exit(1); }
  }
  return out;
}

const USAGE = `
Usage: node scripts/choir-packet-remap.js --packet <iso> --attachment <filename>
                                          --api-date <iso> --reason <text>

  --packet <iso>       the packet's email date, e.g. 2026-09-24
  --attachment <name>  the attachment's ORIGINAL filename
  --api-date <iso>     the civil date the service is actually sung
  --reason <text>      why — recorded in the manifest, required
  --dry-run            show the change, write nothing

contentDate is recomputed from the service's own shift rule, so it never has to
be supplied by hand.
`.trimStart();

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return 0; }
  for (const k of ['packet', 'attachment', 'apiDate', 'reason']) {
    if (!args[k]) { console.error(`missing --${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}\n`); console.error(USAGE); return 1; }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.apiDate)) {
    console.error(`--api-date must be YYYY-MM-DD, got "${args.apiDate}"`);
    return 1;
  }

  const mfPath = path.join(PACKET_ROOT, args.packet, 'manifest.json');
  if (!fs.existsSync(mfPath)) { console.error(`no manifest: ${path.relative(REPO, mfPath)}`); return 1; }
  const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));

  const entry = (mf.attachments || []).find((a) => a.original === args.attachment);
  if (!entry) {
    console.error(`no attachment "${args.attachment}" in ${args.packet}. Present:`);
    for (const a of mf.attachments || []) console.error(`  - ${a.original}`);
    return 1;
  }
  if (entry.kind !== 'service') {
    console.error(`"${args.attachment}" is ${entry.kind}, not a service — nothing to remap`);
    return 1;
  }

  const before = { apiDate: entry.apiDate, contentDate: entry.contentDate };
  const after  = {
    apiDate: args.apiDate,
    contentDate: DATE_SHIFTED.has(entry.service) ? addDays(args.apiDate, 1) : args.apiDate,
  };

  if (before.apiDate === after.apiDate && before.contentDate === after.contentDate) {
    console.log(`already mapped to ${after.apiDate} — nothing to do`);
    return 0;
  }

  console.log(`\n${args.packet} · ${entry.original}  (${entry.serviceLabel})`);
  console.log(`  apiDate      ${before.apiDate}  →  ${after.apiDate}`);
  console.log(`  contentDate  ${before.contentDate}  →  ${after.contentDate}`);
  console.log(`  reason       ${args.reason}`);

  if (args.dryRun) { console.log('\n  (dry run — nothing written)\n'); return 0; }

  // Keep the original mapping visible rather than overwriting history.
  entry.remappedFrom = entry.remappedFrom || before;
  entry.remapReason  = args.reason;
  entry.remappedAt   = new Date().toISOString();
  entry.apiDate      = after.apiDate;
  entry.contentDate  = after.contentDate;
  if (entry.apiPath) entry.apiUrl = `${entry.apiPath}?date=${after.apiDate}`;
  entry.confidence   = 'confirmed';

  fs.writeFileSync(mfPath, `${JSON.stringify(mf, null, 2)}\n`);
  console.log(`\n  wrote ${path.relative(REPO, mfPath)}\n`);
  return 0;
}

if (require.main === module) {
  // process.exit() discards stdout still queued for a pipe, which truncated
  // --json output at 64 KB. Set the code and let Node flush and exit on its own.
  try { process.exitCode = main(); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
}

module.exports = { parseArgs };
