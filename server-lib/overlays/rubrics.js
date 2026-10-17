'use strict';

const { loadOverlayManifest } = require('./manifest');
const { resolveExtendsChain } = require('./extends-chain');

const rubricsCache = new Map();

/** Resolves the merged `rubrics` object from an overlay's extends chain
 *  (parent-first, child wins). Returns an empty object when no overlay is
 *  active or none in the chain declares rubrics. Rubrics are parish-level
 *  rubrical preferences (e.g. omitCatechumensSeasons) that adjust assembler
 *  branching without changing any text. */
function getOverlayRubrics(overlayId) {
  if (!overlayId) return {};
  if (rubricsCache.has(overlayId)) return rubricsCache.get(overlayId);
  const chain = resolveExtendsChain(overlayId);
  let merged = {};
  for (const id of chain) {
    const m = loadOverlayManifest(id);
    if (m?.rubrics && typeof m.rubrics === 'object' && !Array.isArray(m.rubrics)) {
      merged = { ...merged, ...m.rubrics };
    }
  }
  rubricsCache.set(overlayId, merged);
  return merged;
}

/**
 * Drop the memoised rubrics for an overlay, and for anything that inherits
 * from it.
 *
 * Without this, a parish-admin save was invisible to the running process until
 * restart. `refreshParishOverlay` re-registers the in-memory overlay and calls
 * `invalidateOverlayCascade`, but that only clears the FIXED-TEXT cascade —
 * this memo kept answering with the rubrics merged on the first request. Found
 * 2026-10-17: Tyler cleared `includeSecondKoinonikon` through the admin page,
 * the row was gone from the DB and the page said "Saved. Preview updated.", and
 * every service still rendered the suppressed Communion Verse.
 *
 * Production masked it, because a deploy restarts the container — so the bug
 * only bites a long-running instance, which is exactly what a parish
 * self-serving on their own settings is using.
 *
 * Chain-aware: a child overlay merges its parents' rubrics, so changing a
 * parent must invalidate the children too. Same reasoning as
 * invalidateOverlayCascade's suffix match, done by walking the chain because
 * these keys are bare overlay ids rather than composite cascade keys.
 */
function invalidateOverlayRubrics(overlayId) {
  if (!overlayId) return;
  rubricsCache.delete(overlayId);
  for (const key of [...rubricsCache.keys()]) {
    let chain;
    // A cached id whose chain can no longer be resolved is dropped rather than
    // kept: a stale entry is what this function exists to prevent.
    try { chain = resolveExtendsChain(key); } catch { rubricsCache.delete(key); continue; }
    if (chain.includes(overlayId)) rubricsCache.delete(key);
  }
}

module.exports = { getOverlayRubrics, invalidateOverlayRubrics };
