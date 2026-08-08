'use strict';

// Parish overlay materializer.
//
// Given a parish_id, reads the parish_settings row + variant_picks, runs
// derivation templates, and registers the result as an in-memory overlay.
// Idempotent — calling again refreshes from current DB state.
//
// MVP scope (Phase 1):
//   - Anaphora hierarch keys are derived from primate_name + ruling_hierarch_name
//     (see fixed-texts/derivation-templates/hierarch-commemoration-oca.json).
//   - Variant picks are resolved through the library (Phase 0 placeholders are
//     empty; injection becomes meaningful once Phase 3 populates the catalog).
//   - All other Tyler-style overrides cascade through the legacy file overlay
//     referenced by parish_settings.legacy_overlay_path.

const { openDb }                 = require('../cache/sqlite');
const { deriveOverlayForService } = require('../derivations');
const { loadVariantLibrary, resolveVariant } = require('../variants');
const { loadPracticeLibrary }               = require('../practice/library');
const { resolvePatronByNaturalKey } = require('./patron-resolver');
const {
  loadRegistry,
  getRubricPicks,
  coerce,
  isDefault,
} = require('./rubric-registry');
const {
  registerInMemoryOverlay,
  clearInMemoryOverlay,
} = require('../overlays/in-memory');
const { invalidateOverlayCascade } = require('../overlays/cascade');

const SERVICES_WITH_DERIVATIONS = ['liturgy', 'vespers'];

function setDottedKey(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function readParishRow(db, parishId) {
  return db.prepare('SELECT * FROM parish_settings WHERE parish_id = ?').get(parishId);
}

function readVariantPicks(db, parishId) {
  return db.prepare(
    'SELECT variant_key, variant_id FROM parish_variant_picks WHERE parish_id = ?'
  ).all(parishId);
}

/** Practice picks. Table is absent on DBs predating migration 008. */
function readPracticePicks(db, parishId) {
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='parish_practice_picks'"
  ).get();
  if (!exists) return [];
  return db.prepare(
    'SELECT practice_key, preset_id FROM parish_practice_picks WHERE parish_id = ?'
  ).all(parishId);
}

function listAllParishIds() {
  const db = openDb();
  if (!db) return [];
  try {
    // Table may not exist yet (Phase 0 boots).
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='parish_settings'"
    ).get();
    if (!exists) return [];
    return db.prepare('SELECT parish_id FROM parish_settings').all().map(r => r.parish_id);
  } finally {
    db.close();
  }
}

/** Build the synthetic manifest + per-service data for one parish. Pure
 *  function-shaped: takes inputs (row, picks, library), returns the overlay
 *  object the in-memory registry expects. Trivially testable. */
function buildParishOverlay(row, picks, library, rubricPicks = {}, practice = {}) {
  const extendsChain = parseExtendsChain(row);
  const manifest = {
    name:         row.name,
    kind:         'parish',
    jurisdiction: row.jurisdiction,
    extends:      extendsChain,
    rubrics:      buildRubrics(row, rubricPicks, practice),
  };

  const data = {};
  for (const service of SERVICES_WITH_DERIVATIONS) {
    const derived = deriveOverlayForService({
      jurisdiction: row.jurisdiction,
      service,
      inputs: {
        primate_name:          row.primate_name          || '',
        ruling_hierarch_name:  row.ruling_hierarch_name  || '',
        primate_short:         row.primate_short         || '',
        ruling_hierarch_short: row.ruling_hierarch_short || '',
      },
    });
    data[service] = derived;
  }

  // Variant picks slot into per-service overlay data at the library's
  // declared _target.path. Library schema enforces _target is present when
  // a file has variants; see fixed-texts/variant-library/CONTRACT.md.
  for (const pick of picks) {
    const lib = library[pick.variant_key];
    if (!lib) continue;
    const v = resolveVariant(library, pick.variant_key, pick.variant_id);
    if (!v) continue;
    const t = lib.target;
    if (!t) continue;
    if (!data[t.service]) data[t.service] = {};
    setDottedKey(data[t.service], t.path, v.value);
  }

  return { manifest, data };
}

function parseExtendsChain(row) {
  try {
    const arr = JSON.parse(row.extends_chain);
    if (Array.isArray(arr)) return arr;
  } catch (_) {}
  // Fallback: jurisdiction overlay.
  return [row.jurisdiction];
}

function buildRubrics(row, rubricPicks = {}, practiceEntries = []) {
  const r = {};
  const registry = loadRegistry();
  for (const [id, def] of Object.entries(registry.rubrics)) {
    if (def.consumer === 'orphan-unused') continue;
    // Dual-read during the bake-in period: prefer the parish_rubrics pick
    // when present; otherwise fall back to the typed column on parish_settings.
    // Either path can independently flip a rubric; this preserves byte
    // stability against scripts that update typed columns directly.
    let raw;
    if (Object.prototype.hasOwnProperty.call(rubricPicks, id)) {
      raw = rubricPicks[id];
    } else if (row && def.dbColumn in row) {
      raw = row[def.dbColumn];
    } else {
      continue;
    }
    const value = coerce(raw, def.type);
    if (isDefault(value, def.default)) continue;
    setDottedKey(r, def.namespace, value);
  }
  if (row.patron_natural_key && row.patron_title) {
    const resolved = resolvePatronByNaturalKey(row.patron_natural_key);
    r.temple = {
      naturalKey: row.patron_natural_key,
      title:      row.patron_title,
      // commemorationId resolved against the current menaion. If it ever
      // fails to resolve, boot logs a warning (validateAllParishPatrons).
      commemorationId: resolved ? resolved.id : null,
    };
  }
  let inlinePractice = [];
  if (row.rubrics_extra_json) {
    try {
      const extra = JSON.parse(row.rubrics_extra_json);
      // `practice` is merged rather than assigned: library presets (Bucket C)
      // and bespoke inline entries (Bucket D) both feed it, and an inline entry
      // must override a preset targeting the same path rather than stacking
      // with it. resolveParishPractice owns that precedence.
      if (Array.isArray(extra.practice)) inlinePractice = extra.practice;
      Object.assign(r, extra);
    } catch (_) {
      // Malformed — validateParishPractice flags this loudly; it is otherwise
      // invisible and silently drops EVERY key in this column.
    }
  }

  const { resolveParishPractice } = require('../practice/library');
  const effective = resolveParishPractice(
    practiceEntries.picks || [],
    inlinePractice,
    practiceEntries.registry || {});
  if (effective.length) r.practice = effective;
  else delete r.practice;

  return r;
}

/** Register a single parish's in-memory overlay from current DB state.
 *  Idempotent. Invalidates the cascade cache for that overlay so subsequent
 *  requests see the new content. */
function refreshParishOverlay(parishId) {
  const db = openDb();
  if (!db) return null;
  try {
    const row = readParishRow(db, parishId);
    if (!row) {
      clearInMemoryOverlay(parishId);
      invalidateOverlayCascade(parishId);
      return null;
    }
    const picks         = readVariantPicks(db, parishId);
    const library       = loadVariantLibrary();
    const rubricPicks   = getRubricPicks(db, parishId);
    const practice      = {
      picks:    readPracticePicks(db, parishId),
      registry: loadPracticeLibrary(),
    };
    const overlay = buildParishOverlay(row, picks, library, rubricPicks, practice);
    registerInMemoryOverlay(parishId, overlay);
    invalidateOverlayCascade(parishId);
    return overlay;
  } finally {
    db.close();
  }
}

/** Boot helper: load every parish overlay from DB. */
function loadAllParishOverlays() {
  const ids = listAllParishIds();
  let n = 0;
  for (const id of ids) {
    try {
      refreshParishOverlay(id);
      n += 1;
    } catch (err) {
      console.warn(`Parish overlay load failed for '${id}': ${err.message}`);
    }
  }
  if (n > 0) console.log(`Parish overlays loaded: ${n}.`);
  return n;
}

module.exports = {
  buildParishOverlay,
  buildRubrics,
  refreshParishOverlay,
  loadAllParishOverlays,
  listAllParishIds,
  readPracticePicks,
  setDottedKey,
};
