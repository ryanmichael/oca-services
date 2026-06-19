'use strict';

// In-memory overlay registry. Replaces the file-system lookup for overlays
// whose source of truth is the DB (Phase 1: parish overlays built from
// parish_settings + variant_picks + derivation templates).
//
// Consumed by:
//   manifest.js → loadOverlayManifest / loadOverlayData check this registry
//                  FIRST and short-circuit when an entry exists. Cascade
//                  semantics + extends chain are unchanged.
//
// Invalidation:
//   On a settings save, call registerInMemoryOverlay() again — that bumps
//   the entry. invalidateOverlayCaches() is exported so callers can also
//   clear the cascade's merged-result cache for the affected overlay.

const registry = new Map();  // overlayId → { manifest, data: { serviceName → obj }, updatedAt }

function registerInMemoryOverlay(overlayId, { manifest, data }) {
  if (!overlayId || typeof overlayId !== 'string') {
    throw new Error('registerInMemoryOverlay: overlayId required (string)');
  }
  if (manifest !== null && (typeof manifest !== 'object' || Array.isArray(manifest))) {
    throw new Error(`registerInMemoryOverlay(${overlayId}): manifest must be object or null`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`registerInMemoryOverlay(${overlayId}): data must be { serviceName → obj }`);
  }
  registry.set(overlayId, { manifest: manifest || null, data, updatedAt: Date.now() });
}

function getInMemoryOverlay(overlayId) {
  return registry.get(overlayId) || null;
}

function getInMemoryManifest(overlayId) {
  const e = registry.get(overlayId);
  return e ? e.manifest : null;
}

function getInMemoryData(overlayId, serviceName) {
  const e = registry.get(overlayId);
  if (!e) return null;
  return e.data[serviceName] || null;
}

function hasInMemoryOverlay(overlayId) {
  return registry.has(overlayId);
}

function listInMemoryOverlays() {
  return [...registry.keys()];
}

function clearInMemoryOverlay(overlayId) {
  registry.delete(overlayId);
}

module.exports = {
  registerInMemoryOverlay,
  getInMemoryOverlay,
  getInMemoryManifest,
  getInMemoryData,
  hasInMemoryOverlay,
  listInMemoryOverlays,
  clearInMemoryOverlay,
};
