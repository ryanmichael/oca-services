#!/usr/bin/env node
'use strict';

// CLI: node scripts/audit-upcoming.js [--from YYYY-MM-DD]
//
// Runs the LLM judge against the upcoming weekend's services — Saturday-eve
// Great Vespers + Sunday Divine Liturgy. Exits non-zero if any service has
// findings, so a CI cron can surface them via issue-open before parish
// Saturday-morning prep.
//
// Requires ANTHROPIC_API_KEY (loaded from .env or env). Assumes the dev
// server is running on http://localhost:3000.

const { execFileSync } = require('child_process');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') out.from = argv[++i];
  }
  return out;
}

function nextSaturday(from) {
  const d = new Date(from + 'T12:00:00Z');
  // 6 = Saturday in UTC. If already Saturday, use it.
  const dow  = d.getUTCDay();
  const diff = (6 - dow + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// llm-judge.js exits with codes that encode finding severity:
//   0 = clean
//   1 = low/medium findings only
//   2 = at least one high-severity finding
//   3 = parse failed (model output truncated or malformed)
function runJudge(date, service) {
  console.log(`\n── judging ${service} for ${date} ──`);
  try {
    execFileSync('node', [
      'audit/llm-judge.js', '--date', date, '--service', service,
      '--http', 'http://localhost:3000',
    ], { stdio: 'inherit' });
    return { date, service, ok: true, exitCode: 0 };
  } catch (err) {
    return { date, service, ok: false, exitCode: err.status ?? 1 };
  }
}

function describe(exitCode) {
  switch (exitCode) {
    case 0: return 'clean';
    case 1: return 'medium/low findings';
    case 2: return 'high-severity findings';
    case 3: return 'parse failed';
    default: return `error (exit=${exitCode})`;
  }
}

(function main() {
  const args      = parseArgs(process.argv.slice(2));
  const from      = args.from || new Date().toISOString().slice(0, 10);
  const sat       = nextSaturday(from);
  const sun       = addDays(sat, 1);

  console.log(`audit:upcoming — Sat=${sat} (Vespers), Sun=${sun} (Liturgy)`);

  const results = [
    runJudge(sat, 'vespers'),
    runJudge(sun, 'liturgy'),
  ];

  console.log('\n── summary ──');
  for (const r of results) {
    console.log(`  ${r.service.padEnd(8)} ${r.date}: ${describe(r.exitCode)}`);
  }
  const failures = results.filter(r => !r.ok);
  process.exit(failures.length > 0 ? 1 : 0);
})();
