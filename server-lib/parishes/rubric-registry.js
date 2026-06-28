'use strict';

// Data-driven rubric registry.
//
// Replaces the one-typed-column-per-rubric pattern with a single
// (parish_id, rubric_id, value) table whose schema is declared by
// data/rubric-registry.json. See features/rubric-registry.md.

const fs   = require('fs');
const path = require('path');

const REGISTRY_PATH = path.resolve(__dirname, '..', '..', 'data', 'rubric-registry.json');

let _cached = null;

function loadRegistry() {
  if (_cached) return _cached;
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  _cached = JSON.parse(raw);
  return _cached;
}

function clearCache() { _cached = null; }

function coerce(rawValue, type) {
  if (type === 'boolean') {
    if (rawValue === true || rawValue === 1) return true;
    if (typeof rawValue === 'string') return rawValue === '1' || rawValue === 'true';
    return !!rawValue;
  }
  if (type === 'csv-strings') {
    if (Array.isArray(rawValue)) return rawValue.slice();
    if (typeof rawValue === 'string') {
      return rawValue.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }
  return rawValue;
}

function isDefault(value, def) {
  if (Array.isArray(def)) return Array.isArray(value) && value.length === 0;
  return value === def;
}

/** Read all parish_rubrics rows for a parish as a plain {rubricId: rawValue} map. */
function getRubricPicks(db, parishId) {
  // Table may not exist yet during boot before migration 007 runs.
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='parish_rubrics'"
  ).get();
  if (!exists) return {};
  const rows = db.prepare(
    'SELECT rubric_id, value FROM parish_rubrics WHERE parish_id = ?'
  ).all(parishId);
  const out = {};
  for (const r of rows) out[r.rubric_id] = r.value;
  return out;
}

/** UPSERT a single pick. dbWrite is a writable handle (openDbWrite()). */
function setRubricPick(dbWrite, parishId, rubricId, value) {
  const text = typeof value === 'string' ? value : String(value);
  dbWrite.prepare(`
    INSERT INTO parish_rubrics (parish_id, rubric_id, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(parish_id, rubric_id) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(parishId, rubricId, text);
}

module.exports = {
  loadRegistry,
  clearCache,
  coerce,
  isDefault,
  getRubricPicks,
  setRubricPick,
  REGISTRY_PATH,
};
