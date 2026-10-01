'use strict';

/**
 * Lookup over the choir-asset index. Reads the tracked
 * docs/choir-packets/index.json, so these are deterministic.
 *
 * Assertions are about PROPERTIES, not counts — the index grows every week, and
 * a test that pins counts would fail on the next blast for no good reason.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  loadIndex, musicForService, attachToBlocks,
  incipitMatches, normalizeIncipit, contentDateFor, SECTION_ALIASES,
} = require('../server-lib/search/choir-assets.js');

// ── register normalization ───────────────────────────────────────────────
//
// The director's sources are `yy` where Tyler renders `tt`, so a comparison has
// to flatten the archaic forms before it means anything.

test('archaic forms normalize toward the modern register', () => {
  assert.deepEqual(normalizeIncipit('Thou hast received grace'), ['you', 'have', 'received', 'grac']);
  // A crude stem, but a CONSISTENT one: the archaic and modern forms of the same
  // verb must land on the same token. An eth-only strip gave endur/endures.
  assert.deepEqual(normalizeIncipit('Thy mercy endureth'), ['your', 'mercy', 'endur']);
  assert.deepEqual(normalizeIncipit('endureth'), normalizeIncipit('endures'));
  assert.deepEqual(normalizeIncipit('miracles'), normalizeIncipit('miracle'));
});

test('phrase marks and punctuation are stripped', () => {
  assert.deepEqual(
    normalizeIncipit('With rays of miracles * dispel every infirmity,'),
    ['with', 'ray', 'of', 'miracl', 'dispel', 'every', 'infirmity']);
});

// ── incipit matching: precision over recall ─────────────────────────────
//
// All five pairs below are REAL, measured against our 2026-07-01 render. Only
// two agree closely enough to bind; the other three are the same hymn in a
// different translation, and binding them would point a singer at a sheet whose
// words do not match what is in front of them.

test('a leading-word match binds', () => {
  assert.equal(incipitMatches(
    'With rays of miracles * dispel every infirmity of our sickness',
    'With rays of miracles'), 1);
});

test('a truncated incipit still binds on its leading words', () => {
  // The director cuts the incipit mid-phrase: "Boundless is the grace that"
  // against our "Boundless is the grace of the saints". Four words agree.
  assert.equal(incipitMatches(
    'Boundless is the grace of the saints, which they have received',
    'Boundless is the grace that'), 1);
});

test('the same hymn in a different translation does NOT bind', () => {
  assert.equal(incipitMatches(
    'Having received grace freely from Christ God, * ye heal the sick',
    'As you received grace from'), 0);
  assert.equal(incipitMatches(
    'Having first been trained well as physicians, * ye cleansed',
    'At first instructed by the'), 0);
});

test('an incipit with no counterpart does not bind to something else', () => {
  assert.equal(incipitMatches(
    'Creation was transformed by Thy crucifixion, O Word',
    'You appeared as spiritual rivers'), 0);
});

test('too short to be distinctive refuses to match', () => {
  assert.equal(incipitMatches('Glory to Thee', 'Glory'), 0);
});

// ── the date shift, again, on the server side ───────────────────────────

test('contentDateFor shifts the vespers family and nothing else', () => {
  assert.equal(contentDateFor('2026-09-26', 'greatVespers'), '2026-09-27');
  assert.equal(contentDateFor('2026-09-30', 'dailyVespers'), '2026-10-01');
  assert.equal(contentDateFor('2026-09-13', 'allNightVigil'), '2026-09-14');
  assert.equal(contentDateFor('2026-09-27', 'liturgy'), '2026-09-27');
  assert.equal(contentDateFor('2026-09-27', 'matins'), '2026-09-27');
});

// ── scope: the leak that shipped once already ──────────────────────────

test('Vespers per-hymn sheets are NOT offered for Matins or Liturgy', () => {
  // The 97 per-hymn sheets in docs/Vespers-july share a date with that day's
  // Matins and Liturgy. Before `scope` was recorded at build time, all six
  // sheets for 2026-07-01 were offered to all three services.
  const vespers = musicForService('2026-06-30', 'dailyVespers',
    { contentDate: '2026-07-01', tone: 3 });
  assert.ok(vespers.blocks.length > 0, 'precondition: the Vespers sheets exist');

  for (const svc of ['matins', 'liturgy']) {
    const m = musicForService('2026-06-30', svc, { contentDate: '2026-06-30', tone: 3 });
    assert.equal(m.blocks.length, 0, `${svc} must not be offered Vespers hymn sheets`);
  }
});

test('a service booklet is found for the date it is sung', () => {
  const m = musicForService('2026-09-26', 'greatVespers',
    { contentDate: '2026-09-27', tone: 8 });
  assert.equal(m.booklet.length, 1);
  assert.match(m.booklet[0].filename, /Great Vespers/);
  assert.equal(m.booklet[0].pages, 12, 'page count must survive into the index');
});

test('the booklet for one service is not offered for another', () => {
  const m = musicForService('2026-09-26', 'liturgy', { contentDate: '2026-09-26', tone: 8 });
  assert.equal(m.booklet.length, 0);
});

// ── attachment ────────────────────────────────────────────────────────

test('attachToBlocks attaches only on section + tone + incipit, and returns the rest', () => {
  const blocks = [
    { section: 'Lord, I Have Cried', tone: 1, text: 'With rays of miracles * dispel every infirmity' },
    { section: 'Lord, I Have Cried', tone: 1, text: 'Having first been trained well as physicians' },
    { section: 'Aposticha',          tone: 6, text: 'Something else entirely' },
  ];
  const sheets = [
    { asset: 'a', ourSection: 'Lord, I Have Cried', tone: 1, incipit: 'With rays of miracles', position: '6-5' },
    { asset: 'b', ourSection: 'Lord, I Have Cried', tone: 1, incipit: 'At first instructed by the', position: '4-3' },
    { asset: 'c', ourSection: 'Aposticha',          tone: 6, incipit: 'You ever have Christ working', position: 'Glory' },
  ];
  const { attached, unattached } = attachToBlocks(blocks, sheets);
  assert.equal(attached, 1);
  assert.equal(blocks[0].music[0].asset, 'a');
  assert.equal(blocks[1].music, undefined, 'a different translation must not attach');
  assert.deepEqual(unattached.map((u) => u.asset).sort(), ['b', 'c']);
});

test('a tone disagreement refuses the binding outright', () => {
  // Tone matched on every pair we measured, so a mismatch means the wrong hymn.
  const blocks = [{ section: 'Lord, I Have Cried', tone: 4, text: 'With rays of miracles * dispel' }];
  const sheets = [{ asset: 'a', ourSection: 'Lord, I Have Cried', tone: 1, incipit: 'With rays of miracles' }];
  const { attached } = attachToBlocks(blocks, sheets);
  assert.equal(attached, 0, 'identical incipit, wrong tone — must not bind');
});

// ── the index itself ─────────────────────────────────────────────────

test('the tracked index loads and every binding names a known asset', () => {
  const index = loadIndex();
  assert.ok(Array.isArray(index.bindings) && index.bindings.length > 0);
  for (const b of index.bindings) {
    assert.ok(index.assets[b.asset], `binding references unknown asset ${b.asset}`);
  }
});

test("the director's section names map onto ours", () => {
  assert.equal(SECTION_ALIASES['Lord I Call'], 'Lord, I Have Cried');
  assert.equal(SECTION_ALIASES['Aposticha'], 'Aposticha');
});

// ── search: the "find" seam ─────────────────────────────────────────────

const { searchMusic } = require('../server-lib/search/choir-assets.js');

test('a commemoration finds that saint\'s sheets', () => {
  const r = searchMusic('Cosmas');
  assert.ok(r.length > 0);
  assert.ok(r.every((x) => /Cosmas/i.test(x.commemoration || x.label)));
});

test('a melody source is searchable', () => {
  const r = searchMusic('OBIKHOD');
  assert.ok(r.length > 0);
  assert.ok(r.every((x) => x.melody === 'OBIKHOD'));
});

test('"tone 8" is read as a tone filter, not as text', () => {
  const r = searchMusic('tone 8');
  assert.ok(r.length > 0);
  assert.ok(r.every((x) => x.tone === 8), 'every hit must actually be tone 8');
  // The literal string "tone 8" appears in no commemoration or incipit, so a
  // substring search would return nothing at all.
  assert.ok(r.some((x) => x.kind === 'tone'), 'the tone packets themselves should rank');
});

test('an incipit finds the one hymn it belongs to', () => {
  const r = searchMusic('With rays of miracles');
  assert.equal(r.length, 1);
  assert.equal(r[0].position, '6-5');
});

test('UNBOUND assets are findable — hiding them would hide the backlog', () => {
  const r = searchMusic('Lord Have Mercy');
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'unbound');
  assert.match(r[0].note, /not yet bound/);
});

test('a more specific field outranks a filename match', () => {
  // "Theotokos" appears in a day-sheet title and in various filenames; the
  // title match must sort above the incidental ones.
  const r = searchMusic('Blachernae');
  assert.ok(r.length >= 1);
  assert.equal(r[0].kind, 'day');
});

test('a query under two characters returns nothing', () => {
  assert.deepEqual(searchMusic('a'), []);
  assert.deepEqual(searchMusic(''), []);
  assert.deepEqual(searchMusic(null), []);
});

test('superseded sheets never surface in search', () => {
  const r = searchMusic('vespers', { limit: 200 });
  assert.ok(r.every((x) => x.kind !== 'superseded'));
});

test('the limit is honoured', () => {
  assert.ok(searchMusic('tone 8', { limit: 3 }).length <= 3);
});
