'use strict';

/**
 * Parish Book — fetch an assembled service through the SAME route the app
 * calls, in-process. The book must never have a private path to the
 * assembler: if it did, a fix to `/api/liturgy` (a parish rubric, a
 * practice-layer selection, a register knob) could reach the app and miss
 * the book. Dispatching a synthetic request through the router means the book
 * sees exactly the JSON a browser would.
 */

// Required lazily: routes/index.js requires the parish-book route, which
// requires this file — a top-level require here would see a half-built module.
function dispatch(req, res, ctx) { return require('../routes').dispatch(req, res, ctx); }

function callApi(ctx, url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const headers = {};
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      getHeader(k) { return headers[k.toLowerCase()]; },
      removeHeader(k) { delete headers[k.toLowerCase()]; },
      writeHead(code, h) {
        this.statusCode = code;
        if (h && typeof h === 'object') for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
        this.headersSent = true;
        return this;
      },
      write(c) { if (c != null) chunks.push(Buffer.from(c)); return true; },
      end(c) {
        if (c != null) chunks.push(Buffer.from(c));
        const body = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({ status: this.statusCode, json, body });
      },
      on() {}, once() {}, emit() {},
    };
    const req = { method: 'GET', url, headers: { host: 'parish-book.internal' }, on() {}, once() {} };
    try { dispatch(req, res, ctx); } catch (e) { reject(e); }
  });
}

/** The assembled service for one date, as `/api/<service>` returns it. */
async function getService(ctx, edition, date) {
  const q = new URLSearchParams({ date, translation: edition.translation, ...(edition.query || {}) });
  const r = await callApi(ctx, `/api/${edition.service}?${q}`);
  if (r.status !== 200 || !r.json || !Array.isArray(r.json.blocks)) {
    const msg = (r.json && r.json.error) || `status ${r.status}`;
    const err = new Error(`${edition.service} ${date}: ${msg}`);
    err.status = r.status;
    throw err;
  }
  return r.json;
}

module.exports = { callApi, getService };
