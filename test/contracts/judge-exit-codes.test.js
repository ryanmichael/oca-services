'use strict';

/**
 * Feature contract: a judge that did not run is not a judge with findings.
 *
 * On 2026-10-02 the Anthropic credit balance ran out. Both weekend services
 * returned `API 400 ... "Your credit balance is too low to access the Anthropic
 * API"`, and every failure path in llm-judge.js exited 1 — the same code as
 * "low/medium findings". The weekly cron therefore reported
 *
 *     vespers  2026-10-03: medium/low findings
 *     liturgy  2026-10-04: medium/low findings
 *
 * for two services it had never looked at, opened the findings issue, fired the
 * auto-fix agent at report files that were never written, and finished green.
 *
 * The danger is not the wasted run: it is that a dead judge and a judge with
 * real high-severity findings were indistinguishable from outside. Exit 4 now
 * means "no verdict exists".
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const { EXIT } = require(path.join(ROOT, 'audit', 'llm-judge.js'));

/** Run a script with ANTHROPIC_API_KEY removed — the cheapest "cannot run". */
function runWithoutKey(script, args = []) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return spawnSync('node', [path.join(ROOT, script), ...args], {
    cwd: ROOT, env, encoding: 'utf8', timeout: 60000,
  });
}

describe('Feature contract: judge exit codes', () => {
  it('INV-1: the verdict codes and the no-verdict code are distinct', () => {
    assert.deepEqual(EXIT, {
      CLEAN: 0, FINDINGS: 1, HIGH: 2, UNPARSEABLE: 3, DID_NOT_RUN: 4,
    });
    // The specific collision that caused the incident.
    assert.notEqual(EXIT.DID_NOT_RUN, EXIT.FINDINGS);
    assert.notEqual(EXIT.DID_NOT_RUN, EXIT.CLEAN);
  });

  it('INV-2: llm-judge.js exits DID_NOT_RUN when it cannot reach the API', () => {
    const r = runWithoutKey('audit/llm-judge.js', ['--date', '2026-10-03', '--service', 'vespers']);
    assert.equal(r.status, EXIT.DID_NOT_RUN,
      `expected ${EXIT.DID_NOT_RUN}, got ${r.status}. stderr: ${(r.stderr || '').slice(0, 200)}`);
    assert.notEqual(r.status, EXIT.FINDINGS, 'a setup failure must never read as findings');
  });

  it('INV-3: audit-upcoming.js propagates DID_NOT_RUN, not FINDINGS', () => {
    // The exact aggregation bug: it collapsed every non-zero child code to 1.
    const r = runWithoutKey('scripts/audit-upcoming.js');
    assert.equal(r.status, EXIT.DID_NOT_RUN,
      `expected ${EXIT.DID_NOT_RUN}, got ${r.status}`);
  });

  it('INV-4: the no-verdict summary never uses the word "findings"', () => {
    // The cron pastes this summary into a GitHub issue a human reads at 6am
    // before printing the weekend's service. It said "medium/low findings".
    const r = runWithoutKey('scripts/audit-upcoming.js');
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const summary = out.slice(out.indexOf('── summary ──'));
    assert.ok(summary.includes('NO VERDICT'), `summary must say NO VERDICT:\n${summary.slice(0, 300)}`);
    assert.ok(!/\bfindings\b/.test(summary.split('\n').filter(l => /vespers|liturgy/.test(l)).join('\n')),
      `per-service lines must not claim findings:\n${summary.slice(0, 300)}`);
  });

  it('INV-5: the workflow branches on status, never on outcome', () => {
    // `steps.judge.outcome` collapses every non-zero exit to 'failure', which is
    // what made a dead judge trigger the findings issue and the auto-fix agent.
    const fs = require('node:fs');
    const wf = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'weekly-llm-judge.yml'), 'utf8');

    const conditions = wf.split('\n').filter(l => /steps\.judge\./.test(l) && !/^\s*#/.test(l));
    assert.ok(conditions.length >= 3, 'expected the judge to gate several steps');
    for (const line of conditions) {
      assert.ok(!/steps\.judge\.outcome/.test(line),
        `workflow still gates on steps.judge.outcome: ${line.trim()}`);
    }
    assert.match(wf, /status=broken/, 'the judge step must classify a broken run');
    assert.match(wf, /steps\.judge\.outputs\.status == 'broken'/,
      'a broken judge must drive its own reporting');
  });

  it('INV-6: a broken judge fails the run', () => {
    // The 2026-10-02 run reported SUCCESS while nothing had been judged.
    const fs = require('node:fs');
    const wf = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'weekly-llm-judge.yml'), 'utf8');
    const idx = wf.indexOf("Fail the run when nothing was judged");
    assert.ok(idx !== -1, 'the hard-fail step must exist');
    assert.match(wf.slice(idx), /exit 1/, 'and it must actually fail');
  });
});
