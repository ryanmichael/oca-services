'use strict';

// Structured JSON logger. One line per event to stdout (Railway captures it
// natively; Axiom/Better Stack integrations consume JSON-lined stdout).
//
//   log.info('boot.ready', { port });
//   log.warn('schema.sweep.fail', { errors });
//   log.error('route.crash', { route, message });
//
// In tests / quiet mode, set LOG_LEVEL=silent. Default emits info+.

const LEVELS = { silent: 60, error: 50, warn: 40, info: 30, debug: 20 };

function currentLevel() {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[env] != null ? LEVELS[env] : LEVELS.info;
}

function emit(level, event, fields) {
  const min = currentLevel();
  if (LEVELS[level] < min) return;
  const record = {
    ts:    new Date().toISOString(),
    level,
    event,
    ...fields
  };
  // Stable JSON for downstream parsers; pretty in dev is a stretch goal.
  process.stdout.write(JSON.stringify(record) + '\n');
}

function requestLogger(req, res, t0) {
  const start = t0 || process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
    emit('info', 'http.request', {
      method: req.method,
      path:   (req.url || '').split('?')[0],
      status: res.statusCode,
      ms
    });
  });
}

module.exports = {
  info:  (event, fields) => emit('info',  event, fields),
  warn:  (event, fields) => emit('warn',  event, fields),
  error: (event, fields) => emit('error', event, fields),
  debug: (event, fields) => emit('debug', event, fields),
  requestLogger
};
