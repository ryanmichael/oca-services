'use strict';

const fs   = require('fs');
const path = require('path');

const { isSeason, SEASON_VALUES } = require('../../constants/seasons');

const ROOT = path.resolve(__dirname, '..', '..');
const TRANSLATIONS_DIR = path.join(ROOT, 'fixed-texts', 'translations');

const translationManifestCache = new Map();

function loadOverlayManifest(overlayId) {
  if (translationManifestCache.has(overlayId)) return translationManifestCache.get(overlayId);
  const manifestPath = path.join(TRANSLATIONS_DIR, overlayId, 'manifest.json');
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Translation '${overlayId}': manifest unreadable — ${err.message}`);
    // Backward-compat: overlays without a manifest are still loadable as flat.
  }
  translationManifestCache.set(overlayId, manifest);
  return manifest;
}

function loadOverlayData(overlayId, serviceName = 'liturgy') {
  const dataPath = path.join(TRANSLATIONS_DIR, overlayId, `${serviceName}-fixed.json`);
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Translation '${overlayId}/${serviceName}': data file unreadable — ${err.message}`);
    return null;
  }
}

function listAvailableTranslations() {
  try {
    return fs.readdirSync(TRANSLATIONS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('_'))
      .map(e => e.name);
  } catch {
    return [];
  }
}

// Allowed enum values for manifest schema validation.
const ALLOWED_KINDS = new Set(['tradition', 'parish', 'jurisdiction']);
const ALLOWED_JURISDICTIONS = new Set([
  'oca', 'rocor', 'antiochian', 'goa', 'serbian', 'romanian', 'bulgarian', 'georgian',
]);
const ALLOWED_STYLES = new Set(['new', 'old']);

/** Validates a manifest. Returns an array of human-readable warnings (empty = OK).
 *  All checks are non-fatal; loader handles defaults so the overlay still loads.
 *  Pass `allIds` (the set of existing overlay ids on disk) to validate extends refs.
 *
 *  Documentation contract: `schema/overlay-manifest.schema.json`. When this
 *  function is changed (enum additions, new fields, relaxed/tightened rules),
 *  update the schema in the same commit. */
function validateManifest(id, manifest, allIds) {
  const warnings = [];
  if (!manifest || typeof manifest !== 'object') {
    warnings.push('manifest.json missing or unreadable');
    return warnings;
  }
  if (!manifest.name || typeof manifest.name !== 'string') {
    warnings.push("missing or non-string 'name' field");
  }
  if (!manifest.kind) {
    warnings.push("missing 'kind' field (defaulting to 'tradition')");
  } else if (!ALLOWED_KINDS.has(manifest.kind)) {
    warnings.push(`unknown kind '${manifest.kind}' (allowed: ${[...ALLOWED_KINDS].join(', ')})`);
  }
  if (manifest.jurisdiction != null) {
    if (typeof manifest.jurisdiction !== 'string') {
      warnings.push(`jurisdiction must be a string id or null, got ${typeof manifest.jurisdiction}`);
    } else if (!ALLOWED_JURISDICTIONS.has(manifest.jurisdiction)) {
      warnings.push(`unknown jurisdiction '${manifest.jurisdiction}' (allowed: ${[...ALLOWED_JURISDICTIONS].join(', ')}, or null)`);
    }
  }
  if (manifest.extends !== undefined) {
    if (!Array.isArray(manifest.extends)) {
      warnings.push("'extends' must be an array (use [] if no parents)");
    } else {
      manifest.extends.forEach((parent, i) => {
        if (typeof parent !== 'string') {
          warnings.push(`extends[${i}] must be a string id, got ${typeof parent}`);
        } else if (parent === id) {
          warnings.push(`extends[${i}] is self-reference '${parent}' (will be detected as cycle)`);
        } else if (allIds && !allIds.has(parent)) {
          warnings.push(`extends[${i}] '${parent}' is not a known overlay id`);
        }
      });
    }
  }
  if (manifest.style !== undefined) {
    if (typeof manifest.style !== 'string' || !ALLOWED_STYLES.has(manifest.style)) {
      warnings.push(`'style' must be one of: ${[...ALLOWED_STYLES].join(', ')}`);
    }
  }
  if (manifest.rubrics !== undefined) {
    if (typeof manifest.rubrics !== 'object' || manifest.rubrics === null || Array.isArray(manifest.rubrics)) {
      warnings.push("'rubrics' must be a plain object");
    } else {
      const r = manifest.rubrics;
      if (r.omitCatechumensSeasons !== undefined) {
        if (!Array.isArray(r.omitCatechumensSeasons)) {
          warnings.push("rubrics.omitCatechumensSeasons must be an array of season ids");
        } else {
          r.omitCatechumensSeasons.forEach((s, i) => {
            if (typeof s !== 'string') {
              warnings.push(`rubrics.omitCatechumensSeasons[${i}] must be a string`);
            } else if (!isSeason(s)) {
              // Typo guard: a non-allowlisted value silently never matches
              // `liturgicalContext.season`, so the catechumens litany would
              // never be omitted with no other signal.
              warnings.push(`rubrics.omitCatechumensSeasons[${i}] "${s}" is not a known season — expected one of ${SEASON_VALUES.join(', ')}`);
            }
          });
        }
      }
    }
  }
  return warnings;
}

function getTranslationManifests() {
  const ids = listAvailableTranslations();
  const idSet = new Set(ids);
  return ids.map(id => {
    const m = loadOverlayManifest(id) || {};
    const warnings = validateManifest(id, m, idSet);
    return {
      id,
      name: m.name || id,
      kind: m.kind || 'tradition',
      jurisdiction: m.jurisdiction ?? null,
      style: ALLOWED_STYLES.has(m.style) ? m.style : null,
      extends: Array.isArray(m.extends) ? m.extends : [],
      description: m.description || null,
      sources: m.sources || null,
      listed: m.listed !== false,
      ...(warnings.length ? { warnings } : {}),
    };
  });
}

module.exports = {
  TRANSLATIONS_DIR,
  loadOverlayManifest,
  loadOverlayData,
  listAvailableTranslations,
  validateManifest,
  getTranslationManifests,
};
