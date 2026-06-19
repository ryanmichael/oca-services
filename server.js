'use strict';

// Entry point. All logic lives in ./server-lib/ — see docs/refactor-server.md
// for the layout. boot() loads sources + fixed-texts + validates overlays +
// ensures the orthocal cache table, then returns a ctx the dispatcher reads.

const http = require('node:http');
const { initSentry, captureException, log } = require('./server-lib/observability');

// Init Sentry BEFORE requiring boot/dispatch so any module-load error is
// captured. No-op when SENTRY_DSN is not set.
initSentry();

const { boot, dispatch } = require('./server-lib');

const args    = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT    = portIdx !== -1 ? parseInt(args[portIdx + 1], 10)
              : process.env.PORT ? parseInt(process.env.PORT, 10)
              : 3000;

const ctx = boot();

process.on('uncaughtException',  (err) => { captureException(err, { kind: 'uncaughtException' });  console.error(err); });
process.on('unhandledRejection', (err) => { captureException(err, { kind: 'unhandledRejection' }); console.error(err); });

http.createServer((req, res) => dispatch(req, res, ctx))
    .listen(PORT, () => {
      console.log(`OCA Service Browser running at http://localhost:${PORT}`);
      console.log('Press Ctrl+C to stop.');
      log.info('boot.ready', { port: PORT });
    });
