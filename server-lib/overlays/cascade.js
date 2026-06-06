'use strict';

const { fixedTextRegistry } = require('./registry');
const { loadOverlayData } = require('./manifest');
const { resolveExtendsChain } = require('./extends-chain');
const { warnUnknownKeys } = require('./drift');

const translationCache = new Map();           // key: "<serviceFile>:<overlayId>" → merged result

function deepMergeOverlay(base, overlay) {
  if (overlay === null || overlay === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return overlay;
  if (typeof overlay !== 'object' || Array.isArray(overlay)) return overlay;
  const out = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (k.startsWith('_')) continue;  // strip overlay-only metadata (_note, _source, etc.)
    out[k] = (k in base) ? deepMergeOverlay(base[k], v) : v;
  }
  return out;
}

/** Generalized overlay loader. Returns the base fixed-text for `serviceName`
 *  (e.g. 'liturgy', 'presanctified') with the named overlay's cascade applied.
 *  When no overlay is selected, returns the base unmodified. */
function getOverlayFixed(serviceName, overlayName) {
  const base = fixedTextRegistry[serviceName];
  if (!base) {
    console.warn(`Translation: no base registered for service '${serviceName}'`);
    return null;
  }
  if (!overlayName) return base;
  const cacheKey = `${serviceName}:${overlayName}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
  const chain = resolveExtendsChain(overlayName);
  let merged = base;
  for (const id of chain) {
    const overlay = loadOverlayData(id, serviceName);
    if (overlay) {
      warnUnknownKeys(id, overlay, base, serviceName);
      merged = deepMergeOverlay(merged, overlay);
    }
  }
  translationCache.set(cacheKey, merged);
  return merged;
}

/** Backward-compatible wrapper. */
function getLiturgyFixed(overlayName) {
  return getOverlayFixed('liturgy', overlayName);
}

module.exports = { deepMergeOverlay, getOverlayFixed, getLiturgyFixed };
