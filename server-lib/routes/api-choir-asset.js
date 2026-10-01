'use strict';

/**
 * GET /api/choir-asset?id=<12-hex>
 *
 * Serves one choir document by its content-derived asset id.
 *
 * Reuse of these documents was granted by the choir director (Connie Russell)
 * on 2026-10-01; see docs/choir-asset-addressing-design.md §5. The grant covers
 * the parish's own compiled material. Several sheets carry third-party musical
 * settings (OBIKHOD, Znamenny, Byzantine arrangements) whose rights sit with
 * their publishers, so this route is for the parish's use of its own books, not
 * a public redistribution point.
 *
 * Addressed by ASSET ID ONLY, never by a client-supplied path: the id is looked
 * up in the index and the stored path comes from there, so a caller cannot
 * traverse out of the asset directories. The id is a sha256 prefix, so a given
 * id always names the same bytes and the response is safely immutable.
 *
 * 404 when the id is unknown, and when the file is simply not on this machine —
 * the packet scans are gitignored, so in production nothing is on disk. That is
 * a deployment fact, not an error; `available` in the index says so up front.
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..', '..');
const PACKET_ROOT  = path.join(ROOT, 'docs', 'choir-packets');
const choirAssets  = require('../search/choir-assets');

const TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
};

function fail(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function handle(req, res, ctx) {
  const { parseQuery } = ctx;
  const q  = parseQuery(req.url || '/');
  const id = String(q.id || '').trim().toLowerCase();

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!/^[0-9a-f]{12}$/.test(id)) {
    return fail(res, 400, 'id must be a 12-character hex asset id');
  }

  const index = choirAssets.loadIndex();
  const asset = index.assets?.[id];
  if (!asset || !asset.path) return fail(res, 404, 'no such asset');

  // The stored path comes from the index, never from the request. Resolve it
  // and confirm it really sits under a directory we are willing to serve.
  const candidates = [path.resolve(PACKET_ROOT, asset.path), path.resolve(ROOT, asset.path)];
  const roots = [PACKET_ROOT, path.join(ROOT, 'docs')];
  const file = candidates.find((p) =>
    roots.some((r) => p === r || p.startsWith(r + path.sep)) && fs.existsSync(p));

  if (!file) {
    return fail(res, 404, 'asset is not present on this machine (scans are local-only)');
  }

  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  let stat;
  try { stat = fs.statSync(file); } catch { return fail(res, 404, 'asset unreadable'); }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    // Content-addressed: this id can never name different bytes.
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Disposition':
      `inline; filename="${String(asset.filename || id).replace(/["\\]/g, '')}"`,
  });

  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file)
    .on('error', () => { try { res.destroy(); } catch { /* client gone */ } })
    .pipe(res);
}

module.exports = handle;
