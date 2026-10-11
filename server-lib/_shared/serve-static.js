'use strict';

const fs     = require('fs');
const crypto = require('crypto');

/**
 * Serve one static file with revalidation.
 *
 * This used to send Content-Type and nothing else — no Cache-Control, no
 * ETag, no Last-Modified. With no caching directive at all a browser falls
 * back to HEURISTIC caching, and iOS holds stale HTML/CSS/JS for a long time
 * without revalidating. The symptom is brutal to debug from the other side of
 * a conversation: deploy after deploy lands correctly on the server, verifies
 * clean from curl and from a desktop browser, and changes nothing whatsoever
 * on the phone. Three print fixes shipped to staging before anyone asked
 * whether the device had ever seen them. Found 2026-10-11.
 *
 * `no-cache` does not mean "do not cache" — it means cache it, then
 * REVALIDATE before every use. Paired with a content ETag that is a cheap 304
 * on the common path, so this costs a round trip and not a re-download, and a
 * deploy is visible immediately everywhere.
 */
function serveStatic(res, filePath, contentType, req) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const buf  = fs.readFileSync(filePath);
  const etag = '"' + crypto.createHash('sha1').update(buf).digest('base64') + '"';
  const headers = {
    'Content-Type':  contentType + '; charset=utf-8',
    'ETag':          etag,
    'Cache-Control': 'no-cache',
  };

  if (req && req.headers && req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);
  res.end(buf);
}

module.exports = { serveStatic };
