#!/usr/bin/env node
'use strict';

// Rank coverage oracle — our fixed-date feast ranks vs the OCA calendar.
//
// WHY. `getFeastRank` drives calendar/entry.js and liturgy-from-orthocal.js, so
// a missing rank silently renders a polyeleos or vigil saint as an ordinary
// six-stichera day: no polyeleos, no magnification, no festal propers. That is
// the shape of the 2026-08-09 St. Herman bug, and it is not a one-off — our
// curated lists hold 25 fixed dates while the OCA calendar marks 65.
//
// THE ORACLE. Vendored orthocal carries `feast_level`, the typikon rank symbol:
//     4 = polyeleos (red cross)      5 = vigil (red cross half-circle)
//     6/7/8 = great feast            0-3 = below polyeleos
//
// SEPARATING FIXED FROM MOVEABLE. A date's rank as printed by orthocal is the
// MAXIMUM of its fixed-date rank and whatever the moveable cycle contributes
// that year (a Lenten weekday, a Sunday, Holy Week). `getFeastRank` only knows
// the fixed calendar, so comparing them on a single year produces false
// mismatches — 2026-04-06 reads "polyeleos" only because it is Great and Holy
// Monday.
//
// Rather than pattern-match titles, this takes the MINIMUM feast_level for each
// month-day across every cached orthocal year. Moveable collisions can only
// raise a date's level, never lower it, so the minimum is the fixed-date floor.
// With the 5 years currently cached, 307 of 366 month-days are already constant;
// the 59 that vary are Lenten-weekday interference (level 0 vs 1). No heuristics,
// and it gets sharper as more years are cached.
//
// Findings are keyed by MONTH-DAY, not by date, so a baseline is year-independent.
//
// Usage:
//   node scripts/rank-coverage.js                     # report
//   node scripts/rank-coverage.js --capture-baseline audit/rank-coverage.json
//   node scripts/rank-coverage.js --check audit/rank-coverage.json   # exit 2 on NEW

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ORTHOCAL_DIR = path.join(ROOT, 'data', 'orthocal');
const { getFeastRank } = require(path.join(ROOT, 'calendar', 'fixed-feasts'));

function getArg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const captureBaseline = getArg('--capture-baseline', null);
const checkBaseline   = getArg('--check', null);
const verbose         = process.argv.includes('--verbose');

// orthocal feast_level → our rank vocabulary. Levels 0-3 are below polyeleos and
// map to no curated rank (getFeastRank returns 'sixStichera' or null there).
//
// LEVEL 6 IS NOT ONE OF THE TWELVE. Checked against the cache: level 8 is the
// Lord's feasts (Theophany, Nativity, Meeting, Palm, Pascha, Ascension,
// Pentecost, Transfiguration, Elevation) and level 7 the Theotokos ones (Entry,
// Annunciation, Dormition, her Nativity) — together the Twelve plus Pascha.
// Level 6 is Circumcision, Pokrov, Peter and Paul, the Forerunner's Nativity and
// Beheading, Apostle Matthew: the "red cross circle" typikon symbol, which is
// vigil rank, not a Great Feast. Mapping 6 to greatFeast produced five false
// mismatches where our `vigil` was right all along.
function levelToRank(level) {
  if (level >= 7) return 'greatFeast';
  if (level === 6) return 'vigil';
  if (level === 5) return 'vigil';
  if (level === 4) return 'polyeleos';
  return null;
}

// Rank ordering, used to take a minimum on OUR side the same way the orthocal
// side takes a minimum feast_level.
const RANK_ORDER = { sixStichera: 0, polyeleos: 1, vigil: 2, greatFeast: 3 };

/** Fixed-date floor per month-day, aggregated over every cached orthocal year. */
function collectFixedLevels() {
  if (!fs.existsSync(ORTHOCAL_DIR)) {
    console.error(`rank-coverage: no orthocal cache at ${ORTHOCAL_DIR}`);
    process.exit(1);
  }
  const byMD = new Map();
  const years = new Set();
  for (const f of fs.readdirSync(ORTHOCAL_DIR)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})\.json$/.exec(f);
    if (!m) continue;
    let o;
    try { o = JSON.parse(fs.readFileSync(path.join(ORTHOCAL_DIR, f), 'utf8')); }
    catch (_) { continue; }
    if (typeof o.feast_level !== 'number') continue;
    years.add(Number(m[1]));
    const md = `${Number(m[2])}-${Number(m[3])}`;
    const title = o.summary_title || '';
    let cur = byMD.get(md);
    if (!cur) { cur = { md, level: o.feast_level, samples: 0, titles: new Map(), years: [] }; byMD.set(md, cur); }
    cur.level = Math.min(cur.level, o.feast_level);
    cur.samples += 1;
    cur.years.push({ year: Number(m[1]), iso: f.replace(/\.json$/, ''), level: o.feast_level, title });
    // Title is chosen later by FREQUENCY, not by first-seen. A fixed-date
    // commemoration recurs every year; a moveable collision appears once. Taking
    // the most common title stops the report labelling 3-9 "First Sunday of
    // Lent" instead of the Forty Martyrs, or 4-23 "Bright Wednesday" instead of
    // St George — misleading precisely where a human is triaging.
    cur.titles.set(title, (cur.titles.get(title) || 0) + 1);
  }
  return { byMD, years: [...years].sort() };
}

/** Our fixed-date rank for a month-day.
 *
 *  MUST take the minimum across the same years, for the same reason the orthocal
 *  side does: `getFeastRank` consults `getGreatFeastKey`, which knows the
 *  MOVEABLE great feasts too. Evaluated on a single year it reports 5-21 as
 *  greatFeast because Ascension falls there in 2026, and 4-12 likewise for
 *  Pascha — contaminating our half of the comparison exactly the way an
 *  unaggregated feast_level contaminates orthocal's. Four findings were pure
 *  artifacts of that before this was symmetric. */
function ourRank(md, years) {
  const [m, d] = md.split('-').map(Number);
  let best = null;
  for (const y of years) {
    // Skip Feb 29 in non-leap years.
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) continue;
    let r = null;
    try { r = getFeastRank(dt, 'new') || null; } catch (_) { r = null; }
    const score = RANK_ORDER[r] ?? 0;
    if (best === null || score < best.score) best = { rank: r, score };
  }
  return best ? best.rank : null;
}

function computeFindings() {
  const { byMD, years } = collectFixedLevels();
  const findings = [];

  for (const entry of [...byMD.values()].sort((a, b) => {
    const [am, ad] = a.md.split('-').map(Number);
    const [bm, bd] = b.md.split('-').map(Number);
    return am - bm || ad - bd;
  })) {
    const expected = levelToRank(entry.level);
    const actual   = ourRank(entry.md, years);

    // Only rank-driving disagreements matter. A date orthocal puts below
    // polyeleos is not this oracle's business — `expected` is null there, and we
    // do not police our own 'sixStichera'/null.
    if (!expected && !['vigil', 'polyeleos', 'greatFeast'].includes(actual)) continue;
    if (expected === actual) continue;

    findings.push({
      md:       entry.md,
      expected: expected || '(below polyeleos)',
      actual:   actual || '(none)',
      level:    entry.level,
      kind:     !expected ? 'we-over-rank'
              : !actual || actual === 'sixStichera' ? 'missing-rank'
              : 'rank-mismatch',
      title:    modalTitle(entry).slice(0, 70),
      ...(() => {
        const t = triage(entry.md, modalTitle(entry), referenceIso(entry));
        return { triage: t.type, principal: t.principal,
                 blockers: t.blockers || undefined, note: t.note || undefined };
      })(),
    });
  }
  return { findings, years };
}

/** A year in which this month-day was NOT masked by the moveable cycle — i.e.
 *  one whose feast_level equals the fixed-date floor. Evaluating the principal in
 *  a colliding year is how phantom findings appear: on 2026-05-07 the picker
 *  lands on the Apparition of the Sign of the Cross and St Alexis Toth looks
 *  buried, when in a clean year he is already the principal. That mistake was
 *  made three times before this was encoded. */
function referenceIso(entry) {
  const clean = entry.years.filter(y => y.level === entry.level);
  const modal = modalTitle(entry);
  return (clean.find(y => y.title === modal) || clean[0] || entry.years[0]).iso;
}

/** Triage a finding against the menaion: is the OCA-named saint already our
 *  principal (Type A — the rank entry is all that is missing), or is something
 *  else pinned (Type B — a picker/override problem)? Also reports the two things
 *  that block a rank entry: a null saint_type and absent stichera. */
function triage(md, ocaTitle, iso) {
  try {
    const { getMenaionRanked } = require(path.join(ROOT, 'server-lib', 'sources', 'menaion'));
    const { pickPrincipalByOrthocalOrder, applyPrincipalOverride, loadOrthocalForDate } =
      require(path.join(ROOT, 'server-lib', 'sources', 'menaion-principal'));
    const [m, d] = md.split('-').map(Number);
    const r = getMenaionRanked(m, d);
    if (!r || !r.notable || !r.notable.length) return { type: '?', note: 'no commemorations' };
    let p = pickPrincipalByOrthocalOrder(r.notable, loadOrthocalForDate(iso), r.principal);
    p = applyPrincipalOverride(m, d, r.all, p);
    if (!p) return { type: '?', note: 'no principal' };

    const norm = (x) => String(x).toLowerCase().replace(/[^a-z ]/g, ' ');
    const toks = (x) => new Set(norm(x).split(' ').filter(w => w.length > 4));
    const A = toks(ocaTitle), B = toks(p.title);
    let shared = 0; for (const t of A) if (B.has(t)) shared++;

    const blockers = [];
    if (!p.saint_type)  blockers.push('no saint_type');
    if (!p.hasStichera) blockers.push('no stichera');

    // If the resolved principal is itself a moveable-cycle title, no clean year
    // was available and the comparison is inconclusive — report '?' rather than
    // a confident Type B. Calling these "wrong principal" is precisely the
    // phantom finding this triage exists to prevent; 4-6 and 4-7 land on Great
    // and Holy Monday and Tuesday in every cached year at the floor level.
    const MOVEABLE = /^(Sunday|Saturday of|Great and Holy|Memorial Saturday|Bright |HOLY PASCHA|Holy Pentecost|Antipascha)/i;
    if (shared === 0 && MOVEABLE.test(p.title)) {
      return { type: '?', principal: p.title,
               note: 'no moveable-free year in the cache — inconclusive',
               blockers: blockers.length ? blockers.join(', ') : null };
    }
    return {
      type: shared > 0 ? 'A' : 'B',
      principal: p.title,
      blockers: blockers.length ? blockers.join(', ') : null,
    };
  } catch (_) { return { type: '?', note: 'triage failed' }; }
}

/** Most frequent summary_title for a month-day across the cached years. */
function modalTitle(entry) {
  let best = '', n = -1;
  for (const [t, c] of entry.titles) if (c > n) { best = t; n = c; }
  return best;
}

function key(f) { return `${f.md}|${f.expected}|${f.actual}`; }

function report(findings, years) {
  console.log(`Rank coverage vs OCA calendar (orthocal years ${years[0]}-${years[years.length - 1]}):`);
  const byKind = {};
  for (const f of findings) (byKind[f.kind] = byKind[f.kind] || []).push(f);
  for (const kind of ['missing-rank', 'rank-mismatch', 'we-over-rank']) {
    const list = byKind[kind] || [];
    if (!list.length) continue;
    console.log(`\n  ${kind} (${list.length}):`);
    for (const f of list) {
      const tag = f.triage === 'A' ? 'A ' : f.triage === 'B' ? 'B!' : '? ';
      const blk = f.blockers ? `  [${f.blockers}]` : '';
      console.log(`    ${tag} ${f.md.padEnd(6)} want ${f.expected.padEnd(11)} have ${f.actual.padEnd(13)} ${f.title}${blk}`);
      if (f.triage === 'B') console.log(`         principal is "${f.principal}"`);
      if (f.triage === '?' && f.note) console.log(`         ${f.note} (principal reads "${f.principal}")`);
    }
  }
  if (!findings.length) console.log('  clean — every rank-driving date agrees.');
}

const { findings, years } = computeFindings();

if (captureBaseline) {
  // Deterministic on purpose: no timestamp, so re-capturing an unchanged tree
  // produces a byte-identical file and the diff stays reviewable.
  const out = { _note: 'Rank coverage baseline. Keyed by month-day; year-independent. '
                     + 'Regenerate with: node scripts/rank-coverage.js --capture-baseline <file>',
                orthocalYears: years,
                findings };
  fs.writeFileSync(captureBaseline, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${findings.length} finding(s) to ${captureBaseline}`);
  report(findings, years);
  process.exit(0);
}

if (checkBaseline) {
  if (!fs.existsSync(checkBaseline)) {
    console.error(`rank-coverage: baseline not found: ${checkBaseline}`);
    process.exit(1);
  }
  const base = JSON.parse(fs.readFileSync(checkBaseline, 'utf8'));
  const baseKeys = new Set((base.findings || []).map(key));
  const nowKeys  = new Set(findings.map(key));

  const added   = findings.filter(f => !baseKeys.has(key(f)));
  const removed = (base.findings || []).filter(f => !nowKeys.has(key(f)));

  console.log(`Rank coverage check vs ${checkBaseline}:`);
  console.log(`  baseline: ${(base.findings || []).length} · current: ${findings.length}`);
  console.log(`  NEW: ${added.length} · resolved-since-baseline: ${removed.length}`);

  if (removed.length) {
    console.log('\n  resolved (refresh the baseline when convenient):');
    removed.forEach(f => console.log(`    ${f.md.padEnd(6)} ${f.expected} — ${f.title}`));
  }
  if (added.length) {
    console.log('\n  NEW divergence:');
    added.forEach(f => console.log(`    ${f.md.padEnd(6)} want ${f.expected.padEnd(11)} have ${f.actual.padEnd(13)} ${f.title}`));
    console.log('\nrank-coverage: FAIL — a rank changed without the baseline being updated.');
    process.exitCode = 2;
    return;
  }
  console.log('\nNo new divergence. ✓');
  if (verbose) report(findings, years);
  return;
}

report(findings, years);
