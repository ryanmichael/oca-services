/**
 * Contract: calendar-rules.js output is bit-for-bit stable.
 *
 * Baseline snapshots live in `test/snapshots/`. They are the oracle for the
 * Track D module split — any refactor must preserve every calendar entry and
 * every scalar predicate value across the 4-year (2024–2027) window for both
 * `new` and `old` style.
 *
 * Regenerate baselines after an intentional change:
 *   node scripts/snapshot-calendar-rules.js
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

describe('calendar-rules snapshot', () => {
  it('output matches baselines for 2024–2027 (new + old style)', () => {
    const script = path.join(__dirname, '..', '..', 'scripts', 'snapshot-calendar-rules.js');
    try {
      execFileSync('node', [script, '--check'], { stdio: 'pipe' });
    } catch (e) {
      const out = (e.stdout || '').toString() + (e.stderr || '').toString();
      assert.fail(
        `Calendar-rules output drifted from baselines.\n` +
        `Review the diff. If the change is intentional, regenerate:\n` +
        `  node scripts/snapshot-calendar-rules.js\n\n${out}`
      );
    }
  });
});
