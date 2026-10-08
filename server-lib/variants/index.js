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
  // _target tells the parish-overlay materializer where to slot the variant's
  // value in the cascade. Optional only on placeholder files (variants:[]);
  // mandatory once the file ships real content.
  //
  // Two target kinds. `fixed-text` (the default, and every file that predates
  // 2026-10-08) names a dotted key in the fixed-texts cascade. `menaion`
  // names a hymn row in oca.db, which the cascade cannot reach at all —
  // overlays are scoped to fixed-texts/ (memory: overlay-variable-sources-gap),
  // so a parish that sings a different sticheron or kontakion from the Menaion
  // had nowhere to record it. See features/parish-menaion-override.md.
  //
  // A menaion target addresses by POSITION and verifies by CONTENT:
  //   { kind, commemoration: { month, day, title },
  //     hymn: { table: 'stichera', section, order } | { table: 'troparia', type },
  //     expect: [sha256 of the base text(s) this variant may replace] }
  // Position alone is unsafe — orders get renumbered. Content alone is not
  // enough either: the OCA text fills a short Lord-I-Call set by REPEATING a
  // sticheron, so two slots can hold byte-identical text and only one is meant
  // to be replaced. Addressing by order and guarding with `expect` is the pair
  // that survives both.
  const target = data._target || null;
  if (target) {
    const kind = target.kind || 'fixed-text';
    if (kind === 'fixed-text') {
      if (!target.service || !target.path) {
        throw new Error(`${file}: _target must include both "service" and "path"`);
      }
    } else if (kind === 'menaion') {
      // `service` is required here as well: /api/pick-library groups the
      // parish-admin picker by it, and its contract says every library key
      // must be offerable (pick-library INV-1/INV-2).
      if (!target.service) {
        throw new Error(`${file}: menaion _target needs "service" so the picker can offer it`);
      }
      const c = target.commemoration;
      if (!c || typeof c.month !== 'number' || typeof c.day !== 'number' || !c.title) {
        throw new Error(`${file}: menaion _target.commemoration needs { month, day, title }`);
      }
      const h = target.hymn;
      if (!h || (h.table !== 'stichera' && h.table !== 'troparia')) {
        throw new Error(`${file}: menaion _target.hymn.table must be "stichera" or "troparia"`);
      }
      if (h.table === 'stichera' && (!h.section || typeof h.order !== 'number')) {
        throw new Error(`${file}: menaion stichera target needs { section, order }`);
      }
      if (h.table === 'troparia' && !h.type) {
        throw new Error(`${file}: menaion troparia target needs { type }`);
      }
      if (!Array.isArray(target.expect) || target.expect.length === 0) {
        throw new Error(`${file}: menaion _target.expect must list at least one base sha256`);
      }
    } else {
      throw new Error(`${file}: unknown _target.kind "${kind}"`);
    }
    target.kind = kind;
  } else if (data.variants.length > 0) {
    throw new Error(`${file}: _target is required when variants are present`);
  }

  const byId = new Map();
  for (const v of data.variants) {
    if (!v.id)    throw new Error(`${file}: variant missing "id"`);
    if (!v.label) throw new Error(`${file}: variant ${v.id} missing "label"`);
    // "value" is either a string (most variants) or a structured object (for
    // multi-part hymns like the Cherubic Hymn or Blessed-is-the-Man). We
    // accept either; the materializer slots it as-is at _target.path.
    if (v.value === undefined && v.text === undefined) {
      throw new Error(`${file}: variant ${v.id} missing "value"`);
    }
    if (v.value === undefined) v.value = v.text;  // backward-compat alias

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
  return { key: data.key, version: data._version || 1, label: data._label || data.key,
           target, byId, all: data.variants };
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
