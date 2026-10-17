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

  it('INV-F: the snapshot generator reproduces the committed snapshot exactly', () => {
    // INV-D is only as good as the snapshot it reads. Before 2026-08-29 the
    // generator reproduced typed-column logic only, so re-running it DROPPED
    // every registry-only rubric (hoursPrecedeService, licNoLeadingRepeat,
    // gloryAfterLittleLitany, servesLitya) — and INV-D then passed against its
    // own weakened expectation. A green INV-D proved nothing about those keys.
    //
    // This asserts the generator is not stale: its output for every parish must
    // equal the committed snapshot. If someone adds a registry rubric and does
    // not teach legacyBuildRubrics about it, this fails here rather than
    // silently eroding INV-D. Backlog N9.
    const snapshotPath = path.join(ROOT, 'test', 'contracts', '__snapshots__', 'rubrics-pre-refactor.json');
    const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const { legacyBuildRubrics } = require(path.join(ROOT, 'scripts', 'capture-rubrics-snapshot.js'));
    const { getRubricPicks } = require(path.join(ROOT, 'server-lib', 'parishes', 'rubric-registry.js'));

    const db = openDb();
    try {
      for (const parishId of Object.keys(expected)) {
        const row = db.prepare('SELECT * FROM parish_settings WHERE parish_id = ?').get(parishId);
        assert.ok(row, `parish ${parishId} missing from DB`);
        const regenerated = legacyBuildRubrics(row, getRubricPicks(db, parishId));
        assert.deepEqual(regenerated, expected[parishId],
          `capture-rubrics-snapshot.js is STALE for ${parishId} — regenerating would change the snapshot ` +
          `INV-D asserts against.\nregenerated: ${JSON.stringify(regenerated)}\ncommitted:   ${JSON.stringify(expected[parishId])}`);
      }
    } finally {
      db.close();
    }
  });

  // INV-G/INV-H close the 2026-10-16 UI inversion. A tristate rubric was
  // rendered as a checkbox and dual-written from its typed column, so:
  //   * unchecking it stored an explicit `0`, which SUPPRESSES the polyeleos
  //     saint's own Communion Verse (nine Sundays of 2026, 8-16 among them,
  //     where the OCA order prescribes it) rather than declining an extra; and
  //   * the dual-write fired for every typed column in the payload, changed or
  //     not, so clearing the row by hand was undone by the next save of any
  //     unrelated setting, with nothing in the history diff.
  // Asserted against the pure planner so no server, token or DB write is needed.

  it('INV-G: every tristate rubric offers an `unset` option in the registry', () => {
    const reg = loadRegistry();
    const tristate = Object.entries(reg.rubrics).filter(([, d]) => d.tristate === true);
    assert.ok(tristate.length > 0,
      'no tristate rubrics declared — delete INV-G rather than letting it vacuously pass');

    for (const [id, def] of tristate) {
      assert.ok(Array.isArray(def.tristateOptions) && def.tristateOptions.length === 3,
        `${id}: a tristate rubric needs three declared options, or the admin UI falls back ` +
        `to a checkbox and cannot express the unset state`);
      const values = def.tristateOptions.map(o => o.value);
      assert.deepEqual(values.slice().sort(), ['0', '1', 'unset'],
        `${id}: options must be exactly unset/1/0, got ${JSON.stringify(values)}`);
      for (const o of def.tristateOptions) {
        assert.ok(o.label && o.detail,
          `${id}: option ${o.value} needs a label AND a detail — "both are sung" read as an ` +
          `optional extra, which is how the suppressing value got chosen`);
      }
    }
  });

  it('INV-H: a tristate rubric is driven only by its pick, never by its typed column', () => {
    const { planRubricPickWrites } = require(
      path.join(ROOT, 'server-lib', 'parishes', 'rubric-registry.js'));
    const reg = loadRegistry();
    const tristate = Object.entries(reg.rubrics).filter(([, d]) => d.tristate === true);
    assert.ok(tristate.length > 0, 'no tristate rubrics declared — delete INV-H');

    for (const [id, def] of tristate) {
      // (a) The column is excluded from the dual-write and pinned to the
      //     registry default EVEN WHEN the payload carries no pick for it.
      //     This is the re-assertion trap: a save of an unrelated setting.
      const bare = planRubricPickWrites({ rubric_confess_first: 1 }, reg);
      assert.ok(bare.skipDualWriteColumns.has(def.dbColumn),
        `${id}: ${def.dbColumn} must never be dual-written — that is what resurrected a ` +
        `cleared pick on the next unrelated save`);
      assert.equal(bare.columnDefaults[def.dbColumn], def.default ? 1 : 0,
        `${id}: the typed column must be pinned to the registry default, or a leftover 1 ` +
        `makes a cleared pick read as \`true\` through the buildRubrics fallback`);
      assert.deepEqual(bare.writes, [],
        `${id}: a payload with no rubric_picks must not touch any pick`);

      // (b) `unset` clears the row. setRubricPick is an UPSERT and cannot.
      const cleared = planRubricPickWrites(
        { rubric_picks: [{ rubric_id: id, value: 'unset' }] }, reg);
      assert.deepEqual(cleared.writes, [{ rubricId: id, action: 'clear', value: null }],
        `${id}: 'unset' must DELETE the pick; anything else leaves an explicit value behind`);

      // (c) The two explicit states still round-trip as themselves.
      for (const [sent, want] of [['1', '1'], ['0', '0'], [1, '1'], [0, '0']]) {
        const plan = planRubricPickWrites(
          { rubric_picks: [{ rubric_id: id, value: sent }] }, reg);
        assert.deepEqual(plan.writes, [{ rubricId: id, action: 'set', value: want }],
          `${id}: explicit ${JSON.stringify(sent)} must be stored as ${want}`);
      }

      // (d) An unparseable value is stored as a definite state, never as a
      //     clear — a garbled payload must not silently reset the parish.
      const junk = planRubricPickWrites(
        { rubric_picks: [{ rubric_id: id, value: 'maybe' }] }, reg);
      assert.equal(junk.writes[0].action, 'set',
        `${id}: an unrecognised value must not be treated as 'unset'`);
    }
  });

  it('INV-H2: non-tristate rubrics keep their existing write path', () => {
    const { planRubricPickWrites } = require(
      path.join(ROOT, 'server-lib', 'parishes', 'rubric-registry.js'));
    const reg = loadRegistry();

    // A column-backed boolean sent in rubric_picks is still ignored there: it
    // travels as a `rubric_*` field and is dual-written, unchanged by this work.
    const columnBacked = Object.entries(reg.rubrics)
      .find(([, d]) => d.dbColumn && d.tristate !== true);
    assert.ok(columnBacked, 'expected at least one column-backed boolean rubric');
    const ignored = planRubricPickWrites(
      { rubric_picks: [{ rubric_id: columnBacked[0], value: 1 }] }, reg);
    assert.deepEqual(ignored.writes, [],
      `${columnBacked[0]} is column-backed and not tristate; rubric_picks must stay a no-op for it`);

    // A registry-only rubric is still written from rubric_picks.
    const registryOnly = Object.entries(reg.rubrics)
      .find(([, d]) => !d.dbColumn && d.type === 'boolean');
    if (registryOnly) {
      const plan = planRubricPickWrites(
        { rubric_picks: [{ rubric_id: registryOnly[0], value: 1 }] }, reg);
      assert.deepEqual(plan.writes,
        [{ rubricId: registryOnly[0], action: 'set', value: '1' }],
        `${registryOnly[0]}: registry-only rubrics must still be settable`);
    }

    // An unknown id is dropped rather than written.
    assert.deepEqual(
      planRubricPickWrites({ rubric_picks: [{ rubric_id: 'nope', value: 1 }] }, reg).writes,
      [], 'an unknown rubric id must be ignored');
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
