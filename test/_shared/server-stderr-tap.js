'use strict';

/**
 * Surface a spawned test server's stderr, so "server did not start" is never
 * the only thing you are told.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 *
 * 55 contract tests spawn `node server.js` and poll until it answers. When it
 * never answers they throw "server did not start" — which names neither the
 * port nor the reason. Four pre-push failures across 2026-11-09..12 cost ~10
 * minutes each and three days before the cause was found, and it was not what
 * anyone would have guessed:
 *
 *     Schema migrations failed at boot:
 *     UNIQUE constraint failed: commemorations.month, commemorations.day, commemorations.title
 *
 * Two concurrent servers contend on oca.db migrations, and the loser NEITHER
 * BINDS NOR EXITS. The server had been saying exactly what was wrong the whole
 * time, into a pipe nobody read.
 *
 * ── WHY THIS SHAPE ───────────────────────────────────────────────────────────
 *
 * Two simpler designs were tried and measured first.
 *
 *   1. Key the error message on the child having exited. MEASURED: the child
 *      does NOT exit — `exitCode` is still null after 6s — so the message could
 *      never fire. It was written, measured, and deleted rather than shipped as
 *      coverage that does nothing.
 *   2. Attach the stderr listener inside waitForServer. MEASURED: a listener
 *      attached ~1.5s late captures NOTHING; the early output is already gone.
 *      It has to be attached at spawn.
 *
 * Attaching at 58 varied spawn sites is a large, risky edit for a diagnostic.
 * Wrapping `child_process.spawn` once gets the listener on at spawn time for
 * every test, present and future, and touches no test file at all.
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────────
 *
 * Only children whose argv mentions `server.js`, and only lines that look like
 * a failure, so a healthy run stays silent. Lines are prefixed with the port,
 * which is the other thing the bare message omits and the thing you need when
 * two runs overlap. 31 tests already attach their own stderr listener; Node
 * delivers to all listeners, so this does not displace them.
 */

const cp = require('node:child_process');

// Boot failures worth interrupting a test run for. Deliberately narrow: a tap
// that prints ordinary chatter gets ignored, and then it is not a tap.
const INTERESTING = /(EADDRINUSE|FATAL|Schema migrations failed|constraint failed|cannot find module|SQLITE_|database is locked)/i;

const realSpawn = cp.spawn;
let installed = false;

function install() {
  if (installed) return;
  installed = true;
  cp.spawn = function patchedSpawn(command, args, options) {
    const child = realSpawn.apply(this, arguments);
    const spawnsServer = Array.isArray(args) && args.some(a => String(a).includes('server.js'));
    if (!spawnsServer || !child.stderr) return child;

    const port = (options && options.env && options.env.PORT)
      || (Array.isArray(args) ? (args[args.indexOf('--port') + 1] || '') : '') || '?';
    let buf = '';
    child.stderr.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line && INTERESTING.test(line)) process.stderr.write(`[server:${port}] ${line}\n`);
      }
    });
    return child;
  };
}

install();
module.exports = { install, INTERESTING, _realSpawn: realSpawn };
