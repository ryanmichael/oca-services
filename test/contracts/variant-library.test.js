/**
 * Feature contract: variant library stability
 * Spec: fixed-texts/variant-library/CONTRACT.md
 *
 * Enforces the four rules from the contract:
 *   1. IDs are immutable (enforced at PR review; not testable here)
 *   2. IDs cannot be removed (parish_variant_picks references must resolve)
 *   3. IDs and aliases share one namespace per file
 *   4. This test must stay green
 *
 * Run: npm run test:contracts
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { loadVariantLibrary, resolveVariant } = require('../../server-lib/variants');
const { openDb } = require('../../server-lib/cache/sqlite');

describe('Variant library contract', () => {
  it('INV-A: registry loads without errors', () => {
    const registry = loadVariantLibrary();
    assert.ok(typeof registry === 'object', 'registry must be an object');
    // At least the three Phase-0 placeholders are present.
    assert.ok('pre-communion-prayer' in registry, 'pre-communion-prayer placeholder must exist');
    assert.ok('blessed-is-the-man' in registry, 'blessed-is-the-man placeholder must exist');
    assert.ok('cherubic-hymn' in registry, 'cherubic-hymn placeholder must exist');
  });

  it('INV-B: every file declares a "key" that matches its filename', () => {
    // Loader throws if mismatched — covered by INV-A's successful load. Sanity-check
    // explicitly so a future schema slip is caught with a clearer message.
    const registry = loadVariantLibrary();
    for (const [key, entry] of Object.entries(registry)) {
      assert.equal(entry.key, key, `entry.key "${entry.key}" must match registry key "${key}"`);
    }
  });

  it('INV-C: no id/alias collisions within any file (loader-enforced)', () => {
    // Loader throws on collision. Re-running here just exercises the path.
    assert.doesNotThrow(() => loadVariantLibrary());
  });

  it('INV-D: every variant has id, label, and a value (string or object)', () => {
    const registry = loadVariantLibrary();
    for (const [key, entry] of Object.entries(registry)) {
      for (const v of entry.all) {
        assert.ok(v.id,    `${key}: variant missing id`);
        assert.ok(v.label, `${key}: variant ${v.id} missing label`);
        assert.ok(v.value !== undefined, `${key}: variant ${v.id} missing value`);
        const t = typeof v.value;
        assert.ok(t === 'string' || (t === 'object' && v.value !== null),
          `${key}: variant ${v.id} value must be string or object, got ${t}`);
      }
      // If the file has variants, _target must be set.
      if (entry.all.length > 0) {
        assert.ok(entry.target,            `${key}: _target required when variants exist`);
        assert.ok(entry.target.service,    `${key}: _target.service required`);
        assert.ok(entry.target.path,       `${key}: _target.path required`);
      }
    }
  });

  it('INV-E: every parish_variant_picks reference resolves (or table absent in Phase 0)', () => {
    // In Phase 0 the parish_variant_picks table does not yet exist. Skip cleanly
    // when absent. Once Phase 1 lands the table, this becomes the load-bearing
    // assertion of the contract: a parish row references a variant_id; if the
    // library no longer carries that id (or an alias to it), CI fails.
    const db = openDb();
    if (!db) return; // No DB at all
    try {
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='parish_variant_picks'"
      ).get();
      if (!tableExists) return; // Phase 0: table not yet created

      const registry = loadVariantLibrary();
      const rows = db.prepare(
        'SELECT parish_id, variant_key, variant_id FROM parish_variant_picks'
      ).all();
      for (const row of rows) {
        const v = resolveVariant(registry, row.variant_key, row.variant_id);
        assert.ok(
          v,
          `parish ${row.parish_id}: variant_key="${row.variant_key}" variant_id="${row.variant_id}" does not resolve in library`
        );
      }
    } finally {
      db.close();
    }
  });

  it('INV-F: CONTRACT.md exists in the library directory', () => {
    const p = path.resolve(__dirname, '..', '..', 'fixed-texts', 'variant-library', 'CONTRACT.md');
    assert.ok(fs.existsSync(p), 'fixed-texts/variant-library/CONTRACT.md must exist');
  });
});
