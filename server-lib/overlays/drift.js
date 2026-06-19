'use strict';

const { loadOverlayManifest, listAvailableTranslations, validateManifest } = require('./manifest');

const baseKeySetCache = new WeakMap();

/** Returns the set of leaf-text keys present anywhere in the base object.
 *  Used to flag overlay keys that don't correspond to any base key (likely a typo). */
function collectKeyPaths(obj, prefix = '', out = new Set()) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('_')) continue;
    const p = prefix ? `${prefix}.${k}` : k;
    out.add(p);
    collectKeyPaths(obj[k], p, out);
  }
  return out;
}

function warnUnknownKeys(overlayId, overlay, base, serviceName = 'liturgy') {
  let basePaths = baseKeySetCache.get(base);
  if (!basePaths) { basePaths = collectKeyPaths(base); baseKeySetCache.set(base, basePaths); }
  const stack = [['', overlay]];
  while (stack.length) {
    const [prefix, node] = stack.pop();
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    for (const k of Object.keys(node)) {
      if (k.startsWith('_')) continue;
      const p = prefix ? `${prefix}.${k}` : k;
      if (!basePaths.has(p)) {
        console.warn(`Translation '${overlayId}/${serviceName}': key '${p}' not present in base ${serviceName}-fixed.json (silent drift?)`);
      } else {
        stack.push([p, node[k]]);
      }
    }
  }
}

/** Validates all overlays at startup and logs any warnings. Called once
 *  at boot so misconfigured manifests surface in the server log immediately,
 *  not just when an end-user happens to load /api/translations. */
function validateAllTranslations() {
  const ids = listAvailableTranslations();
  const idSet = new Set(ids);
  let total = 0;
  for (const id of ids) {
    const m = loadOverlayManifest(id);
    const warnings = validateManifest(id, m, idSet);
    if (warnings.length) {
      total += warnings.length;
      for (const w of warnings) console.warn(`Translation manifest '${id}': ${w}`);
    }
  }
  if (total) console.warn(`Translation overlay validation: ${total} warning(s) across ${ids.length} overlay(s).`);
  else console.log(`Translation overlay validation: ${ids.length} overlay(s) OK.`);
}

/** Validates the variant library at startup. Errors here are loud — a malformed
 *  library file is a contract violation (see fixed-texts/variant-library/CONTRACT.md)
 *  and means parish picks may silently fall back to default. Boot continues so the
 *  server can still answer /healthz with a useful failure mode. */
function validateVariantLibrary() {
  const { loadVariantLibrary } = require('../variants');
  try {
    const registry = loadVariantLibrary();
    const count = Object.keys(registry).length;
    const total = Object.values(registry).reduce((n, e) => n + e.all.length, 0);
    console.log(`Variant library: ${count} key(s), ${total} variant(s) loaded.`);
    return { ok: true, warnings: 0 };
  } catch (err) {
    console.error(`Variant library: load FAILED — ${err.message}`);
    return { ok: false, warnings: 1 };
  }
}

/** Validates parish_variant_picks references resolve in the library. No-op when
 *  the table doesn't exist (Phase 0; Phase 1+ has it). Each unresolved row is a
 *  silently-broken parish — warn loudly. */
function validateParishVariantPicks() {
  const { openDb } = require('../cache/sqlite');
  const { loadVariantLibrary, resolveVariant } = require('../variants');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='parish_variant_picks'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    const registry = loadVariantLibrary();
    const rows = db.prepare(
      'SELECT parish_id, variant_key, variant_id FROM parish_variant_picks'
    ).all();
    let warnings = 0;
    for (const row of rows) {
      if (!resolveVariant(registry, row.variant_key, row.variant_id)) {
        console.warn(
          `Parish '${row.parish_id}': variant pick '${row.variant_key}'='${row.variant_id}' does not resolve in library`
        );
        warnings += 1;
      }
    }
    if (warnings === 0 && rows.length > 0) {
      console.log(`Parish variant picks: ${rows.length} reference(s) all resolve.`);
    }
    return { ok: warnings === 0, warnings };
  } finally {
    db.close();
  }
}

module.exports = {
  collectKeyPaths,
  warnUnknownKeys,
  validateAllTranslations,
  validateVariantLibrary,
  validateParishVariantPicks,
};
