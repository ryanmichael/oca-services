'use strict';

const fs   = require('fs');
const path = require('path');
const { buildContext } = require('./context.js');

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

async function sweep({ dates, services, ruleFilter, allowlistOn, httpBase }) {
  const rules     = loadRules(ruleFilter);
  const allowlist = allowlistOn ? loadAllowlist()
                                : { parishOverrides: [], trackedGaps: [], knownFailures: [] };
  const findings   = [];
  const suppressed = [];

  for (const date of dates) {
    for (const service of services) {
      const ctx = buildContext(date, service);
      if (ctx.calendarEntry?._error) continue;
      if (!ctx.calendarEntry) continue;

      const applicable = rules.filter(r => !r.appliesTo || r.appliesTo(ctx));
      if (!applicable.length) continue;

      // Lazy-fetch assembled output only if a rule needs it.
      const needsAssembled = applicable.some(r => r.needsAssembled);
      if (needsAssembled && httpBase) {
        try {
          const endpoint = service === 'vespers' ? 'service' : service;
          const r = await fetch(`${httpBase}/api/${endpoint}?date=${date}`);
          if (r.ok) ctx.assembled = await r.json();
        } catch (_) { /* leave ctx.assembled undefined */ }
      }

      for (const rule of applicable) {
        if (rule.needsAssembled && !ctx.assembled) continue;
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

  return { rules, findings, suppressed };
}

module.exports = { sweep };
