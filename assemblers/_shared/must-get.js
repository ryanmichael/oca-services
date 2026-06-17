'use strict';

const warnings = require('./warnings');
const { deepGet } = require('./resolve');

/**
 * Look up a dotted path in `fixedTexts`. On miss, push a warning record and
 * return `undefined` so callers can early-return an empty block list instead
 * of crashing with TypeError. Lets a malformed/incomplete overlay degrade
 * gracefully — the missing section is skipped, the rest of the service still
 * renders, and the warning surfaces on `blocks._warnings` for diagnosis.
 *
 * @param {Object} fixedTexts  - merged fixed-texts tree
 * @param {string} path        - dotted key path (e.g. "pre-communion.bowHeads")
 * @param {Object} [opts]
 * @param {string} [opts.scope] - section name for the warning record
 * @returns {*} the value, or undefined on miss
 */
function mustGet(fixedTexts, path, opts = {}) {
  const value = deepGet(fixedTexts, path);
  if (value == null) {
    warnings.push({ source: 'fixed', key: path, scope: opts.scope });
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Fixed-text key missing: ${path}${opts.scope ? ` (${opts.scope})` : ''}`);
    }
    return undefined;
  }
  return value;
}

module.exports = mustGet;
