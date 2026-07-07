'use strict';

// Per-request Octoechos overlay selection. The base octoechos.json is a boot
// singleton; variable-source overlays (e.g. Myrrh-bearers) live in
// variable-sources/octoechos-<id>.json and are loaded at boot into
// sources.octoechosOverlays. Given the active translation/stack id, this cascades
// any applicable overlay onto the base and returns the merged object, so every
// octoechos read (slot-based via resolveSource, and direct sources.octoechos[tk])
// picks up the parish's chosen translation. This closes the long-standing
// "overlay loader doesn't cover variable-sources" gap for the Octoechos.

const { deepMergeOverlay } = require('../overlays/cascade');
const { resolveExtendsChain } = require('../overlays/extends-chain');

const mergeCache = new Map();   // stack id → merged octoechos (boot-stable)

/**
 * @param {object} sources  boot sources ({ octoechos, octoechosOverlays, ... })
 * @param {string|null} stack  active translation/stack id (or parish id)
 * @returns the base octoechos, or a merged copy when the stack (or its extends
 *          chain) includes a stack with a registered octoechos overlay.
 */
function resolveOctoechos(sources, stack) {
  const base = sources.octoechos;
  const overlays = sources.octoechosOverlays;
  if (!stack || !overlays || !Object.keys(overlays).length) return base;
  if (mergeCache.has(stack)) return mergeCache.get(stack);

  // Walk the stack's extends chain (parents first, child last) so an overlay's
  // values win over its parents'; fall back to the bare id if it has no manifest.
  let chain;
  try { chain = resolveExtendsChain(stack); } catch { chain = [stack]; }
  if (!chain.length) chain = [stack];

  let merged = base;
  for (const id of chain) {
    if (overlays[id]) merged = deepMergeOverlay(merged, overlays[id]);
  }
  mergeCache.set(stack, merged);
  return merged;
}

/** Drop cached merges (after an overlay/parish-settings change). */
function invalidateOctoechosOverlay(stack) {
  if (stack) mergeCache.delete(stack); else mergeCache.clear();
}

module.exports = { resolveOctoechos, invalidateOctoechosOverlay };
