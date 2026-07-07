#!/usr/bin/env node
// Coverage-gap diff: Lambertsen Menaion (english-md) vs our oca.db stichera.
// For one month, matches each Lambertsen chapter to a DB commemoration and
// classifies whether Lambertsen could fill a current generic-fallback gap.
//
// Usage: node build-diff.js <MonthDir> <monthNum>
//   e.g. node build-diff.js MenaionLambertsenApril 4

const { execFileSync } = require('child_process');
const path = require('path');
const { parseMonth } = require('./parse-menaion.js');

const DB = '/Users/ryanmurphy/claude-code/oca-services/storage/oca.db';
const monthDir = process.argv[2] || 'MenaionLambertsenApril';
const monthNum = parseInt(process.argv[3] || '4', 10);

// ---- DB coverage for the month ---------------------------------------
function dbCoverage(month) {
  const sql = `SELECT json_group_array(json_object(
      'id', c.id, 'day', c.day, 'title', c.title,
      'saint_type', c.saint_type,
      'n_stichera', (SELECT COUNT(*) FROM stichera s WHERE s.commemoration_id=c.id),
      'n_trop', (SELECT COUNT(*) FROM troparia t WHERE t.commemoration_id=c.id)
    )) FROM commemorations c WHERE c.month=${month};`;
  const out = execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' });
  return JSON.parse(out);
}

// ---- name normalization + matching -----------------------------------
const STOP = new Set(('the of and with his her those them at in on a an new saint st ' +
  'holy venerable blessed righteous father mother our great glorious wonderworker ' +
  'wonder worker hieromartyr martyr martyrs greatmartyr apostle apostles evangelist ' +
  'bishop archbishop patriarch pope abbot abbess confessor prophet equal apostles ' +
  'to the seventy monk nun virgin icon mother god commemoration who').split(/\s+/));

function tokens(s) {
  return (s || '')
    .replace(/&[a-z]+;/g, ' ')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && w.length > 2);
}

function overlap(aTokens, bTokens) {
  const b = new Set(bTokens);
  const inter = aTokens.filter((t) => b.has(t)).length;
  const denom = Math.min(aTokens.length, bTokens.length) || 1;
  return inter / denom; // containment score (robust to extra words)
}

function matchChapter(ch, dbDay) {
  const chTok = tokens(ch.saint);
  let best = null, bestScore = 0;
  for (const c of dbDay) {
    const sc = overlap(chTok, tokens(c.title));
    if (sc > bestScore) { bestScore = sc; best = c; }
  }
  return { best, score: bestScore };
}

// ---- run --------------------------------------------------------------
const chapters = parseMonth(monthDir);
const db = dbCoverage(monthNum);
const byDay = {};
for (const c of db) (byDay[c.day] ||= []).push(c);

const rows = [];
for (const ch of chapters) {
  const dbDay = byDay[ch.day] || [];
  const { best, score } = matchChapter(ch, dbDay);
  const lic = ch.parse.counts.licStichera;
  const odes = ch.parse.counts.odes;
  let verdict;
  if (score < 0.34 || !best) verdict = 'UNMATCHED';
  else if (best.n_stichera > 0) verdict = 'already-covered';
  else if (lic > 0) verdict = 'GAP-FILLABLE';
  else verdict = 'no-lic-content';
  rows.push({ day: ch.day, saint: ch.saint, lic, odes, score,
    match: best && best.title, dbStich: best ? best.n_stichera : null,
    saintType: best ? best.saint_type : null, verdict });
}

// ---- report -----------------------------------------------------------
const w = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
console.log(`\n=== ${monthDir}  vs  oca.db (month ${monthNum}) ===\n`);
console.log(w('Day', 4) + w('LIC', 4) + w('Verdict', 16) + w('Match(score)', 8) +
  '  Lambertsen saint  ->  DB commemoration');
console.log('-'.repeat(110));
for (const r of rows) {
  const sc = r.score ? r.score.toFixed(2) : '-';
  const tag = r.verdict === 'GAP-FILLABLE' ? '★ GAP-FILLABLE' : r.verdict;
  console.log(
    w(r.day, 4) + w(r.lic, 4) + w(tag, 16) + w(sc, 8) +
    '  ' + w(r.saint, 42) + ' -> ' + (r.match || '(none)') +
    (r.dbStich != null ? `  [db:${r.dbStich} stich]` : ''));
}

const g = rows.filter((r) => r.verdict === 'GAP-FILLABLE');
const cov = rows.filter((r) => r.verdict === 'already-covered');
const un = rows.filter((r) => r.verdict === 'UNMATCHED');
console.log('\n--- summary ---');
console.log(`GAP-FILLABLE (principal saint currently renders generic fallback, ` +
  `Lambertsen has proper stichera): ${g.length}`);
console.log(`already-covered (DB already has day-specific stichera; use for cross-check/QA): ${cov.length}`);
console.log(`unmatched (needs manual name reconciliation): ${un.length}`);
console.log(`\nEvery matched chapter also carries a full ${8}-ode Matins canon ` +
  `(${rows.reduce((a, r) => a + r.odes, 0)} odes total) — a separate coverage axis.`);
if (g.length) {
  console.log('\nGAP-FILLABLE days: ' + g.map((r) => `${monthNum}/${r.day} ${r.saint.split(/[,&]/)[0].trim()}`).join('; '));
}
