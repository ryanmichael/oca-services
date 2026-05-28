#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { sweep } = require('./runner.js');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; }
    else { args[key] = next; i++; }
  }
  return args;
}

function listFrom(v) {
  if (!v || v === true) return null;
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

function datesForYear(year) {
  const out = [];
  const d   = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function fmtFinding(f) {
  const line = `- ${f.date} ${f.service} — ${f.message}`;
  return f.hint ? `${line}\n  hint: ${f.hint}` : line;
}

function writeReports(args, dates, services, result) {
  const stats = { high: 0, medium: 0, low: 0, suppressed: result.suppressed.length };
  for (const f of result.findings) stats[f.severity] = (stats[f.severity] || 0) + 1;

  const lines = [];
  lines.push(`# Audit Report — ${new Date().toISOString().slice(0, 19).replace('T', ' ')}Z`);
  lines.push('');
  lines.push(`Scope: ${dates.length} date(s) × ${services.length} service(s)`);
  lines.push(`Rules enabled: ${result.rules.length}`);
  lines.push(`Findings: ${result.findings.length}  (high=${stats.high}, medium=${stats.medium}, low=${stats.low})`);
  lines.push(`Suppressed (allowlist): ${stats.suppressed}`);
  lines.push('');

  for (const sev of ['high', 'medium', 'low']) {
    const items = result.findings.filter(f => f.severity === sev);
    if (!items.length) continue;
    lines.push(`## ${sev[0].toUpperCase()}${sev.slice(1)} severity (${items.length})`);
    lines.push('');
    const byRule = items.reduce((m, f) => { (m[f.rule] = m[f.rule] || []).push(f); return m; }, {});
    for (const [id, group] of Object.entries(byRule)) {
      lines.push(`### ${id}`);
      for (const f of group) lines.push(fmtFinding(f));
      lines.push('');
    }
  }

  if (result.suppressed.length) {
    lines.push(`## Suppressed (${result.suppressed.length})`);
    const byKind = result.suppressed.reduce((m, f) => {
      const k = `${f.suppressedBy.kind}:${f.suppressedBy.id || f.suppressedBy.reason || ''}`;
      m[k] = (m[k] || 0) + 1; return m;
    }, {});
    for (const [k, n] of Object.entries(byKind)) lines.push(`- ${n} × ${k}`);
    lines.push('');
  }

  const outDir = path.join(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'latest.md'), lines.join('\n'));
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    scope: { dates: dates.length, services: services.length, rules: result.rules.length },
    stats,
    findings:   result.findings.map(({ ctx, ...rest }) => rest),
    suppressed: result.suppressed.map(({ ctx, ...rest }) => rest),
  }, null, 2));

  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let dates;
  if (args.date)       dates = [args.date];
  else if (args.dates) dates = listFrom(args.dates);
  else if (args.year)  dates = datesForYear(parseInt(args.year, 10));
  else { console.error('Provide --date YYYY-MM-DD, --dates a,b,c, or --year YYYY'); process.exit(1); }

  const services     = listFrom(args.services) || ['vespers', 'matins', 'liturgy'];
  const ruleFilter   = listFrom(args.rules);
  const allowlistOn  = !args['no-allowlist'];
  const httpBase     = args['http-base'] || (args.http ? 'http://localhost:3000' : null);

  console.log(`Auditing ${dates.length} date(s) × ${services.length} service(s)${httpBase ? ` (assembled via ${httpBase})` : ''}…`);

  const result = await sweep({ dates, services, ruleFilter, allowlistOn, httpBase });
  const stats  = writeReports(args, dates, services, result);

  console.log(`Done. high=${stats.high} medium=${stats.medium} low=${stats.low} suppressed=${stats.suppressed}`);
  console.log(`Report: audit/reports/latest.md`);

  if (args.strict && stats.high > 0) process.exit(2);
}

main().catch(e => { console.error(e); process.exit(1); });
