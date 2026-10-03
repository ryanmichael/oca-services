#!/usr/bin/env node
'use strict';

// CLI: node scripts/audit-upcoming.js [--from YYYY-MM-DD]
//
// Runs the LLM judge against the upcoming weekend's services — Saturday-eve
// Great Vespers + Sunday Divine Liturgy. Exits non-zero if any service has
// findings, so a CI cron can surface them via issue-open before parish
// Saturday-morning prep.
//
// Exit 4 is distinct and means NO VERDICT WAS PRODUCED — the judge could not
// run. Callers must branch on it separately: "the judge is broken" is not
// "the judge found things". See the EXIT table in audit/llm-judge.js.
//
// Requires ANTHROPIC_API_KEY (loaded from .env or env). Assumes the dev
// server is running on http://localhost:3000.

const { execFileSync } = require('child_process');
const path = require('path');
const { EXIT } = require(path.join(__dirname, '..', 'audit', 'llm-judge.js'));

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
    case EXIT.CLEAN:       return 'clean';
    case EXIT.FINDINGS:    return 'medium/low findings';
    case EXIT.HIGH:        return 'high-severity findings';
    case EXIT.UNPARSEABLE: return 'NO VERDICT — model answer could not be parsed';
    case EXIT.DID_NOT_RUN: return 'NO VERDICT — the judge could not run (API/setup error)';
    default:               return `NO VERDICT — unexpected exit=${exitCode}`;
  }
}

// A run that produced no verdict tells us nothing about the service. It must
// never be aggregated as a finding, and must never be aggregated as clean.
const producedNoVerdict = (code) => code === EXIT.UNPARSEABLE || code === EXIT.DID_NOT_RUN
  || !Object.values(EXIT).includes(code);

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
  // Order matters: a broken judge outranks everything, because the other
  // services' verdicts cannot be trusted to mean anything either. Until
  // 2026-10-02 this collapsed every non-zero code to 1, so an empty Anthropic
  // credit balance was reported to the parish cron as weekend findings.
  const broken = results.filter(r => producedNoVerdict(r.exitCode));
  if (broken.length > 0) {
    console.error(`\n${broken.length} of ${results.length} service(s) produced NO VERDICT — ` +
                  'the judge did not run. This is NOT a clean weekend and NOT a findings weekend.');
    for (const r of broken) console.error(`  ${r.service} ${r.date}: ${describe(r.exitCode)}`);
    process.exit(EXIT.DID_NOT_RUN);
  }
  if (results.some(r => r.exitCode === EXIT.HIGH)) process.exit(EXIT.HIGH);
  if (results.some(r => r.exitCode === EXIT.FINDINGS)) process.exit(EXIT.FINDINGS);
  process.exit(EXIT.CLEAN);
})();
