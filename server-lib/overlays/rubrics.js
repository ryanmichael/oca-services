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

module.exports = { getOverlayRubrics };
