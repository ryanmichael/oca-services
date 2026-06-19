'use strict';

// Parish admin auth — magic-link token model.
//
// Manual-invite v1 (design doc §5): tokens are seeded out-of-band by the
// administrator. The first-visit URL carries the raw token in the query
// string; the server hashes it, looks up the parish, sets an HttpOnly
// cookie, and redirects to the bookmarkable clean URL. Subsequent visits
// authenticate by cookie.

const crypto = require('crypto');
const { openDb, openDbWrite } = require('../cache/sqlite');

const TOKEN_BYTES = 32;
const COOKIE_NAME = 'parish_admin';
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/** Issue a fresh token for a parish. Used by the admin onboarding flow
 *  (scripts/grant-parish-token.js — to be written when onboarding a parish).
 *  Returns the raw token. The hash is stored. */
function issueToken({ parishId, label, expiresInMs = DEFAULT_EXPIRY_MS }) {
  const raw = generateRawToken();
  const hash = sha256(raw);
  const now = Date.now();
  const db = openDbWrite();
  try {
    db.prepare(`
      INSERT INTO parish_admin_tokens (token_hash, parish_id, label, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(hash, parishId, label || null, now + expiresInMs, now);
  } finally {
    db.close();
  }
  return raw;
}

/** Look up which parish (if any) this raw token currently controls.
 *  Updates last_used_at as a side-effect. Returns null on invalid/expired. */
function verifyToken(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const hash = sha256(raw);
  const db = openDbWrite();
  try {
    const row = db.prepare(
      'SELECT parish_id, expires_at FROM parish_admin_tokens WHERE token_hash = ?'
    ).get(hash);
    if (!row) return null;
    if (row.expires_at < Date.now()) return null;
    db.prepare('UPDATE parish_admin_tokens SET last_used_at = ? WHERE token_hash = ?')
      .run(Date.now(), hash);
    return { parishId: row.parish_id };
  } finally {
    db.close();
  }
}

/** Parse the incoming Cookie header for our parish admin cookie value. */
function readCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.substring(0, eq) === COOKIE_NAME) {
      return decodeURIComponent(part.substring(eq + 1));
    }
  }
  return null;
}

function buildSetCookie(rawToken) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ];
  // Add Secure in prod. We can't know reliably from req here; the route
  // wrapper that calls this knows the env.
  return parts.join('; ');
}

/** Build a request-scoped auth context. */
function authenticate(req, expectedParishId) {
  // First-visit token in query string → adopt + redirect path returned to caller.
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const qsToken = url.searchParams.get('token');
  if (qsToken) {
    const result = verifyToken(qsToken);
    if (result && result.parishId === expectedParishId) {
      return { authenticated: true, parishId: result.parishId, setCookie: buildSetCookie(qsToken), redirectClean: true };
    }
    return { authenticated: false, reason: 'invalid_or_expired_token' };
  }
  // Cookie path.
  const cookieToken = readCookie(req);
  if (cookieToken) {
    const result = verifyToken(cookieToken);
    if (result && result.parishId === expectedParishId) {
      return { authenticated: true, parishId: result.parishId };
    }
  }
  return { authenticated: false, reason: 'no_credentials' };
}

// In-memory rate limit. 10 writes/min per parish. Crude but enough for MVP.
const writeCounters = new Map();   // parish_id → [{ts}]
function checkAndRecordWrite(parishId, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const arr = (writeCounters.get(parishId) || []).filter(ts => now - ts < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  writeCounters.set(parishId, arr);
  return true;
}

module.exports = {
  COOKIE_NAME,
  issueToken,
  verifyToken,
  authenticate,
  buildSetCookie,
  checkAndRecordWrite,
};
