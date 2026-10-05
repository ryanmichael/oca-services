'use strict';

/**
 * Feature contract: converting stichera to the OCA translation.
 *
 * Chunk 3 of the OCA-standardisation plan. This pipeline WRITES liturgical text
 * into the shared base for every parish, so the invariants here are mostly about
 * what it must refuse to do.
 *
 * The anchor is St Hierotheus (2026-10-04): his OCA text was transcribed by hand
 * from the parish scan on 2026-10-04 and independently verified against
 * files.oca.org. The parser must reproduce it, and the planner must NOT propose
 * him — his remaining non-OCA rows are a Now-and-ever Theotokion and a fourth
 * sticheron the published order does not appoint, neither of which OCA prints.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT  = path.join(__dirname, '..', '..');
const parse = require(path.join(ROOT, 'server-lib', 'sources', 'oca-docx-parse'));
const HIEROTHEUS_DOCX = path.join(ROOT, 'reference', 'scrape', '2026-10-04.docx');

// reference/scrape/ is gitignored and regenerable, so the archive may be absent
// on a fresh clone or in CI. Those cases skip rather than fail: a missing local
// cache is not a defect in this code.
const haveArchive = fs.existsSync(HIEROTHEUS_DOCX);

describe('Feature contract: OCA stichera conversion', () => {
  it('INV-1: the parser lifts a saint\'s stichera, verses and podoben', { skip: !haveArchive }, () => {
    const r = parse.sticheraFor(HIEROTHEUS_DOCX, 'Hierotheus');
    assert.equal(r.found, true, 'the Lord-I-Call section must be found');
    assert.equal(r.stichera.length, 3, 'the order appoints three of St Hierotheus');
    assert.ok(r.glory, 'and a Glory doxastikon');

    for (const s of r.stichera) {
      assert.equal(s.tone, 4, 'the order appoints Tone 4');
      assert.match(s.subject, /Hierotheus/);
      assert.equal(s.podoben, 'Thou hast given a sign');
    }
    assert.deepEqual(r.stichera.map(s => s.verse), [3, 2, 1],
      'stichera are printed on descending psalm verses');
    assert.equal(r.glory.tone, 2, 'the Glory is Tone 2');
  });

  it('INV-2: it reproduces the independently verified text', { skip: !haveArchive }, () => {
    // Hand-transcribed from the parish scan, then checked against files.oca.org.
    const r = parse.sticheraFor(HIEROTHEUS_DOCX, 'Hierotheus');
    assert.match(r.stichera[0].text, /^Having received the grace of the Holy Spirit/);
    assert.match(r.stichera[1].text, /^Thou didst offer thy soul as a well-pleasing/);
    assert.match(r.stichera[2].text, /^Thou didst behold the twelve Apostles/);
    assert.match(r.glory.text, /^When thou wast present at the Mother of God/);
  });

  it('INV-3: the `//` final-phrase mark becomes a newline, the house convention', { skip: !haveArchive }, () => {
    // 1,144 of 1,147 oca-menaion rows use a newline and none uses `//`.
    const r = parse.sticheraFor(HIEROTHEUS_DOCX, 'Hierotheus');
    for (const s of r.stichera) {
      assert.ok(!s.text.includes('//'), `a raw // survived: ${s.text.slice(0, 60)}`);
      assert.ok(s.text.includes('\n'), 'the final phrase must be split onto its own line');
    }
  });

  it('INV-4: a subject the file does not print yields nothing', { skip: !haveArchive }, () => {
    // The common case: OCA published the day for someone else. Returning the
    // day's other stichera here would attribute one saint's hymns to another.
    const r = parse.sticheraFor(HIEROTHEUS_DOCX, 'Paul the Simple');
    assert.equal(r.stichera.length, 0);
    assert.equal(r.glory, null);
  });

  it('INV-5: the planner maps SLOT to slot, and so skips Hierotheus', () => {
    // It once compared counts only, and proposed replacing his Theotokion and
    // fourth sticheron with OCA's three numbered ones — the wrong hymns into
    // the wrong slots. Caught in review, before any write.
    const planPath = path.join(ROOT, 'audit', 'reports', 'oca-convert-plan.json');
    if (!fs.existsSync(planPath)) return;            // plan is gitignored
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    assert.ok(!plan.proposed.some(p => p.id === 2038),
      'St Hierotheus (2038) must not be proposed — his remaining rows have no OCA counterpart');
    for (const p of plan.proposed) {
      assert.ok(Array.isArray(p.ops) && p.ops.length, `${p.id} must carry slot-level ops`);
      for (const op of p.ops) {
        assert.equal(typeof op.order, 'number', 'every op names the row it writes');
        assert.ok(op.text && op.text.length > 20);
      }
    }
  });

  it('INV-6: the applier is dry-run by default and refuses a stale plan', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'oca-convert-apply.js'), 'utf8');
    assert.match(src, /--apply/, 'writing must be opt-in');
    assert.match(src, /Plan is stale/, 'it must re-verify the target rows before writing');
    assert.match(src, /copyFileSync/, 'it must back the database up first');
    // Only UPDATE. An INSERT or DELETE here would add or remove a hymn.
    assert.ok(!/\bINSERT\b|\bDELETE\b/.test(src),
      'the applier must only UPDATE existing rows, never insert or delete');
  });
});
