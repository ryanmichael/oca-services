'use strict';

const fs = require('fs');

function serveStatic(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
  res.end(fs.readFileSync(filePath));
}

module.exports = { serveStatic };
