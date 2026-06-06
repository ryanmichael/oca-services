'use strict';

// Entry point. All logic lives in ./server-lib/ — see docs/refactor-server.md
// for the layout. boot() loads sources + fixed-texts + validates overlays +
// ensures the orthocal cache table, then returns a ctx the dispatcher reads.

const http = require('node:http');
const { boot, dispatch } = require('./server-lib');

const args    = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT    = portIdx !== -1 ? parseInt(args[portIdx + 1], 10)
              : process.env.PORT ? parseInt(process.env.PORT, 10)
              : 3000;

const ctx = boot();

http.createServer((req, res) => dispatch(req, res, ctx))
    .listen(PORT, () => {
      console.log(`OCA Service Browser running at http://localhost:${PORT}`);
      console.log('Press Ctrl+C to stop.');
    });
