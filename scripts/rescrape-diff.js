#!/usr/bin/env node
'use strict';

// Rescrape harness — Phase 2 differ + report.
//
// Cross-checks every `oca-menaion` / `oca-feast` stichera row against a fresh
// re-parse of the OCA DOCX that fed it. For each DB row we search the freshly
// parsed pool for the sticheron by NORMALIZED TEXT (order/attribution in the
// DOCX are unreliable on multi-commemoration days, but the hymn text is not),
// then classify the outcome.
//
//   node scripts/rescrape-diff.js --date 2024-06-29
//   node scripts/rescrape-diff.js --all
//   node scripts/rescrape-diff.js --all --limit 20
//   node scripts/rescrape-diff.js --all --pronoun   # normalize yy/tt on both sides
//   node scripts/rescrape-diff.js --all --capture-baseline audit/rescrape-baseline.json
//   node scripts/rescrape-diff.js --all --check audit/rescrape-baseline.json  # exit 2 on NEW drift
//
// Reports: audit/reports/rescrape-diff-<date>.md + rescrape-diff-summary.md
// Read-only against storage/oca.db. See docs/rescrape-harness-design.md.

const fs   = require('fs');
const path = require('path');
const { parseDocx } = require('../server-lib/parsers/docx-tuples');
const { normalizeText, hasGluedPunctuation } = require('../server-lib/parsers/normalize');

const ROOT       = path.resolve(__dirname, '..');
const CACHE_DIR  = path.join(ROOT, 'reference', 'scrape');
const REPORT_DIR = path.join(ROOT, 'audit', 'reports');

// Similarity thresholds (normalized Levenshtein ratio on best-matched pair).
const EXACT      = 1.0;
const CLOSE_MIN  = 0.70;   // ≥ this but < EXACT → class B (found, text differs)
// < CLOSE_MIN → class C (DB text effectively absent from the fresh DOCX)

function parseArgs(argv) {
  const args = { date: null, all: false, limit: null, pronoun: false,
                 captureBaseline: null, check: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--pronoun') args.pronoun = true;
    else if (a === '--capture-baseline') args.captureBaseline = argv[++i];
    else if (a === '--check') args.check = argv[++i];
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

// A stable per-finding key: (date, dbRowId, class). Content classes only
// (B/C) — A/E/G are low-severity or already zero and would add baseline churn.
function findingKey(date, f) {
  return `${date}#${f.row.id}:${f.cls}`;
}

// Bounded Levenshtein → similarity ratio in [0,1].
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// Token-set overlap (cheap pre-filter to pick candidate before Levenshtein).
function tokenJaccard(aTokens, bTokens) {
  let inter = 0;
  for (const t of aTokens) if (bTokens.has(t)) inter++;
  const union = aTokens.size + bTokens.size - inter;
  return union === 0 ? 0 : inter / union;
}

function tokenSet(s) {
  return new Set(s.split(' ').filter(Boolean));
}

function loadDbRows(db, sourceDate) {
  return db.prepare(
    `SELECT s.id, s.commemoration_id, c.title AS commemoration_title,
            s.section, s."order" AS ord, s.tone, s.label, s.text, s.source
       FROM stichera s
       JOIN commemorations c ON s.commemoration_id = c.id
      WHERE s.source_date = ? AND s.source LIKE 'oca%'
      ORDER BY s.section, s."order"`
  ).all(sourceDate);
}

function inventoryDates(db) {
  return db.prepare(
    `SELECT DISTINCT source_date FROM stichera
      WHERE source LIKE 'oca%' AND source_date IS NOT NULL
      ORDER BY source_date`
  ).all().map(r => r.source_date);
}

// Compare one date. Returns { date, docxMissing, findings[], counts }.
function diffDate(db, date, opts) {
  const docxPath = path.join(CACHE_DIR, `${date}.docx`);
  if (!fs.existsSync(docxPath)) {
    return { date, docxMissing: true, findings: [], counts: { db: null } };
  }
  const dbRows = loadDbRows(db, date);
  const pool = parseDocx(docxPath, { sourceDate: date });

  const nOpts = { pronoun: opts.pronoun };
  const poolNorm = pool.map(p => {
    const text = normalizeText(p.text, nOpts);
    return { ...p, norm: text, tokens: tokenSet(text) };
  });

  const findings = [];
  const counts = { db: dbRows.length, pool: pool.length, clean: 0, B: 0, C: 0, E: 0, A: 0, G: 0 };

  for (const row of dbRows) {
    // Cosmetic class G — glued punctuation in the raw DB text (independent of
    // the content match, which normalizes it away).
    if (hasGluedPunctuation(row.text)) {
      counts.G++;
      findings.push({ cls: 'G', row });
    }

    const dbNorm = normalizeText(row.text, nOpts);
    const dbTokens = tokenSet(dbNorm);

    // Pick the best candidate by cheap token overlap, then score it precisely.
    let best = null, bestJac = -1;
    for (const p of poolNorm) {
      const jac = tokenJaccard(dbTokens, p.tokens);
      if (jac > bestJac) { bestJac = jac; best = p; }
    }
    const sim = best ? similarity(dbNorm, best.norm) : 0;

    if (sim >= EXACT) {
      counts.clean++;
      // Text agrees exactly — check section (class A soft) & tone (class E).
      if (best.section && row.section && best.section !== row.section) {
        counts.A++;
        findings.push({ cls: 'A', row, best, sim, note:
          `text matches but DOCX section=${best.section} vs DB section=${row.section}` });
      } else if (best.tone != null && row.tone != null && best.tone !== row.tone) {
        counts.E++;
        findings.push({ cls: 'E', row, best, sim, note:
          `text matches but DOCX tone=${best.tone} vs DB tone=${row.tone}` });
      }
      continue;
    }
    if (sim >= CLOSE_MIN) {
      counts.B++;
      const dist = levenshtein(dbNorm, best.norm);
      const sub = dist < 5 ? 'typo' : dist <= 50 ? 'phrase' : 'wholesale';
      findings.push({ cls: 'B', row, best, sim, dist, sub });
      continue;
    }
    counts.C++;
    findings.push({ cls: 'C', row, best, sim });
  }
  return { date, docxMissing: false, findings, counts };
}

function fmtRow(row) {
  return `#${row.id} [${row.source} ${row.section}·${row.ord} T${row.tone ?? '-'}] ` +
         `«${row.commemoration_title}»`;
}

function truncate(s, n = 140) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function writeDateReport(result) {
  const { date, findings, counts } = result;
  const lines = [];
  lines.push(`# Rescrape diff — ${date}`);
  lines.push('');
  lines.push(`DB rows: ${counts.db} · DOCX pool: ${counts.pool} · ` +
    `clean: ${counts.clean} · B(text): ${counts.B} · C(absent): ${counts.C} · ` +
    `A(section): ${counts.A} · E(tone): ${counts.E} · G(glued): ${counts.G}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('_No findings — every DB row matched a fresh-DOCX sticheron exactly._');
  }
  const byCls = { B: [], C: [], A: [], E: [], G: [] };
  for (const f of findings) byCls[f.cls].push(f);

  if (byCls.B.length) {
    lines.push('## B · Text differs');
    for (const f of byCls.B) {
      lines.push(`- ${fmtRow(f.row)} — **${f.sub}** (sim ${f.sim.toFixed(3)}, edit ${f.dist})`);
      lines.push(`    - DB:   ${truncate(f.row.text)}`);
      lines.push(`    - DOCX: ${truncate(f.best.text)}`);
    }
    lines.push('');
  }
  if (byCls.C.length) {
    lines.push('## C · DB text absent from fresh DOCX');
    for (const f of byCls.C) {
      lines.push(`- ${fmtRow(f.row)} (best sim ${f.sim.toFixed(3)})`);
      lines.push(`    - DB:   ${truncate(f.row.text)}`);
      if (f.best) lines.push(`    - nearest DOCX: ${truncate(f.best.text)}`);
    }
    lines.push('');
  }
  if (byCls.A.length) {
    lines.push('## A · Section mismatch (text agrees)');
    for (const f of byCls.A) lines.push(`- ${fmtRow(f.row)} — ${f.note}`);
    lines.push('');
  }
  if (byCls.E.length) {
    lines.push('## E · Tone mismatch (text agrees)');
    for (const f of byCls.E) lines.push(`- ${fmtRow(f.row)} — ${f.note}`);
    lines.push('');
  }
  if (byCls.G.length) {
    lines.push('## G · Cosmetic — missing space after punctuation (glued words)');
    for (const f of byCls.G) {
      lines.push(`- ${fmtRow(f.row)}`);
      lines.push(`    - ${truncate(f.row.text)}`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(REPORT_DIR, `rescrape-diff-${date}.md`), lines.join('\n'));
}

function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const { openDb } = require('../server-lib/cache/sqlite');
  const db = openDb();
  if (!db) throw new Error('storage/oca.db not found');

  try {
    let dates;
    if (args.date) dates = [args.date];
    else if (args.all) dates = inventoryDates(db);
    else throw new Error('Specify --date <YYYY-MM-DD> or --all');
    if (args.limit) dates = dates.slice(0, args.limit);

    const agg = { dates: 0, docxMissing: 0, db: 0, clean: 0, B: 0, C: 0, A: 0, E: 0, G: 0 };
    const perDate = [];
    const findingKeys = [];   // content-drift keys (B/C) for baseline / --check

    for (const date of dates) {
      const result = diffDate(db, date, args);
      if (result.docxMissing) { agg.docxMissing++; continue; }
      if (!args.captureBaseline && !args.check) writeDateReport(result);
      agg.dates++;
      for (const k of ['db', 'clean', 'B', 'C', 'A', 'E', 'G']) agg[k] += result.counts[k];
      for (const f of result.findings) if (f.cls === 'B' || f.cls === 'C') findingKeys.push(findingKey(date, f));
      const nFind = result.findings.length;
      perDate.push({ date, nFind, counts: result.counts });
      if (!args.captureBaseline && !args.check && (args.date || nFind > 0)) {
        console.log(`${date}: db=${result.counts.db} clean=${result.counts.clean} ` +
          `B=${result.counts.B} C=${result.counts.C} A=${result.counts.A} E=${result.counts.E} G=${result.counts.G}`);
      }
    }

    // Baseline capture: write the current content-drift finding-key set.
    if (args.captureBaseline) {
      const baseline = { capturedRows: agg.db, keys: findingKeys.sort() };
      fs.writeFileSync(args.captureBaseline, JSON.stringify(baseline, null, 0) + '\n');
      console.log(`Baseline captured: ${findingKeys.length} B/C keys → ${path.relative(ROOT, args.captureBaseline)}`);
      return;
    }

    // Check mode: alert only on NEW findings vs the committed baseline.
    if (args.check) {
      const baseline = JSON.parse(fs.readFileSync(args.check, 'utf8'));
      const known = new Set(baseline.keys);
      const now = new Set(findingKeys);
      const added = findingKeys.filter(k => !known.has(k));
      const removed = baseline.keys.filter(k => !now.has(k));
      console.log(`Rescrape drift check vs ${path.relative(ROOT, args.check)}:`);
      console.log(`  baseline B/C findings: ${baseline.keys.length} · current: ${findingKeys.length}`);
      console.log(`  NEW (drift): ${added.length} · resolved-since-baseline: ${removed.length}`);
      if (removed.length) console.log(`  (${removed.length} baseline findings gone — a fix landed; refresh the baseline when convenient.)`);
      if (added.length) {
        console.log('\nNEW findings (investigate — DB or OCA-source drift since baseline):');
        added.forEach(k => console.log(`  + ${k}`));
        process.exitCode = 2;
      } else {
        console.log('\nNo new drift. ✓');
      }
      return;
    }

    // Aggregate summary (only for --all).
    if (args.all) {
      const summary = [];
      summary.push('# Rescrape diff — aggregate summary');
      summary.push('');
      summary.push(`Dates diffed: ${agg.dates} · DOCX missing: ${agg.docxMissing}`);
      summary.push(`DB rows checked: ${agg.db}`);
      summary.push(`Clean (exact text): ${agg.clean} (${(100*agg.clean/Math.max(1,agg.db)).toFixed(1)}%)`);
      summary.push(`B text-differs: ${agg.B} · C absent: ${agg.C} · A section: ${agg.A} · E tone: ${agg.E} · G glued: ${agg.G}`);
      summary.push('');
      summary.push('## Dates with content findings (B+C, most first)');
      summary.push('');
      summary.push('| date | db | clean | B | C | A | E | G |');
      summary.push('|---|--:|--:|--:|--:|--:|--:|--:|');
      perDate.filter(d => (d.counts.B + d.counts.C) > 0)
        .sort((a, b) => (b.counts.B + b.counts.C) - (a.counts.B + a.counts.C))
        .forEach(d => summary.push(
          `| ${d.date} | ${d.counts.db} | ${d.counts.clean} | ${d.counts.B} | ${d.counts.C} | ${d.counts.A} | ${d.counts.E} | ${d.counts.G} |`));
      fs.writeFileSync(path.join(REPORT_DIR, 'rescrape-diff-summary.md'), summary.join('\n'));
      console.log('');
      console.log(`Aggregate: ${agg.db} rows · ${agg.clean} clean (${(100*agg.clean/Math.max(1,agg.db)).toFixed(1)}%) · ` +
        `B=${agg.B} C=${agg.C} A=${agg.A} E=${agg.E} G=${agg.G}`);
      console.log(`Summary: ${path.relative(ROOT, path.join(REPORT_DIR, 'rescrape-diff-summary.md'))}`);
    }
  } finally {
    db.close();
  }
}

main();
