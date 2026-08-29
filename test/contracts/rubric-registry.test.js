/**
 * Feature contract: parish rubric registry
 * Spec: features/rubric-registry.md
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DB   = path.join(ROOT, 'storage', 'oca.db');

const { loadRegistry, clearCache } = require(path.join(ROOT, 'server-lib', 'parishes', 'rubric-registry.js'));
const { buildRubrics } = require(path.join(ROOT, 'server-lib', 'parishes'));
const { openDb } = require(path.join(ROOT, 'server-lib', 'cache', 'sqlite.js'));

describe('Feature contract: rubric registry', () => {

  it('INV-A: every rubric_* typed column is covered by a registry entry', () => {
    const reg = loadRegistry();
    const knownCols = new Set(Object.values(reg.rubrics).map(d => d.dbColumn));

    const migrationsDir = path.join(ROOT, 'storage', 'migrations');
    const sqlFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    const allSql = sqlFiles.map(f => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

    // Match `rubric_<snake>` only when it appears as a column DECLARATION:
    // either in CREATE TABLE (preceded by whitespace at line start) or
    // after `ADD COLUMN`. Other refs (INSERT … SELECT … rubric_x) are filtered
    // by uniqueness against the schema columns we already know are real.
    const re = /\b(rubric_[a-z_]+)\b/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(allSql)) !== null) seen.add(m[1]);

    // Subtract registry-known + any SQL keyword artifacts.
    // `rubric_id` is the parish_rubrics primary-key column, not a typed
    // rubric flag — exclude it.
    const orphans = [...seen].filter(c => !knownCols.has(c) && c !== 'rubric_id');
    assert.deepEqual(orphans, [],
      `typed rubric columns missing from registry: ${orphans.join(', ')}`);
  });

  it('INV-B: every applied rubric has a consumer in server-lib/ or assemblers/', () => {
    const reg = loadRegistry();
    const searchDirs = ['server-lib', 'assemblers'].map(d => path.join(ROOT, d));

    function grep(needle, dir) {
      try {
        const out = execFileSync('grep', ['-r', '--include=*.js', '-l', needle, dir], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
        });
        return out.split('\n').filter(Boolean);
      } catch (_) { return []; }
    }

    for (const [id, def] of Object.entries(reg.rubrics)) {
      if (!def.appliesTo || def.appliesTo.length === 0) continue;
      const terminal = def.namespace.split('.').pop();
      const hits = searchDirs.flatMap(d => grep(terminal, d))
        .filter(f => !/parishes\/(index|rubric-registry)\.js$/.test(f));
      assert.ok(hits.length > 0,
        `rubric "${id}" (namespace ${def.namespace}) has no consumer; searched for "${terminal}"`);
    }
  });

  it('INV-C: backfill migration 007 is idempotent', () => {
    const sqlPath = path.join(ROOT, 'storage', 'migrations', '007_parish_rubrics_registry.sql');
    const before = execFileSync('sqlite3', [DB,
      'SELECT parish_id, rubric_id, value FROM parish_rubrics ORDER BY parish_id, rubric_id;'
    ], { encoding: 'utf8' });

    // Run the SQL again. INSERT OR IGNORE + CREATE TABLE IF NOT EXISTS must
    // produce the same row set.
    execFileSync('sqlite3', [DB, `.read ${sqlPath}`], { encoding: 'utf8' });
    const after = execFileSync('sqlite3', [DB,
      'SELECT parish_id, rubric_id, value FROM parish_rubrics ORDER BY parish_id, rubric_id;'
    ], { encoding: 'utf8' });
    assert.equal(after, before, 'migration 007 is not idempotent');
  });

  // Note on `practice`: it is deliberately absent from the snapshot. Library
  // presets reach buildRubrics as its third argument, which this test does not
  // pass; bespoke inline entries (from rubrics_extra_json) still come through on
  // the two-argument path. So "no practice here" is the correct expectation for a
  // parish whose practice comes entirely from picks. See features/practice-layer.md.
  // INV-E closes the 2026-08-29 second-koinonikon inversion. See
  // docs/backlog-2026-08-29-vespers-liturgy-review.md N5.
  //
  // buildRubrics omits any value equal to its registry default, to keep overlays
  // sparse. That is safe for a boolean consumed with `!!`, but NOT for a rubric
  // whose consumer is tri-state — one that reads `undefined` differently from
  // `false`. `includeSecondKoinonikon` is such a rubric: liturgy-from-orthocal.js
  // treats absent as ALLOWED, so compacting an explicit `false` INVERTS it.
  // Tyler set the rubric to 0 and still got a second koinonikon.
  //
  // Asserts the round trip on the VALUE, not on the presence of a key: a parish's
  // explicit pick must arrive at the consumer with the value the parish chose.
  it('INV-E: an explicit pick of a tristate rubric survives default-compaction', () => {
    const reg = loadRegistry();
    const tristate = Object.entries(reg.rubrics).filter(([, d]) => d.tristate === true);
    assert.ok(tristate.length > 0,
      'no tristate rubrics declared — if that is now correct, delete INV-E rather than letting it vacuously pass');

    clearCache();
    const db = openDb();
    try {
      const row = db.prepare('SELECT * FROM parish_settings LIMIT 1').get();
      assert.ok(row, 'no parish rows to exercise');

      for (const [id, def] of tristate) {
        for (const picked of [false, true]) {
          const picks  = { [id]: picked ? '1' : '0' };
          const actual = buildRubrics(row, picks);

          // Walk the dotted namespace to the leaf.
          const leaf = def.namespace.split('.').reduce(
            (o, k) => (o == null ? undefined : o[k]), actual);

          assert.equal(leaf, picked,
            `${id}: parish picked ${picked}, consumer would see ${JSON.stringify(leaf)}. ` +
            `A tristate rubric must never be compacted away — absent means ` +
            `"allowed" to its consumer, which inverts an explicit false.`);
        }
      }
    } finally {
      db.close();
    }
  });

  it('INV-D: registry path produces same buildRubrics result as legacy path (roundtrip)', () => {
    const snapshotPath = path.join(ROOT, 'test', 'contracts', '__snapshots__', 'rubrics-pre-refactor.json');
    const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

    clearCache();
    const db = openDb();
    try {
      const { getRubricPicks } = require(path.join(ROOT, 'server-lib', 'parishes', 'rubric-registry.js'));
      for (const parishId of Object.keys(expected)) {
        const row = db.prepare('SELECT * FROM parish_settings WHERE parish_id = ?').get(parishId);
        assert.ok(row, `parish ${parishId} missing from DB`);
        const picks = getRubricPicks(db, parishId);
        const actual = buildRubrics(row, picks);
        assert.deepEqual(actual, expected[parishId],
          `rubrics mismatch for ${parishId}\nexpected: ${JSON.stringify(expected[parishId])}\nactual:   ${JSON.stringify(actual)}`);
      }
    } finally {
      db.close();
    }
  });
});
