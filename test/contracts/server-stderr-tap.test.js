'use strict';

/**
 * Feature contract: a test server's boot failure is never silent.
 *
 * 55 contract tests spawn `node server.js` and poll until it answers. When it
 * never answers they throw "server did not start" — naming neither the port
 * nor the reason. Four pre-push failures across 2026-11-09..12 cost ~10
 * minutes each and three days to diagnose, and the server had been saying
 * exactly what was wrong the whole time, into a pipe nobody read:
 *
 *     Schema migrations failed at boot:
 *     UNIQUE constraint failed: commemorations.month, commemorations.day, ...
 *
 * Two earlier designs were measured and rejected before this one, and the
 * measurements are why this shape:
 *
 *   - keying the message on the child having EXITED: the child does not exit
 *     (`exitCode` null after 6s), so it could never fire;
 *   - attaching the listener inside waitForServer: a listener attached ~1.5s
 *     late captures NOTHING.
 *
 * So the listener must go on at spawn, and wrapping `spawn` once does that for
 * all 58 files without editing any of them.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const TAP = path.join(ROOT, 'test', '_shared', 'server-stderr-tap.js');

// Requiring the tap installs it, which is the point — it is loaded via
// `node --require` in the npm scripts.
const tap = require(TAP);
const cp = require('node:child_process');

/** Spawn a stand-in child and collect what the tap writes to our stderr. */
async function runChild({ args, port, writes }) {
  const captured = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => { captured.push(String(chunk)); return true; };
  try {
    const script = writes.map(w => `process.stderr.write(${JSON.stringify(w + '\n')});`).join('');
    const child = cp.spawn('node', ['-e', script + 'setTimeout(()=>{},300)', ...args],
      { stdio: 'pipe', env: { ...process.env, PORT: String(port) } });
    await new Promise(r => { child.on('exit', r); setTimeout(r, 2500); });
    child.kill();
  } finally {
    process.stderr.write = realWrite;
  }
  return captured.join('');
}

const BOOT_FAILURE = 'Schema migrations failed at boot: UNIQUE constraint failed: commemorations.month';

describe('Feature contract: the server stderr tap', () => {

  it('INV-1: a server boot failure is printed, with its port', async () => {
    // The exact line that stayed invisible for three days.
    // FALSIFIED BY: removing the install() call or the stderr listener — the
    // output goes empty and this fails.
    const out = await runChild({ args: ['server.js'], port: 3123, writes: [BOOT_FAILURE] });
    assert.match(out, /Schema migrations failed at boot/, 'the cause must reach the test output');
    assert.match(out, /\[server:3123\]/, 'and must name the port, which the bare message omits');
  });

  it('INV-2: ordinary chatter stays silent', async () => {
    // A tap that prints routine output gets ignored, and then it is not a tap.
    const out = await runChild({ args: ['server.js'], port: 3124,
      writes: ['listening on 3124', 'loaded 19759 texts', 'warming cache'] });
    assert.equal(out, '', `the tap must stay quiet on a healthy boot, got: ${out}`);
  });

  it('INV-3: only children that spawn server.js are tapped', async () => {
    // Wrapping spawn globally must not turn every child process in the suite
    // into test output.
    const out = await runChild({ args: ['some-other-script.js'], port: 3125,
      writes: [BOOT_FAILURE] });
    assert.equal(out, '', 'a non-server child must not be tapped');
  });

  it('INV-4: it does not displace a test\'s own stderr listener', async () => {
    // 31 contract tests attach their own. Node delivers to every listener, but
    // if the tap ever consumed the stream instead, those tests would silently
    // stop seeing anything.
    const child = cp.spawn('node', ['-e', `process.stderr.write("EADDRINUSE own-listener-check\\n"); setTimeout(()=>{},200)`, 'server.js'],
      { stdio: 'pipe', env: { ...process.env, PORT: '3126' } });
    let mine = '';
    child.stderr.on('data', d => { mine += d; });
    await new Promise(r => { child.on('exit', r); setTimeout(r, 2000); });
    child.kill();
    assert.match(mine, /own-listener-check/,
      'a test attaching its own stderr listener must still receive data');
  });

  it('INV-5: the tap is actually wired into the npm scripts', async () => {
    // Guards the guard. The tap can be perfect and still never run: it is
    // loaded by `node --require` in package.json, and nothing else would fail
    // if that flag were dropped.
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    for (const script of ['test', 'test:contracts']) {
      assert.match(pkg.scripts[script], /--require \.\/test\/_shared\/server-stderr-tap\.js/,
        `npm run ${script} must load the tap, or boot failures are silent again`);
    }
  });

  it('INV-6: the patch is idempotent', async () => {
    // --require plus a direct require() in this file must not stack wrappers
    // and print every line twice.
    const before = cp.spawn;
    tap.install();
    assert.equal(cp.spawn, before, 'install() must not re-wrap an already-patched spawn');
  });
});
