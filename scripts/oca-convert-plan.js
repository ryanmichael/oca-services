#!/usr/bin/env node
'use strict';

// CLI: node scripts/oca-convert-plan.js [--limit N] [--show ID]
//
// Chunk 3 of the OCA-standardisation plan, step 1 of 2: decide WHAT could be
// converted to the OCA translation, and prove each case, writing nothing.
//
// Applying is a separate script run against this plan, so the decision and the
// write are reviewable apart from each other. 225 of 365 Vespers mix
// translations; the cost of a wrong attribution here is a parish singing the
// wrong saint's hymn, which is the failure this whole plan exists to stop.
//
// A candidate is PROPOSED only when every one of these holds:
//   * our commemoration carries non-OCA lordICall stichera
//   * we hold an OCA DOCX for that month-day (any year — saints are fixed)
//   * that file's Lord-I-Call section names EXACTLY ONE subject matching this
//     commemoration; zero or several means it is reported, never guessed
//   * the file prints at least as many stichera for that subject as we hold
//
// Everything else lands in `skipped` with a reason. A plan that quietly drops
// the hard cases would look like success.

const fs   = require('fs');
const path = require('path');
const { parseLordICall } = require('../server-lib/sources/oca-docx-parse');

const ROOT   = path.resolve(__dirname, '..');
const CACHE  = path.join(ROOT, 'reference', 'scrape');
const REPORT = path.join(ROOT, 'audit', 'reports', 'oca-convert-plan.json');

const HONORIFIC = /^(st\.?|saint|venerable|martyrs?|hieromartyr|holy|apostle|blessed|righteous|virgin|prophet|great|new|repose|of|the|and)$/i;
const GENERIC   = /^(the )?(resurrection|theotokion|dogmatikon|cross|forefeast|afterfeast|martyrs|departed)$/i;

/** Distinctive lowercase tokens of a title — the proper names. */
function keyTokens(title) {
  return String(title || '')
    .replace(/[“”"'’,:;()]/g, ' ')
    .split(/[\s\-\/]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 4 && !HONORIFIC.test(w))
    .map(w => w.toLowerCase());
}

function candidates() {
  const { openDb } = require('../server-lib/cache/sqlite');
  const db = openDb();
  if (!db) throw new Error('storage/oca.db not found');
  try {
    return db.prepare(`
      SELECT c.id, c.month, c.day, c.title,
             COUNT(*) AS n,
             GROUP_CONCAT(DISTINCT s.source) AS sources,
             GROUP_CONCAT(s."order") AS orders
        FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id
       WHERE s.section = 'lordICall'
         AND s.source IN ('lambertsen','stSergius','raphaela')
         AND c.month IS NOT NULL AND c.day IS NOT NULL
       GROUP BY c.id
       ORDER BY c.month, c.day, c.id
    `).all();
  } finally { db.close(); }
}

/** Cached DOCX for a month-day, newest year first. */
function filesFor(month, day) {
  const mm = String(month).padStart(2, '0'), dd = String(day).padStart(2, '0');
  return fs.readdirSync(CACHE)
    .filter(f => new RegExp(`^\\d{4}-${mm}-${dd}\\.docx$`).test(f))
    .sort().reverse()
    .map(f => path.join(CACHE, f));
}

function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null;
  const showId = args.includes('--show') ? Number(args[args.indexOf('--show') + 1]) : null;

  const all = candidates();
  const list = limit ? all.slice(0, limit) : all;
  const plan = { generatedAt: new Date().toISOString(), proposed: [], skipped: [] };

  for (const c of list) {
    const files = filesFor(c.month, c.day);
    if (!files.length) { plan.skipped.push({ ...c, reason: 'no OCA file for that day' }); continue; }

    const toks = keyTokens(c.title);
    if (!toks.length) { plan.skipped.push({ ...c, reason: 'no distinctive name token in title' }); continue; }

    let picked = null;
    for (const file of files) {
      let parsed;
      try { parsed = parseLordICall(file); }
      catch (e) { continue; }
      if (!parsed.found) continue;

      const subjects = [...new Set(parsed.stichera.map(s => s.subject).filter(Boolean))];
      const matches = subjects.filter(sub =>
        !GENERIC.test(sub.trim()) && keyTokens(sub).some(t => toks.includes(t)));

      if (matches.length === 0) continue;
      if (matches.length > 1) {
        plan.skipped.push({ ...c, reason: `ambiguous: ${matches.length} subjects match (${matches.join(' | ')})`, file: path.basename(file) });
        picked = 'ambiguous';
        break;
      }
      const subject = matches[0];
      const stichera = parsed.stichera.filter(s => s.subject === subject);
      const glory = parsed.glory && parsed.glory.subject === subject ? parsed.glory : null;
      picked = { file: path.basename(file), subject, stichera, glory };
      break;
    }

    if (picked === 'ambiguous') continue;
    if (!picked) { plan.skipped.push({ ...c, reason: 'OCA file does not print this saint\'s stichera' }); continue; }

    // Map SLOT TO SLOT, not count to count. Our non-OCA rows for a
    // commemoration are not necessarily the numbered stichera: St Hierotheus
    // (10-4) has orders 1-3 already converted and only order -1 (the
    // Now-and-ever Theotokion) and order 4 (a fourth sticheron the published
    // order does not appoint) still on st-sergius.org. Comparing counts alone
    // proposed replacing those two with OCA's three numbered stichera, which
    // would have written the wrong hymns into the wrong slots.
    const ourOrders = String(c.orders || '').split(',').map(Number).filter(n => !Number.isNaN(n));
    const ourNumbered = ourOrders.filter(o => o >= 1).sort((a, b) => a - b);
    const ourGlory    = ourOrders.includes(0);
    const ourOther    = ourOrders.filter(o => o < 0);

    // OCA prints stichera on descending psalm verses: verse 3 is sung first.
    const ocaOrdered = [...picked.stichera].sort((a, b) => b.verse - a.verse);

    const ops = [];
    if (ourNumbered.length) {
      if (ocaOrdered.length !== ourNumbered.length) {
        plan.skipped.push({ ...c, reason: `slot mismatch: OCA prints ${ocaOrdered.length} numbered stichera, we hold ${ourNumbered.length}`, file: picked.file });
        continue;
      }
      ourNumbered.forEach((o, i) => ops.push({
        order: o, tone: ocaOrdered[i].tone, verse: ocaOrdered[i].verse, text: ocaOrdered[i].text,
      }));
    }
    if (ourGlory) {
      if (!picked.glory) {
        plan.skipped.push({ ...c, reason: 'we hold a Glory but the OCA file prints none for this subject', file: picked.file });
        continue;
      }
      ops.push({ order: 0, tone: picked.glory.tone, verse: null, text: picked.glory.text });
    }
    if (!ops.length) {
      plan.skipped.push({ ...c, reason: `nothing mappable (our non-OCA rows are at orders ${ourOrders.join(',')})`, file: picked.file });
      continue;
    }

    plan.proposed.push({
      id: c.id, title: c.title, md: `${c.month}-${c.day}`,
      ourRows: c.n, ourSources: c.sources, ourOrders,
      // Orders we deliberately leave alone: a Now-and-ever Theotokion or an
      // extra sticheron the OCA file does not print is NOT converted, because
      // there is nothing to convert it to and inventing one is out of bounds.
      untouchedOrders: ourOther,
      file: picked.file, subject: picked.subject,
      ops,
    });
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(plan, null, 2));

  if (showId) {
    const p = plan.proposed.find(x => x.id === showId);
    console.log(JSON.stringify(p, null, 2));
    return;
  }

  const reasons = {};
  for (const s of plan.skipped) {
    const k = s.reason.replace(/\(.*\)/, '(…)').replace(/\d+/g, 'N');
    reasons[k] = (reasons[k] || 0) + 1;
  }
  console.log(`candidates examined : ${list.length}`);
  console.log(`PROPOSED            : ${plan.proposed.length}  (${plan.proposed.reduce((s, p) => s + p.ourRows, 0)} rows)`);
  console.log(`skipped             : ${plan.skipped.length}`);
  for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(4)}  ${k}`);
  }
  console.log(`\nPlan: ${path.relative(ROOT, REPORT)}  (nothing written to the DB)`);
}

if (require.main === module) main();

module.exports = { keyTokens, candidates, filesFor };
