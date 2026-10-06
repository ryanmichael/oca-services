'use strict';

const fs   = require('fs');
const path = require('path');
const { buildContext } = require('./context.js');
const { fetchAssembled } = require('./fetch-assembled.js');

function loadRules(filter) {
  const dir   = path.join(__dirname, 'rules');
  const rules = [];
  for (const family of fs.readdirSync(dir)) {
    const familyDir = path.join(dir, family);
    if (!fs.statSync(familyDir).isDirectory()) continue;
    for (const file of fs.readdirSync(familyDir)) {
      if (!file.endsWith('.js')) continue;
      const rule = require(path.join(familyDir, file));
      if (filter && !filter.includes(rule.id)) continue;
      rules.push(rule);
    }
  }
  return rules;
}

function loadAllowlist() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'known-issues.json'), 'utf8'));
  } catch (_) {
    return { parishOverrides: [], trackedGaps: [], knownFailures: [] };
  }
}

function suppressionFor(finding, allowlist) {
  for (const p of allowlist.parishOverrides || []) {
    if (p.id !== finding.rule) continue;
    const a = p.appliesTo || {};
    if (a.season  && !a.season.includes(finding.ctx.season)) continue;
    if (a.service && a.service !== finding.ctx.service)      continue;
    return { kind: 'parishOverride', id: p.id, reason: p.reason };
  }
  for (const k of allowlist.knownFailures || []) {
    if (k.rule !== finding.rule) continue;
    if (!k.dates.includes(finding.ctx.date)) continue;
    return { kind: 'knownFailure', reason: k.reason };
  }
  return null;
}

/**
 * Run every applicable rule over every (date, service).
 *
 * `offline: true` restricts the sweep to rules that need no assembled output and
 * SAYS SO in the coverage it returns. Without it, a sweep that would skip
 * `needsAssembled` rules for want of a server refuses to run at all — see
 * ./fetch-assembled.js for why that refusal exists.
 *
 * Returns `coverage` alongside the findings, because "no findings" is only
 * meaningful next to "and this is how much actually ran".
 */
async function sweep({ dates, services, ruleFilter, allowlistOn, httpBase, offline = false }) {
  const allRules  = loadRules(ruleFilter);
  const allowlist = allowlistOn ? loadAllowlist()
                                : { parishOverrides: [], trackedGaps: [], knownFailures: [] };
  const findings   = [];
  const suppressed = [];

  const needsHttp = allRules.filter(r => r.needsAssembled);
  const rules     = offline ? allRules.filter(r => !r.needsAssembled) : allRules;

  // Fail closed. A sweep that silently drops 122 of 131 rules is the defect
  // this guard exists to prevent, and it shipped for a year without it.
  if (!httpBase && !offline && needsHttp.length) {
    throw new Error(
      `audit: ${needsHttp.length} of ${allRules.length} rules need assembled output and no ` +
      `--http was given, so they would all be skipped silently. Start the server and pass ` +
      `--http http://localhost:3000, or pass --offline to run the ` +
      `${allRules.length - needsHttp.length} server-free rules and have the report say so.`);
  }

  const coverage = {
    rulesLoaded:      allRules.length,
    rulesEligible:    rules.length,
    rulesNeedingHttp: needsHttp.length,
    offline,
    httpBase:         httpBase || null,
    evaluations:      0,   // rule × date × service checks that actually ran
    slotsConsidered:  0,   // date × service pairs with at least one applicable rule
    notServed:        0,
    serverErrors:     [],
    skippedNoAssembled: 0,
  };

  for (const date of dates) {
    for (const service of services) {
      const ctx = buildContext(date, service);
      if (ctx.calendarEntry?._error) continue;
      if (!ctx.calendarEntry) continue;

      const applicable = rules.filter(r => !r.appliesTo || r.appliesTo(ctx));
      if (!applicable.length) continue;
      coverage.slotsConsidered++;

      // Lazy-fetch assembled output only if a rule needs it.
      if (applicable.some(r => r.needsAssembled) && httpBase) {
        const res = await fetchAssembled(httpBase, service, date);   // throws if unreachable
        if (res.ok) {
          ctx.assembled = res.assembled;
        } else if (res.reason === 'server-error') {
          // The service failed to render. Previously indistinguishable from
          // "not appointed today", which is how a 500 could read as clean.
          coverage.serverErrors.push({ date, service, status: res.status });
          findings.push({
            rule: 'AUDIT-render-failed', family: 'availability', severity: 'high',
            date, service, ctx,
            message: `The service failed to render — HTTP ${res.status} from /api/. ` +
                     `No rule could be evaluated for this date.`,
            hint: 'Check the server log for this date. A 5xx here used to be reported as ' +
                  'silence, so a date that cannot render looked identical to a clean one.',
          });
        } else {
          coverage.notServed++;
        }
      }

      for (const rule of applicable) {
        if (rule.needsAssembled && !ctx.assembled) { coverage.skippedNoAssembled++; continue; }
        coverage.evaluations++;
        let issues;
        try { issues = rule.check(ctx) || []; }
        catch (e) { issues = [{ message: `Rule errored: ${e.message}` }]; }
        for (const issue of issues) {
          const f = {
            rule: rule.id, family: rule.family, severity: rule.severity,
            date, service, ctx, ...issue,
          };
          const supp = suppressionFor(f, allowlist);
          if (supp) suppressed.push({ ...f, suppressedBy: supp });
          else      findings.push(f);
        }
      }
    }
  }

  return { rules, findings, suppressed, coverage };
}

module.exports = { sweep };
