/**
 * Feature contract: the judge is told which divergences from the OCA text are
 * deliberate
 *
 * Before 2026-08-09 a recurring judge false positive was noise in a weekly
 * report. Since the auto-fix leg started actually running it is a PULL REQUEST
 * that reverts a decision the parish made — the koinonikon is the live example:
 * the parish sings "we SHALL walk in the light of Thy countenance", the OCA
 * published text reads "we WILL walk", and an agent reading only the reference
 * would dutifully change it back every week.
 *
 * So the deliberate divergences live in data (audit/judge-known-divergences.json)
 * and are rendered into the judge's system prompt. The bar for an entry is that
 * it records a DECISION. A gap nobody has got around to fixing is not a
 * divergence — it belongs in the findings, where it should keep being reported.
 *
 * Run: npm run test:contracts
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { SYSTEM_PROMPT, KNOWN_DIVERGENCES } = require(path.join(ROOT, 'audit', 'llm-judge.js'));
const RAW = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'audit', 'judge-known-divergences.json'), 'utf8'));

describe('Feature contract: judge known divergences', () => {

  it('INV-1: every entry records what we do, what the reference says, and why', () => {
    assert.ok(KNOWN_DIVERGENCES.length > 0, 'no divergences loaded');
    for (const d of KNOWN_DIVERGENCES) {
      for (const field of ['id', 'scope', 'ours', 'reference', 'why']) {
        assert.ok(typeof d[field] === 'string' && d[field].trim().length > 0,
          `divergence ${d.id || '(unnamed)'} is missing "${field}" — an entry ` +
          `without a recorded reason is indistinguishable from a bug someone ` +
          `silenced`);
      }
      assert.ok(d.why.length > 40,
        `divergence ${d.id}: "why" must actually explain the decision`);
    }
  });

  it('INV-2: ids are unique', () => {
    const ids = KNOWN_DIVERGENCES.map(d => d.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate id in ${ids.join(', ')}`);
  });

  it('INV-3: the prompt carries every divergence, not just the file', () => {
    // The file existing is worth nothing if it never reaches the model.
    assert.match(SYSTEM_PROMPT, /DELIBERATE DIVERGENCES/);
    for (const d of KNOWN_DIVERGENCES) {
      assert.ok(SYSTEM_PROMPT.includes(d.ours),
        `divergence ${d.id} is in the data file but not in the system prompt`);
      assert.ok(SYSTEM_PROMPT.includes(d.why),
        `divergence ${d.id}: the reason must reach the model, not just the id`);
    }
  });

  it('INV-4: the koinonikon divergence matches what we actually render', () => {
    // If someone edits the hymn text without editing this file, the judge would
    // be defending wording we no longer produce — so tie them together.
    const gfv = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'variable-sources', 'great-feast-variants.json'), 'utf8'));
    const rendered = gfv.transfiguration.communionHymn;
    const entry = KNOWN_DIVERGENCES.find(d => d.id === 'koinonikon-shall-not-will');
    assert.ok(entry, 'the koinonikon divergence has gone missing');
    assert.ok(rendered.startsWith(entry.ours.replace(/\.$/, '')),
      `great-feast-variants renders "${rendered.slice(0, 60)}…" but the ` +
      `divergence file claims we render "${entry.ours.slice(0, 60)}…"`);
    assert.match(rendered, /we shall walk/,
      'the parish sings "shall" — confirmed 2026-08-08');
  });

  it('INV-5: the prompt no longer claims the Resurrection kontakion is dropped', () => {
    // It said "INTENTIONALLY DROPPED" long after api-liturgy.js was changed to
    // lead with it (verified 2026-07-11 against OOS 2021-0829). A stale
    // do-not-flag instruction is worse than none: it blinds the judge to a whole
    // class rather than merely failing to help.
    assert.doesNotMatch(SYSTEM_PROMPT, /Resurrection Kontakion[^.]*INTENTIONALLY DROPPED/i);
    assert.match(SYSTEM_PROMPT, /Resurrection Kontakion LEADS/);
    assert.match(SYSTEM_PROMPT, /feast's own kontakion takes "Now and ever/);
  });
});
