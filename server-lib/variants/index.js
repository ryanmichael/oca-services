'use strict';

// Variant library loader.
//
// Reads fixed-texts/variant-library/<key>.json files and builds a registry
// the settings UI + materializer can query. Enforces the stability contract
// described in fixed-texts/variant-library/CONTRACT.md:
//   1. IDs are immutable (enforced at PR review + contract test)
//   2. IDs cannot be removed (enforced by parish_variant_picks resolution)
//   3. IDs and aliases share one namespace per file (enforced here at load)
//   4. The contract test must stay green (enforced in CI)
//
// Returned registry shape:
//   {
//     'pre-communion-prayer': {
//        version: 1,
//        byId: Map<idOrAlias, variant>,   // both ids and aliases resolve here
//        all:  variant[],                   // canonical list (no alias dups)
//     },
//     ...
//   }

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..', '..');
const LIB_DIR    = path.join(ROOT, 'fixed-texts', 'variant-library');

function listLibraryFiles() {
  if (!fs.existsSync(LIB_DIR)) return [];
  return fs.readdirSync(LIB_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
}

function loadOne(file) {
  const raw = fs.readFileSync(path.join(LIB_DIR, file), 'utf8');
  const data = JSON.parse(raw);
  if (!data.key) throw new Error(`${file}: missing "key"`);
  if (!Array.isArray(data.variants)) throw new Error(`${file}: "variants" must be an array`);

  const byId = new Map();
  for (const v of data.variants) {
    if (!v.id)    throw new Error(`${file}: variant missing "id"`);
    if (!v.label) throw new Error(`${file}: variant ${v.id} missing "label"`);
    if (typeof v.text !== 'string') throw new Error(`${file}: variant ${v.id} missing "text"`);

    const names = [v.id, ...(v.aliases || [])];
    for (const name of names) {
      if (byId.has(name)) {
        throw new Error(
          `${file}: id/alias collision on "${name}" — every id and alias must be unique within a key`
        );
      }
      byId.set(name, v);
    }
  }
  return { key: data.key, version: data._version || 1, byId, all: data.variants };
}

function loadVariantLibrary() {
  const registry = {};
  for (const file of listLibraryFiles()) {
    const expectedKey = file.replace(/\.json$/, '');
    const entry = loadOne(file);
    if (entry.key !== expectedKey) {
      throw new Error(`${file}: declared key "${entry.key}" does not match filename "${expectedKey}"`);
    }
    registry[entry.key] = entry;
  }
  return registry;
}

function resolveVariant(registry, key, idOrAlias) {
  const entry = registry[key];
  if (!entry) return null;
  return entry.byId.get(idOrAlias) || null;
}

module.exports = { loadVariantLibrary, resolveVariant, listLibraryFiles };
