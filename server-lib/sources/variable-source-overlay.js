'use strict';

// Per-stack cascade for files under `variable-sources/`.
//
// The translation-overlay cascade in `server-lib/overlays/` is fixed-text
// scoped: it resolves `fixed-texts/translations/<id>/<service>-fixed.json` and
// nothing else. Everything in `variable-sources/` — octoechos, menaion,
// triodion, feast-canons, prokeimena — was therefore invisible to it, so a
// parish selecting a translation got the shared default for all of it. That is
// the gap recorded as `project_overlay_variable_sources_gap`.
//
// `resolveOctoechos` (octoechos-overlay.js) closed it for the ONE file it
// names. This module closes it for any variable-source file addressed by path,
// which is what the Beatitudes need: half the Third Antiphon's reader-led
// troparia come from `variable-sources/menaion/<month-day>.json` and the other
// half from the Octoechos, and on 2026-11-01 those were two different
// translations (HTM and St-Sergius Emenaion) with no way for a parish to
// select either. Reported from the kliros the next morning.
//
// Shape mirrors the fixed-text cascade exactly, so the two behave the same:
//   * an overlay is SPARSE — it names only the keys it changes and is
//     deep-merged onto the base, so `matins.canon.ode3.troparia` can be
//     replaced without restating the file;
//   * the stack's `extends` chain is walked PARENTS FIRST, so a child overlay
//     wins over its parents;
//   * keys beginning `_` are overlay-only metadata and are stripped on merge.
//
// Overlay files live at `variable-sources/translations/<stackId>/<relPath>`,
// where `relPath` is the base file's path RELATIVE TO `variable-sources/`
// (e.g. `menaion/november-01.json`).
//
// CAUTION — array semantics. `deepMergeOverlay` replaces an array wholesale
// rather than merging element-wise. For a troparia list that is the correct and
// intended behaviour, but it is the same whole-array replacement that deleted
// Ps 102:3-21 from Tyler's First Antiphon (`project_variant_replace_not_select`).
// Before authoring an overlay against an array, diff it against what the base
// already renders and confirm every omission is genuinely not sung.

const fs   = require('fs');
const path = require('path');

const { deepMergeOverlay }    = require('../overlays/cascade');
const { resolveExtendsChain } = require('../overlays/extends-chain');

const ROOT             = path.resolve(__dirname, '..', '..');
const VARIABLE_SOURCES = path.join(ROOT, 'variable-sources');
const TRANSLATIONS_DIR = path.join(VARIABLE_SOURCES, 'translations');

// key: "<relPath>:<stackId>" → merged object (or null when the base is absent)
const mergeCache = new Map();

/** The stack's extends chain, parents first. Falls back to the bare id for a
 *  stack with no manifest (in-memory parish overlays frequently have one, but
 *  a bare translation id need not). */
function chainFor(stack) {
  let chain;
  try { chain = resolveExtendsChain(stack); } catch { chain = [stack]; }
  return (chain && chain.length) ? chain : [stack];
}

function readJSON(absPath) {
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`variable-source overlay: ${absPath} unreadable — ${err.message}`);
    }
    return null;
  }
}

/**
 * Loads a `variable-sources/` JSON file with the active stack's cascade applied.
 *
 * @param {string} relPath  path relative to `variable-sources/`
 *                          (e.g. `menaion/november-01.json`)
 * @param {string|null} stack  active translation / parish stack id
 * @returns {object|null} the merged object, or null when the base file is
 *                        missing or unparseable. A missing OVERLAY is normal
 *                        and silent; a missing BASE returns null so the caller
 *                        can warn in its own terms.
 */
function loadVariableSourceJSON(relPath, stack) {
  const cacheKey = `${relPath}:${stack || ''}`;
  if (mergeCache.has(cacheKey)) return mergeCache.get(cacheKey);

  const base = readJSON(path.join(VARIABLE_SOURCES, relPath));
  if (base === null) {
    mergeCache.set(cacheKey, null);
    return null;
  }

  let merged = base;
  if (stack) {
    for (const id of chainFor(stack)) {
      const overlay = readJSON(path.join(TRANSLATIONS_DIR, id, relPath));
      if (overlay) merged = deepMergeOverlay(merged, overlay);
    }
  }

  mergeCache.set(cacheKey, merged);
  return merged;
}

/** Which stack ids actually carry an overlay for `relPath`. Used by the drift
 *  detector and by tests; also the cheapest way to answer "is this file
 *  parish-overridable yet?" without reading every candidate. */
function listOverlaysFor(relPath) {
  let ids = [];
  try {
    ids = fs.readdirSync(TRANSLATIONS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch (_) { return []; }
  return ids
    .filter(id => fs.existsSync(path.join(TRANSLATIONS_DIR, id, relPath)))
    .sort();
}

/** Drop cached merges (after an overlay edit or a parish-settings change). */
function invalidateVariableSourceOverlay(stack) {
  if (!stack) { mergeCache.clear(); return; }
  for (const key of [...mergeCache.keys()]) {
    if (key.endsWith(`:${stack}`)) mergeCache.delete(key);
  }
}

module.exports = {
  loadVariableSourceJSON,
  listOverlaysFor,
  invalidateVariableSourceOverlay,
  VARIABLE_SOURCES,
  TRANSLATIONS_DIR,
};
