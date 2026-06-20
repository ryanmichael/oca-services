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

// Titles that are legitimately duplicated across multiple (month, day)
// tuples with identical troparia — e.g. a saint commemorated on both
// their repose date and a relic-translation date, using the same hymns.
//
// First-pass allowlist (2026-06-20): surfaced by initial drift sweep and
// triaged via orthocal cross-reference. Most are presumed legit dual-comms
// (relic translations, Marian icon multi-date cycle, OCA-Georgian saints
// without orthocal coverage). Aninas of Euphrates is the most-suspect for
// real drift — orthocal lists him only on 3-18 — but we allowlist pending
// OCA-source verification rather than risk deleting valid data.
// Each entry warrants a 1-minute OCA-source re-check at calendar rollover.
const DUPE_ALLOWLIST = new Set([
  'Icon of the Mother of God of Tolga',                    // 7-18 + 8-8: Marian icon multi-date
  'Venerable Aninas of the Euphrates',                     // 3-13 + 3-18: orthocal lists only 3-18; verify against OCA Service Book
  'New Martyr Theodore',                                   // 1-30 + 2-17: likely Russian new-martyr OCA cycle
  'Saint Martin the Merciful, Bishop of Tours',            // 10-12 + 11-11: Nov 11 = principal, Oct 12 = translation of relics
  'Venerable Mercurius the Faster of the Kiev Caves',      // 11-4 + 11-24: Kiev Caves cluster
  'Venerable Shio Mgvime',                                 // 2-9 + 3-3: Georgian saint, OCA-specific cycle
  'Venerable Theodora and her daughter Theopiste',         // 8-3 + 8-29: paired-saint commemoration
]);

// Max days between two duplicate-titled rows for the pair to be flagged as
// drift. Legit dual-commemorations (Marian icons, relic translations,
// prophets with multiple feasts) are typically months apart; drift bugs
// (saint accidentally typed onto an adjacent day) sit inside this window.
const DUPE_PROXIMITY_DAYS = 30;

/** Detects commemorations duplicated onto multiple dates with byte-identical
 *  troparia — the smoking-gun signature of a DB-row drift (saint accidentally
 *  authored onto the wrong day). A real dual-feast would either have distinct
 *  hymns or sit far apart in the year. Allowlisted titles bypass. */
function validateCommemorationDupes() {
  const { openDb } = require('../cache/sqlite');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='commemorations'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    const dupes = db.prepare(`
      SELECT title,
             GROUP_CONCAT(id)                       AS ids,
             GROUP_CONCAT(month || ',' || day, '|') AS dates
      FROM commemorations
      GROUP BY title
      HAVING COUNT(*) > 1
    `).all();

    let warnings = 0;
    for (const d of dupes) {
      if (DUPE_ALLOWLIST.has(d.title)) continue;
      // Afterfeast cycle rows are one-per-day of the afterfeast period and
      // legitimately share the feast's troparion. Not a drift signal.
      if (/^Afterfeast of /.test(d.title)) continue;
      const ids   = d.ids.split(',').map(Number);
      const pairs = d.dates.split('|').map(s => s.split(',').map(Number));

      // Skip if no pair is within the proximity window — likely legit
      // dual-comm (Marian icons, relic translations far apart in the year).
      const dayOfYear = ([m, day]) =>
        // Cheap approximation: 30 days/month is fine for proximity check.
        (m - 1) * 30 + day;
      let closeEnough = false;
      for (let i = 0; i < pairs.length && !closeEnough; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          if (Math.abs(dayOfYear(pairs[i]) - dayOfYear(pairs[j])) <= DUPE_PROXIMITY_DAYS) {
            closeEnough = true; break;
          }
        }
      }
      if (!closeEnough) continue;

      const ph  = ids.map(() => '?').join(',');
      const rows = db.prepare(
        `SELECT commemoration_id, type, text FROM troparia
         WHERE commemoration_id IN (${ph}) AND pronoun = 'tt'
         ORDER BY commemoration_id, type`
      ).all(...ids);
      const byId = {};
      for (const r of rows) (byId[r.commemoration_id] ??= []).push(`${r.type}:${r.text}`);
      const sets = ids.map(id => (byId[id] || []).sort().join('\n'));
      const allIdentical = sets.length > 1 && sets[0] !== '' && sets.every(s => s === sets[0]);
      if (allIdentical) {
        const human = pairs.map(([m, day]) => `${m}-${day}`).join(', ');
        console.warn(
          `Commemoration "${d.title}" duplicated across (${human}) ` +
          `with byte-identical troparia (ids: ${d.ids}). Likely a DB-row drift bug. ` +
          `Add to DUPE_ALLOWLIST in server-lib/overlays/drift.js if intentional.`
        );
        warnings += 1;
      }
    }
    if (warnings === 0) console.log('Commemoration dupes: clean.');
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
  validateCommemorationDupes,
};
