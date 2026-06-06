'use strict';

const { loadOverlayManifest } = require('./manifest');

/** Resolves an overlay's full extends chain depth-first, parents before children.
 *  Detects cycles. Returns the chain as an ordered list of ids (parents first,
 *  the requested id last). */
function resolveExtendsChain(overlayId, visited = new Set(), stack = new Set()) {
  if (!overlayId) return [];
  if (stack.has(overlayId)) {
    console.warn(`Translation '${overlayId}': circular extends chain (path: ${[...stack, overlayId].join(' → ')})`);
    return [];
  }
  if (visited.has(overlayId)) return [];  // already merged earlier in the walk
  visited.add(overlayId);
  stack.add(overlayId);
  const manifest = loadOverlayManifest(overlayId);
  const parents = Array.isArray(manifest?.extends) ? manifest.extends : [];
  const chain = [];
  for (const parent of parents) {
    chain.push(...resolveExtendsChain(parent, visited, stack));
  }
  chain.push(overlayId);
  stack.delete(overlayId);
  return chain;
}

module.exports = { resolveExtendsChain };
