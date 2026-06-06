'use strict';

// Overlay diff + provenance helpers.
// For attribution: when an overlay overrides a string value, the resulting
// ServiceBlock is tagged with `_overlay: "<id>"` so consumers (and devs
// debugging) can see exactly which blocks came from the active overlay.
//
// Approach: post-merge, walk both base and merged, collect the set of string
// values that exist in merged but not in base. After assembly, any block
// whose `text` is in that set gets the `_overlay` tag.

const { fixedTextRegistry } = require('./registry');
const { getOverlayFixed }   = require('./cascade');

const overlayStringsCache = new Map();   // key: "<serviceFile>:<overlayId>" → Set<string>
const overlayDiffCache    = new Map();   // key: "<serviceFile>:<overlayId>" → diff array

function collectStringValues(obj, out = new Set()) {
  if (typeof obj === 'string') { out.add(obj); return out; }
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { obj.forEach(v => collectStringValues(v, out)); return out; }
  for (const k of Object.keys(obj)) {
    if (k.startsWith('_')) continue;
    collectStringValues(obj[k], out);
  }
  return out;
}

/** Returns the set of string values introduced by the overlay (present in the
 *  merged result but not in the base). Used for block-level attribution. */
function getOverlayIntroducedStrings(serviceName, overlayId) {
  if (!overlayId) return null;
  const cacheKey = `${serviceName}:${overlayId}`;
  if (overlayStringsCache.has(cacheKey)) return overlayStringsCache.get(cacheKey);
  const base = fixedTextRegistry[serviceName];
  const merged = getOverlayFixed(serviceName, overlayId);
  if (!base || !merged) return null;
  const baseStrs = collectStringValues(base);
  const mergedStrs = collectStringValues(merged);
  const introduced = new Set();
  for (const s of mergedStrs) if (!baseStrs.has(s)) introduced.add(s);
  overlayStringsCache.set(cacheKey, introduced);
  return introduced;
}

/** Tags blocks whose text matches an overlay-introduced string with the
 *  overlay id. Mutates blocks in place; safe no-op when overlayId is null. */
function tagBlocksWithOverlay(blocks, serviceName, overlayId) {
  if (!overlayId || !Array.isArray(blocks)) return;
  const introduced = getOverlayIntroducedStrings(serviceName, overlayId);
  if (!introduced || introduced.size === 0) return;
  for (const b of blocks) {
    if (b && b.text && introduced.has(b.text)) b._overlay = overlayId;
  }
}

/** Returns the diff between base and merged for a given service+overlay.
 *  Each entry: { path: "dotted.key.path", base: "...", overlay: "..." }.
 *  Arrays are diffed wholesale (path points at the array, before/after are JSON-encoded). */
function diffOverlay(serviceName, overlayId) {
  if (!overlayId) return [];
  const cacheKey = `${serviceName}:${overlayId}`;
  if (overlayDiffCache.has(cacheKey)) return overlayDiffCache.get(cacheKey);
  const base = fixedTextRegistry[serviceName];
  const merged = getOverlayFixed(serviceName, overlayId);
  if (!base || !merged) return [];

  const diffs = [];
  function walk(prefix, b, m) {
    if (b === m) return;
    if (typeof b === 'string' || typeof m === 'string'
        || typeof b !== 'object' || typeof m !== 'object'
        || b === null || m === null
        || Array.isArray(b) !== Array.isArray(m)) {
      diffs.push({ path: prefix, base: b ?? null, overlay: m ?? null });
      return;
    }
    if (Array.isArray(b)) {
      if (JSON.stringify(b) !== JSON.stringify(m)) {
        diffs.push({ path: prefix, base: b, overlay: m });
      }
      return;
    }
    const keys = new Set([...Object.keys(b), ...Object.keys(m)]);
    for (const k of keys) {
      if (k.startsWith('_')) continue;
      const p = prefix ? `${prefix}.${k}` : k;
      if (!(k in b)) { diffs.push({ path: p, base: null, overlay: m[k] }); continue; }
      if (!(k in m)) { diffs.push({ path: p, base: b[k], overlay: null }); continue; }
      walk(p, b[k], m[k]);
    }
  }
  walk('', base, merged);

  overlayDiffCache.set(cacheKey, diffs);
  return diffs;
}

module.exports = {
  collectStringValues,
  getOverlayIntroducedStrings,
  tagBlocksWithOverlay,
  diffOverlay,
};
