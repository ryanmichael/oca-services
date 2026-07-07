#!/usr/bin/env node
// Phases 1+2: hardened matcher (transliteration folding) + extraction validator
// + full 12-month manifest emission. No DB writes.
//
// Usage:
//   node menaion-audit.js              # full-year summary + write manifest.json
//   node menaion-audit.js --validate   # + per-chapter extraction fidelity report
//   node menaion-audit.js --month 4    # single month, verbose

const fs = require('fs');
const { execFileSync } = require('child_process');
const { parseMonth, parseChapter } = require('./parse-menaion.js');

const DB = '/Users/ryanmurphy/claude-code/oca-services/storage/oca.db';
const MONTHS = ['January','February','March','April','May','June','July',
  'August','September','October','November','December'];

// ---- transliteration-folding name key --------------------------------
// Symmetric folding applied to BOTH sides so Greek/Slavonic spelling variants
// (Nicetas/Niketas, Simeon/Symeon, Sabbas/Savva, Theodosίa/Theodosia) collide.
function nameKey(tok) {
  let s = tok.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/[^a-z]/g, '');
  s = s.replace(/ph/g, 'f').replace(/th/g, 't');
  s = s.replace(/kh/g, 'h').replace(/k/g, 'c');
  s = s.replace(/[yj]/g, 'i').replace(/v/g, 'b').replace(/z/g, 's');
  s = s.replace(/(.)\1+/g, '$1');   // collapse doubled letters
  s = s.replace(/s$/, '');          // drop trailing plural/genitive -s
  return s;
}
const STOP = new Set(('the of and with his her those them at in on a an new saint st ' +
  'holy venerable blessed righteous father mother our great glorious wonderworker ' +
  'wonder worker hieromartyr martyr martyrs greatmartyr apostle apostles evangelist ' +
  'bishop archbishop patriarch pope abbot abbess confessor prophet equal ' +
  'seventy monk nun virgin icon god commemoration who day month').split(/\s+/));
function keys(str) {
  return (str || '')
    .replace(/&[a-z]+;/g, ' ')
    .toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(nameKey).filter(Boolean);
}
function containment(a, b) {
  const B = new Set(b);
  const inter = a.filter((k) => B.has(k)).length;
  return inter / (Math.min(a.length, b.length) || 1);
}

// ---- DB coverage ------------------------------------------------------
function dbCoverage(month) {
  const sql = `SELECT json_group_array(json_object(
    'id',c.id,'day',c.day,'title',c.title,'saint_type',c.saint_type,
    'n_stichera',(SELECT COUNT(*) FROM stichera s WHERE s.commemoration_id=c.id),
    'n_trop',(SELECT COUNT(*) FROM troparia t WHERE t.commemoration_id=c.id)
  )) FROM commemorations c WHERE c.month=${month};`;
  return JSON.parse(execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }));
}

// ---- Phase 2: extraction fidelity ------------------------------------
// The intro rubric usually declares the stichera count ("...", 8 stichera:).
// Default is 3 when unstated. Compare declared vs extracted to catch drops.
function fidelity(parse) {
  const flags = [];
  const secs = parse.sections;
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    // Only an OPENING lic group declares the total ("6 stichera: ..."). The
    // stichera may then be split across "And N in the same tone" continuation
    // sub-groups, so sum the opening group + its continuations before comparing.
    if (s.kind === 'lic-intro' && !s.continuation) {
      const m = s.label.match(/(\d+)\s+sticher/i);
      const declared = m ? parseInt(m[1], 10) : 3;
      // Paschal interleave: "N stichera: X from the Pentecostarion, and Y..."
      const split = s.label.match(/(\d+)\s+from the Pentecostarion.*?(\d+)/i);
      const menaionOwn = split ? parseInt(split[2], 10) : declared;
      let got = s.texts.length, j = i + 1;
      while (j < secs.length && secs[j].kind === 'lic-intro' && secs[j].continuation) {
        got += secs[j].texts.length; j++;
      }
      i = j - 1;
      // Valid if extracted == declared, == the Menaion's own share (Paschal
      // interleave), or == declared/2 (the "sung twice" rubric: e.g. "on 6"
      // filled by 3 unique stichera each chanted twice).
      const ok = got === declared || got === menaionOwn || got * 2 === declared;
      if (!ok) {
        flags.push(`LIC declared ${declared}${split ? ` (${menaionOwn} own)` : ''}, extracted ${got}`);
      }
    }
  }
  // structural sanity: canon should have odes; glory/nowever appear <=  a few
  if (parse.counts.odes === 0) flags.push('no canon odes parsed');
  if (parse.counts.licStichera === 0) flags.push('no LIC stichera parsed');
  return flags;
}

// ---- run --------------------------------------------------------------
const args = process.argv.slice(2);
const validate = args.includes('--validate');
const singleMonth = args.includes('--month') ? parseInt(args[args.indexOf('--month') + 1], 10) : null;
const manifest = [];
const totals = { chapters: 0, gap: 0, covered: 0, unmatched: 0, fidelityFail: 0 };
const fidReport = [];

for (let mi = 0; mi < 12; mi++) {
  const monthNum = mi + 1;
  if (singleMonth && monthNum !== singleMonth) continue;
  const dir = 'MenaionLambertsen' + MONTHS[mi];
  const chapters = parseMonth(dir);
  const db = dbCoverage(monthNum);
  const byDay = {};
  for (const c of db) (byDay[c.day] ||= []).push(c);

  for (const ch of chapters) {
    const chKeys = keys(ch.saint);
    let best = null, score = 0;
    for (const c of byDay[ch.day] || []) {
      const sc = containment(chKeys, keys(c.title));
      if (sc > score) { score = sc; best = c; }
    }
    const lic = ch.parse.counts.licStichera;
    let verdict;
    if (!best || score < 0.5) verdict = 'unmatched';
    else if (best.n_stichera > 0) verdict = 'already-covered';
    else if (lic > 0) verdict = 'gap-fillable';
    else verdict = 'no-content';

    const fid = validate || true ? fidelity(ch.parse) : [];
    if (fid.length) { totals.fidelityFail++; fidReport.push({ m: monthNum, day: ch.day, saint: ch.saint, fid }); }

    totals.chapters++;
    if (verdict === 'gap-fillable') totals.gap++;
    else if (verdict === 'already-covered') totals.covered++;
    else if (verdict === 'unmatched') totals.unmatched++;

    manifest.push({
      month: monthNum, day: ch.day, file: ch.file, saint: ch.saint,
      verdict, matchScore: +score.toFixed(2),
      commemoration_id: best ? best.id : null,
      matchTitle: best ? best.title : null,
      dbStichera: best ? best.n_stichera : null,
      saintType: best ? best.saint_type : null,
      counts: ch.parse.counts,
      fidelityFlags: fid,
    });
  }
}

// ---- output -----------------------------------------------------------
if (singleMonth) {
  for (const r of manifest) {
    console.log(`${r.month}/${String(r.day).padEnd(2)} ${r.verdict.padEnd(15)} ` +
      `sc${r.matchScore} lic${r.counts.licStichera} | ${r.saint.slice(0, 40).padEnd(40)} -> ${r.matchTitle || '(none)'}`);
  }
}
if (validate && fidReport.length) {
  console.log('\n=== EXTRACTION FIDELITY FLAGS ===');
  for (const f of fidReport) console.log(`  ${f.m}/${f.day} ${f.saint.slice(0, 45)} :: ${f.fid.join('; ')}`);
}

const outPath = __dirname + '/menaion-manifest.json';
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

console.log('\n=== FULL-YEAR SUMMARY (hardened matcher) ===');
console.log(`chapters:        ${totals.chapters}`);
console.log(`gap-fillable:    ${totals.gap}   (proper stichera for a saint we render generic today)`);
console.log(`already-covered: ${totals.covered}   (QA cross-check corpus)`);
console.log(`unmatched:       ${totals.unmatched}   (needs manual name reconciliation)`);
console.log(`\nPhase-2 extraction fidelity: ${totals.chapters - totals.fidelityFail}/${totals.chapters} clean` +
  `, ${totals.fidelityFail} flagged (run --validate to list).`);
console.log(`manifest written: ${outPath}`);
