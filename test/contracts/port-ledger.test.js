'use strict';

/**
 * Feature contract: no two test files listen on the same port.
 *
 * 55 contract tests each spawn their own `node server.js`. The port each uses
 * was hand-maintained in a comment ledger — "distinct: 3122 was the last
 * taken" — and the ledger had drifted: TWELVE ports were shared by 25 files,
 * including `vigil-composition.test.js` on 3105, whose own comment read
 * "distinct: see sibling contract tests for the port ledger".
 *
 * It stayed invisible because `--test-concurrency=1` runs files one at a time,
 * and a killed server releases its port in ~2ms. The collision only bites when
 * TWO suite runs overlap — which is exactly what happens when a push is
 * retried while a previous pre-push hook is still alive. Two of four push
 * attempts died this way on 2026-11-09..12, costing ~10 minutes each.
 *
 * The failure was also maximally unhelpful. The second server exits with
 * **code 0** on EADDRINUSE, so an exit-code check would not catch it; the test
 * then waits out its 15-20s ceiling and reports "server did not start",
 * naming neither the port nor the conflict. Measured, not guessed:
 *
 *     second server on the same port exited with code 0
 *     reason: EADDRINUSE: address already in use :::3142
 *
 * A hand-maintained ledger will drift again. This asserts it instead.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DIRS = [path.join(ROOT, 'test'), path.join(ROOT, 'test', 'contracts')];

/** Every test file that pins a listening port, with the port it pins. */
function declaredPorts() {
  const out = [];
  for (const dir of DIRS) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.test.js')) continue;
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) continue;
      const m = fs.readFileSync(full, 'utf8').match(/^const PORT = (\d+)/m);
      if (m) out.push({ file: path.relative(ROOT, full), port: Number(m[1]) });
    }
  }
  return out;
}

describe('Feature contract: the test port ledger', () => {

  it('INV-1: no port is claimed by two test files', () => {
    // FALSIFIED BY: pointing any two test files at the same port — this names
    // both of them. It is the whole reason the file exists.
    const byPort = new Map();
    for (const { file, port } of declaredPorts()) {
      if (!byPort.has(port)) byPort.set(port, []);
      byPort.get(port).push(file);
    }
    const clashes = [...byPort.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([port, files]) => `  :${port} — ${files.join(', ')}`);
    assert.deepEqual(clashes, [],
      `test files share a port; overlapping suite runs will fail with EADDRINUSE ` +
      `and report only "server did not start":\n${clashes.join('\n')}`);
  });

  it('INV-2: no test squats on the dev port', () => {
    // 3000 is the development server. A test bound there fails for whoever has
    // the app open, which looks like a broken test rather than a busy port.
    const onDev = declaredPorts().filter(p => p.port === 3000);
    assert.deepEqual(onDev.map(p => p.file), []);
  });

  it('INV-3: the ledger is actually populated', () => {
    // Guards the guard: if the regex stops matching — someone switches to
    // `let PORT` or computes it — INV-1 would pass over an empty set and
    // assert nothing. A rule that cannot fire is worse than no rule.
    const ports = declaredPorts();
    assert.ok(ports.length > 40,
      `only ${ports.length} test files matched the PORT pattern; the detector ` +
      `has probably stopped seeing them, so INV-1 is asserting nothing`);
  });
});
