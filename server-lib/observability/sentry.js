'use strict';

// Sentry init — a no-op when SENTRY_DSN is not set, so dev / fork / contributor
// runs stay zero-config. Production deploys set SENTRY_DSN (+ optional
// SENTRY_ENV / SENTRY_RELEASE) and errors flow to Sentry automatically.

let _initialized = false;
let _Sentry      = null;

function initSentry() {
  if (_initialized) return _Sentry;
  _initialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;

  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment:      process.env.SENTRY_ENV     || process.env.NODE_ENV || 'development',
      release:          process.env.SENTRY_RELEASE || undefined,
      tracesSampleRate: 0,
      sendDefaultPii:   false
    });
    _Sentry = Sentry;
    console.log('Sentry initialized.');
    return Sentry;
  } catch (err) {
    console.warn('Sentry init failed:', err.message);
    return null;
  }
}

function captureException(err, context) {
  if (!_Sentry) return;
  try {
    if (context) _Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
      _Sentry.captureException(err);
    });
    else _Sentry.captureException(err);
  } catch { /* swallow — observability must never crash the app */ }
}

function captureMessage(msg, level, context) {
  if (!_Sentry) return;
  try {
    if (context) _Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
      _Sentry.captureMessage(msg, level || 'warning');
    });
    else _Sentry.captureMessage(msg, level || 'warning');
  } catch { /* swallow */ }
}

module.exports = { initSentry, captureException, captureMessage };
