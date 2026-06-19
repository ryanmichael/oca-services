'use strict';

const sentry = require('./sentry');
const log    = require('./log');

module.exports = {
  initSentry:       sentry.initSentry,
  captureException: sentry.captureException,
  captureMessage:   sentry.captureMessage,
  log,
  requestLogger:    log.requestLogger
};
