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

// The state name the admin UI uses for "no row in parish_rubrics". A tristate
// rubric's `undefined` is a real, distinct choice — for
// `includeSecondKoinonikon` it is the OCA-practice one — so the UI has to be
// able to name it and send it back.
const TRISTATE_UNSET = 'unset';

/** Delete a pick, returning the rubric to its unset state.
 *  `setRubricPick` is an UPSERT and can never express this. */
function clearRubricPick(dbWrite, parishId, rubricId) {
  dbWrite.prepare(
    'DELETE FROM parish_rubrics WHERE parish_id = ? AND rubric_id = ?'
  ).run(parishId, rubricId);
}

/**
 * What a parish-admin save should do with `payload.rubric_picks`.
 *
 * Pure on purpose: the invariant it carries is the one that broke, and keeping
 * the decision out of the route makes it testable without a server, a token or
 * a DB write (INV-G/INV-H in test/contracts/rubric-registry.test.js).
 *
 * THE BUG THIS EXISTS TO PREVENT. A tristate rubric used to be driven by its
 * typed column like any other boolean, through the dual-write at
 * parish-admin.js. Two consequences, both silent:
 *
 *   1. The UI was a checkbox, so it could only ever store `1` or `0`. Unchecking
 *      "Second communion verse" wrote an explicit `0`, which suppresses the
 *      polyeleos saint's own Communion Verse — nine Sundays of 2026, measured
 *      2026-10-15, one of them (8-16) a date the OCA order prescribes it on.
 *      The parish had no way to ask for the default back.
 *   2. The dual-write fired for every typed column in the payload, changed or
 *      not, so even deleting the row by hand was undone by the next save of any
 *      unrelated setting — with nothing in the history diff, since the value had
 *      not changed.
 *
 * So: a tristate rubric travels ONLY as a `rubric_picks` entry, its typed column
 * is pinned to the registry default (`columnDefaults`) so the legacy fallback in
 * buildRubrics stays inert, and its column is excluded from the dual-write
 * (`skipDualWriteColumns`).
 *
 * @returns {{writes: Array<{rubricId: string, action: 'set'|'clear', value: string|null}>,
 *            columnDefaults: Object<string, number>,
 *            skipDualWriteColumns: Set<string>}}
 */
function planRubricPickWrites(payload, registry = loadRegistry()) {
  const rubrics = registry.rubrics || {};
  const writes  = [];
  const columnDefaults = {};
  const skipDualWriteColumns = new Set();

  // Unconditional: a tristate column must never be dual-written, whether or not
  // this particular payload carries its pick. A save that omits the pick must
  // still not resurrect the row — that is failure mode 2 above.
  for (const [id, def] of Object.entries(rubrics)) {
    if (def.tristate !== true || !def.dbColumn) continue;
    skipDualWriteColumns.add(def.dbColumn);
    columnDefaults[def.dbColumn] = def.default ? 1 : 0;
  }

  if (!Array.isArray(payload?.rubric_picks)) {
    return { writes, columnDefaults, skipDualWriteColumns };
  }

  for (const rp of payload.rubric_picks) {
    if (!rp || typeof rp.rubric_id !== 'string') continue;
    const def = rubrics[rp.rubric_id];
    if (!def) continue;
    const isTristate = def.tristate === true;
    // Column-backed booleans still travel as `rubric_*` fields and are
    // dual-written; only tristate rubrics are allowed in here with a column.
    if (def.dbColumn && !isTristate) continue;

    if (isTristate && String(rp.value) === TRISTATE_UNSET) {
      writes.push({ rubricId: rp.rubric_id, action: 'clear', value: null });
      continue;
    }
    const value = def.type === 'boolean'
      ? (coerce(rp.value, 'boolean') ? '1' : '0')
      : String(rp.value);
    writes.push({ rubricId: rp.rubric_id, action: 'set', value });
  }

  return { writes, columnDefaults, skipDualWriteColumns };
}

/** The three-way state of each tristate rubric, for the admin UI to render.
 *  A pick that is absent reads as `unset` — which is a choice, not a gap. */
function tristateStates(rubricPicks = {}, registry = loadRegistry()) {
  const out = {};
  for (const [id, def] of Object.entries(registry.rubrics || {})) {
    if (def.tristate !== true) continue;
    out[id] = Object.prototype.hasOwnProperty.call(rubricPicks, id)
      ? (coerce(rubricPicks[id], def.type) ? '1' : '0')
      : TRISTATE_UNSET;
  }
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
  clearRubricPick,
  planRubricPickWrites,
  tristateStates,
  TRISTATE_UNSET,
  REGISTRY_PATH,
};
