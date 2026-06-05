'use strict';

const warnings = require('./warnings');

/**
 * Looks up `sources[sourceName]` then drills into it via dotted `keyPath`.
 * On miss, logs to console and pushes a warning record (`{ source, key }`)
 * which the top-level assembler returns alongside the blocks
 * (as `blocks._warnings`) for downstream display.
 *
 * Also exported from `assembler.js` for the `server.js` source-resolution
 * path; do not change the (sourceName, keyPath, sources) signature without
 * updating both call sites.
 */
function resolveSource(sourceName, keyPath, sources) {
  const source = sources[sourceName];
  if (!source) {
    console.warn(`Source not found: ${sourceName}`);
    warnings.push({ source: sourceName, key: keyPath });
    return null;
  }
  const result = deepGet(source, keyPath);
  if (result == null) {
    console.warn(`Key not found: ${sourceName}.${keyPath}`);
    warnings.push({ source: sourceName, key: keyPath });
  }
  return result;
}

/**
 * Walk a dotted path through nested objects. Exported because the assembler
 * calls deepGet directly when resolving inline fixed-text references inside
 * Lord-I-Call / Aposticha / Litya slot specs.
 */
function deepGet(obj, path) {
  return path.split('.').reduce((curr, key) => curr?.[key], obj);
}

/**
 * Resolve a "@@dotted.path" sentinel string against the merged fixed-texts.
 * Lets base petition arrays reference shared snippets (e.g. hierarch
 * commemorations) that parish overlays can override surgically without
 * copying the whole array. Non-sentinel strings pass through unchanged.
 */
function resolveFixedRef(value, fixedTexts) {
  if (typeof value !== 'string' || !value.startsWith('@@')) return value;
  const resolved = deepGet(fixedTexts, value.slice(2));
  return typeof resolved === 'string' ? resolved : value;
}

module.exports = { resolveSource, resolveFixedRef, deepGet };
