#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { sweep } = require('./runner.js');
const { buildContext } = require('./context.js');

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

async function fetchAssembled(httpBase, service, date) {
  if (!httpBase) return null;
  try {
    const endpoint = service === 'vespers' ? 'service' : service;
    const r = await fetch(`${httpBase}/api/${endpoint}?date=${date}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

async function writePrintReport(date, services, result, httpBase) {
  const lines = [];
  lines.push(`# Service audit — ${date}`);
  lines.push('');

  let totalGaps = 0;
  const stats = { high: 0, medium: 0, low: 0, suppressed: 0 };

  for (const service of services) {
    const ctx = buildContext(date, service);
    if (!ctx.calendarEntry || ctx.calendarEntry._error) continue;

    const assembled = await fetchAssembled(httpBase, service, date);
    const heading = service[0].toUpperCase() + service.slice(1);
    lines.push(`## ${heading}`);

    if (!assembled || (assembled.blocks || []).length === 0) {
      lines.push(`_not served on this date_`);
      lines.push('');
      continue;
    }

    const findings   = result.findings.filter(f => f.service === service);
    const suppressed = result.suppressed.filter(f => f.service === service);
    const applicable = result.rules.filter(r => !r.appliesTo || r.appliesTo({ ...ctx, assembled }));

    const meta = [];
    if (assembled.tone)             meta.push(`Tone ${assembled.tone}`);
    if (assembled.season)           meta.push(assembled.season);
    if (assembled.liturgicalLabel)  meta.push(assembled.liturgicalLabel);
    if (meta.length) lines.push(`_${meta.join(' · ')} · ${(assembled.blocks || []).length} blocks_`);
    lines.push('');

    if (findings.length === 0) {
      lines.push(`✓ ${applicable.length} rule(s) passed`);
    } else {
      lines.push(`✗ ${findings.length} finding(s) (${applicable.length} rules applicable):`);
      for (const f of findings) {
        lines.push(`  - **[${f.severity}]** ${f.rule} — ${f.message}`);
        if (f.hint) lines.push(`    hint: ${f.hint}`);
        stats[f.severity] = (stats[f.severity] || 0) + 1;
      }
    }

    const provBlocks = (assembled.blocks || []).filter(b => b._source);
    if (provBlocks.length) {
      const bySrc = provBlocks.reduce((m, b) => {
        (m[b._source] = m[b._source] || []).push(b.section || '(unsectioned)');
        return m;
      }, {});
      lines.push('');
      lines.push(`⚠ ${provBlocks.length} provenance gap(s) (non-OCA \`_source\` tags):`);
      for (const [src, sections] of Object.entries(bySrc)) {
        const uniq = [...new Set(sections)];
        lines.push(`  - \`${src}\` × ${sections.length} (${uniq.slice(0, 3).join(', ')}${uniq.length > 3 ? `, +${uniq.length - 3} more` : ''})`);
      }
      totalGaps += provBlocks.length;
    }

    stats.suppressed += suppressed.length;
    if (suppressed.length) lines.push(`🔕 ${suppressed.length} suppressed by allowlist`);
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`**Summary:** ${stats.high} high, ${stats.medium} medium, ${stats.low} low, ${totalGaps} provenance gaps, ${stats.suppressed} suppressed`);

  const outDir = path.join(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const safeDate = date.replace(/[^0-9-]/g, '');
  const outPath = path.join(outDir, `print-${safeDate}.md`);
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`\nReport: ${path.relative(process.cwd(), outPath)}`);
  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let dates;
  if (args.date)       dates = [args.date];
  else if (args.dates) dates = listFrom(args.dates);
  else if (args.year)  dates = datesForYear(parseInt(args.year, 10));
  else { console.error('Provide --date YYYY-MM-DD, --dates a,b,c, or --year YYYY'); process.exit(1); }

  const services     = listFrom(args.services) || ['vespers', 'matins', 'liturgy', 'presanctified'];
  const ruleFilter   = listFrom(args.rules);
  const allowlistOn  = !args['no-allowlist'];
  // --print implies --http (provenance gaps require assembled output).
  const httpBase     =
       (typeof args['http-base'] === 'string' && args['http-base'])
    || (typeof args.http === 'string' && args.http)
    || ((args.http === true || args.print) && 'http://localhost:3000')
    || null;

  if (args.print) {
    if (dates.length !== 1) {
      console.error('--print requires a single --date YYYY-MM-DD');
      process.exit(1);
    }
    const result = await sweep({ dates, services, ruleFilter, allowlistOn, httpBase });
    const stats  = await writePrintReport(dates[0], services, result, httpBase);
    if (args.strict && stats.high > 0) process.exit(2);
    return;
  }

  console.log(`Auditing ${dates.length} date(s) × ${services.length} service(s)${httpBase ? ` (assembled via ${httpBase})` : ''}…`);

  const result = await sweep({ dates, services, ruleFilter, allowlistOn, httpBase });
  const stats  = writeReports(args, dates, services, result);

  console.log(`Done. high=${stats.high} medium=${stats.medium} low=${stats.low} suppressed=${stats.suppressed}`);
  console.log(`Report: audit/reports/latest.md`);

  if (args.strict && stats.high > 0) process.exit(2);
}

main().catch(e => { console.error(e); process.exit(1); });
