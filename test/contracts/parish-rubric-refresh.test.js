/**
 * Feature contract: a parish rubric change takes effect without a restart
 * Spec: features/rubric-registry.md (§Refresh after a save)
 *
 * Found 2026-10-17. Tyler cleared `includeSecondKoinonikon` through the
 * parish-admin page. The `parish_rubrics` row was gone from the DB, the page
 * reported "Saved. Preview updated.", and every service still rendered the
 * suppressed Communion Verse — for nine Sundays of 2026 — until the server was
 * restarted.
 *
 * Cause: `getOverlayRubrics` memoises the merged rubrics per overlay id, and
 * `refreshParishOverlay` cleared only the FIXED-TEXT cascade
 * (`invalidateOverlayCascade`). Nothing dropped the rubrics memo.
 *
 * Production masked it, because a deploy restarts the container. It bites
 * precisely the case parish self-service exists for: a parish changing their
 * own settings against a long-running instance.
 *
 * These tests drive the overlay registry directly rather than through an
 * authenticated POST, so they need no server, token or DB write.
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const { registerInMemoryOverlay, clearInMemoryOverlay } =
  require(path.join(ROOT, 'server-lib', 'overlays', 'in-memory.js'));
const { getOverlayRubrics, invalidateOverlayRubrics } =
  require(path.join(ROOT, 'server-lib', 'overlays', 'rubrics.js'));

/** An in-memory overlay shaped like the one buildParishOverlay produces. */
function register(id, rubrics, extendsChain = []) {
  registerInMemoryOverlay(id, {
    manifest: { id, extends: extendsChain, rubrics },
    data: {},
  });
}

describe('Feature contract: parish rubric refresh', () => {

  it('INV-1: clearing a rubric is visible without a restart', () => {
    const ID = 'contract-refresh-parish';
    try {
      // The parish has the rubric explicitly off, and something reads it —
      // which is what populates the memo.
      register(ID, { readings: { includeSecondKoinonikon: false } });
      assert.equal(getOverlayRubrics(ID).readings.includeSecondKoinonikon, false,
        'precondition: the explicit false should be visible');

      // Now the parish clears it. This is exactly what refreshParishOverlay
      // does after a save: rebuild, re-register, invalidate.
      register(ID, {});
      invalidateOverlayRubrics(ID);

      assert.equal(getOverlayRubrics(ID).readings, undefined,
        'a cleared rubric must read as unset immediately. A stale memo here is ' +
        'the 2026-10-17 bug: the DB row was gone and nine Sundays still sang ' +
        'the suppressed setting until the process was restarted.');
    } finally {
      invalidateOverlayRubrics(ID);
      clearInMemoryOverlay(ID);
    }
  });

  it('INV-2: a changed value is visible without a restart', () => {
    const ID = 'contract-refresh-parish-2';
    try {
      register(ID, { readings: { includeSecondKoinonikon: false } });
      getOverlayRubrics(ID);                       // populate the memo
      register(ID, { readings: { includeSecondKoinonikon: true } });
      invalidateOverlayRubrics(ID);
      assert.equal(getOverlayRubrics(ID).readings.includeSecondKoinonikon, true,
        'a flipped rubric must be visible immediately');
    } finally {
      invalidateOverlayRubrics(ID);
      clearInMemoryOverlay(ID);
    }
  });

  it('INV-3: invalidating a parent also invalidates overlays that extend it', () => {
    // A child merges its parents' rubrics, so a stale child is the same bug one
    // level up. Keys here are bare overlay ids, not the composite cascade keys
    // invalidateOverlayCascade matches on, so the chain has to be walked.
    const PARENT = 'contract-refresh-parent';
    const CHILD  = 'contract-refresh-child';
    try {
      register(PARENT, { omitPreTrisagionLitany: true });
      register(CHILD, {}, [PARENT]);
      assert.equal(getOverlayRubrics(CHILD).omitPreTrisagionLitany, true,
        'precondition: the child should inherit the parent rubric');

      register(PARENT, {});
      invalidateOverlayRubrics(PARENT);

      assert.equal(getOverlayRubrics(CHILD).omitPreTrisagionLitany, undefined,
        'the child inherits from the parent, so invalidating the parent must ' +
        'drop the child\'s memo too');
    } finally {
      invalidateOverlayRubrics(PARENT);
      clearInMemoryOverlay(PARENT);
      clearInMemoryOverlay(CHILD);
    }
  });

  it('INV-4: refreshParishOverlay is the thing that calls it', () => {
    // The invalidation existing is worthless if the save path does not call it.
    // Asserted on the source, because exercising the real path needs a DB write.
    const fs  = require('node:fs');
    const src = fs.readFileSync(
      path.join(ROOT, 'server-lib', 'parishes', 'index.js'), 'utf8');
    const fn = src.slice(src.indexOf('function refreshParishOverlay'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
    assert.match(body, /invalidateOverlayRubrics\(parishId\)/,
      'refreshParishOverlay must invalidate the rubrics memo, or an admin save ' +
      'still will not take effect until restart');
    // Both exits: the parish-deleted branch and the normal rebuild.
    assert.equal((body.match(/invalidateOverlayRubrics\(/g) || []).length, 2,
      'both exits of refreshParishOverlay must invalidate — the early return ' +
      'for a deleted parish as well as the rebuild');
  });
});
