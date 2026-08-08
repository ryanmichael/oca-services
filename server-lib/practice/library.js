'use strict';

// Practice library loader.
//
// Reads fixed-texts/practice-library/<key>.json and builds a registry the
// settings UI and the parish materializer query. Mirrors the variant library
// loader deliberately — same stability contract, same failure modes — but the
// payload is an OPERATION applied to canonical text rather than a VALUE that
// replaces it. See fixed-texts/practice-library/CONTRACT.md.

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..', '..');
const LIB_DIR = path.join(ROOT, 'fixed-texts', 'practice-library');

function listLibraryFiles() {
  if (!fs.existsSync(LIB_DIR)) return [];
  return fs.readdirSync(LIB_DIR).filter(f => f.endsWith('.json')).sort();
}

function loadOne(file) {
  const data = JSON.parse(fs.readFileSync(path.join(LIB_DIR, file), 'utf8'));
  if (!data.key) throw new Error(`${file}: missing "key"`);
  if (!Array.isArray(data.presets)) throw new Error(`${file}: "presets" must be an array`);

  const target = data._target || null;
  if (target) {
    if (!target.service || !target.path) {
      throw new Error(`${file}: _target must include both "service" and "path"`);
    }
  } else if (data.presets.length > 0) {
    throw new Error(`${file}: _target { service, path } is required when presets are present`);
  }

  const byId = new Map();
  for (const p of data.presets) {
    if (!p.id)    throw new Error(`${file}: preset missing "id"`);
    if (!p.label) throw new Error(`${file}: preset ${p.id} missing "label"`);
    for (const name of [p.id, ...(p.aliases || [])]) {
      if (byId.has(name)) {
        throw new Error(
          `${file}: id/alias collision on "${name}" — every id and alias must be unique within a key`);
      }
      byId.set(name, p);
    }
  }

  return {
    key:     data.key,
    version: data._version || 1,
    label:   data._label || data.key,
    target,
    byId,
    all: data.presets,
  };
}

function loadPracticeLibrary() {
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

function resolvePreset(registry, key, idOrAlias) {
  const entry = registry[key];
  if (!entry) return null;
  return entry.byId.get(idOrAlias) || null;
}

/**
 * Resolve a parish's effective practice entries.
 *
 * Two sources, in precedence order:
 *   1. Library presets picked in `parish_practice_picks` (Bucket C).
 *   2. Bespoke inline entries in `rubrics_extra_json.practice[]` (Bucket D).
 *
 * An inline entry REPLACES a preset targeting the same (service, path), so a
 * parish can deviate from a preset it otherwise matches without forking it.
 * Without that rule the two would stack and the second `select` would run
 * against an already-selected array — silently wrong.
 *
 * Presets with no `op` are deliberate no-ops ("we sing it all") and contribute
 * no entry.
 *
 * Shared by the materializer and the drift validator so both see exactly the
 * same effective set.
 */
function resolveParishPractice(picks, inlineEntries, registry) {
  const byTarget = new Map();

  for (const pick of picks || []) {
    const lib = registry[pick.practice_key];
    if (!lib || !lib.target) continue;
    const preset = resolvePreset(registry, pick.practice_key, pick.preset_id);
    if (!preset || !preset.op) continue;   // unresolved or explicit no-op
    const entry = {
      ...preset,
      service: lib.target.service,
      target:  lib.target.path,
      _preset: `${pick.practice_key}=${pick.preset_id}`,
    };
    delete entry.id;
    delete entry.label;
    delete entry.aliases;
    byTarget.set(`${entry.service}|${entry.target}`, entry);
  }

  for (const entry of inlineEntries || []) {
    if (!entry || !entry.target) continue;
    byTarget.set(`${entry.service || 'liturgy'}|${entry.target}`, entry);
  }

  return [...byTarget.values()];
}

module.exports = {
  loadPracticeLibrary,
  resolvePreset,
  resolveParishPractice,
  listLibraryFiles,
};
