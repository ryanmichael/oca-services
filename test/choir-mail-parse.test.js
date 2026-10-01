'use strict';

/**
 * Falsification suite for the choir-email filename parser.
 * docs/choir-email-pipeline-design.md §8.
 *
 * The corpus below is the REAL filename history, taken from the five existing
 * docs/<dates>/ packet folders and from the Gmail attachment metadata — not
 * invented examples. The hard cases are the point:
 *
 *   - a misspelled, year-less feast Liturgy
 *   - a tone packet that must not become a service
 *   - two dateless hymn sheets that must stay UNRESOLVED rather than be guessed
 *   - the Saturday Vespers date-shift
 *   - a "(1)" re-download
 *
 * A parser reporting zero unresolved on this corpus is wrong, not clean.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { parseAttachment, DATE_SHIFTED, addDays } = require('../scripts/choir-mail-parse.js');
const { canonicalOrder, revisionName } = require('../scripts/choir-mail-fetch.js');

// ── the real history ────────────────────────────────────────────────────────
const CORPUS = [
  { emailDate: '2026-09-24', files: [
    'Daily Vespers 10.01.26.pdf',
    'Daily Vespers 10.01.26 (1).pdf',
    'Great Vespers 09.26.26.pdf',
    'Divine Liturgy 09.27.26.pdf',
    'Divine Liturgy 09.27.26 (1).pdf',
    'INTRO to TONE 8 packet.pdf',
    'Lord Have Mercy (Byzantine).pdf',
    'Soul Shall Rejoice.Prophets Proclaimed (Hierarchical Lit).pdf',
  ] },
  { emailDate: '2026-09-16', files: [
    '09.19.26 Great Vespers.pdf',
    '09.20.26 Divine Liturgy.pdf',
    'INTRO to TONE 7 packet.pdf',
  ] },
  { emailDate: '2026-09-10', files: [
    '09.12.26 Great Vespers.pdf',
    '09.13.26 Divine Liturgy.pdf',
    '09.14 Feastal Liturgy for the Exaltation of the Cross.pdf',
    'INTRO to TONE 6 packet.pdf',
  ] },
  { emailDate: '2026-08-02', files: ['08.06 Transfiguration Liturgy.pdf'] },
  { emailDate: '2026-08-01', files: [
    '08.01.26 Great Vespers.pdf',
    '08.02.26 Divine Liturgy.pdf',
  ] },
];

const parseAll = () =>
  CORPUS.flatMap(({ emailDate, files }) =>
    files.map((f) => ({ emailDate, ...parseAttachment(f, emailDate) })));

// ── the date-shift, which is the trap this whole field exists to close ──────

test('Saturday Great Vespers: apiDate is the eve, contentDate is the morrow', () => {
  const r = parseAttachment('Great Vespers 09.26.26.pdf', '2026-09-24');
  assert.equal(r.kind, 'service');
  assert.equal(r.service, 'greatVespers');
  assert.equal(r.apiDate, '2026-09-26');      // Saturday — the civil evening
  assert.equal(r.contentDate, '2026-09-27');  // Sunday — where the texts come from
  assert.equal(r.apiPath, '/api/service');
  assert.equal(r.confidence, 'high');
});

test('Divine Liturgy is NOT shifted', () => {
  const r = parseAttachment('Divine Liturgy 09.27.26.pdf', '2026-09-24');
  assert.equal(r.service, 'liturgy');
  assert.equal(r.apiDate, '2026-09-27');
  assert.equal(r.contentDate, r.apiDate);
  assert.equal(r.apiPath, '/api/liturgy');
});

test('Daily Vespers shifts too', () => {
  const r = parseAttachment('Daily Vespers 10.01.26.pdf', '2026-09-24');
  assert.equal(r.service, 'dailyVespers');
  assert.equal(r.apiDate, '2026-10-01');      // Thursday evening
  assert.equal(r.contentDate, '2026-10-02');
});

test('presanctified is evening-served but unshifted, per service-catalog.js', () => {
  assert.ok(!DATE_SHIFTED.has('presanctified'));
  const r = parseAttachment('Presanctified Liturgy 03.11.27.pdf', '2027-03-08');
  assert.equal(r.service, 'presanctified');
  assert.equal(r.contentDate, r.apiDate);
});

// ── both filename field orders ─────────────────────────────────────────────

test('date-first and service-first filenames resolve identically', () => {
  const a = parseAttachment('09.19.26 Great Vespers.pdf', '2026-09-16');
  const b = parseAttachment('Great Vespers 09.19.26.pdf', '2026-09-16');
  assert.equal(a.service, b.service);
  assert.equal(a.apiDate, b.apiDate);
  assert.equal(a.apiDate, '2026-09-19');
});

// ── the misspelled, year-less feast ────────────────────────────────────────

test('"09.14 Feastal Liturgy" — no year, misspelled — resolves and says so', () => {
  const r = parseAttachment(
    '09.14 Feastal Liturgy for the Exaltation of the Cross.pdf', '2026-09-10');
  assert.equal(r.kind, 'service');
  assert.equal(r.service, 'liturgy');
  assert.equal(r.apiDate, '2026-09-14');
  assert.equal(r.confidence, 'medium', 'an inferred year must not claim high confidence');
  assert.ok(r.reasons.some((x) => /inferred/.test(x)), 'must state that the year was inferred');
});

test('a year-less date near New Year rolls into the next year', () => {
  const r = parseAttachment('01.07 Nativity Liturgy.pdf', '2026-12-28');
  assert.equal(r.apiDate, '2027-01-07');
});

test('a year-less date just after New Year stays in the previous year', () => {
  const r = parseAttachment('12.28 Great Vespers.pdf', '2027-01-02');
  assert.equal(r.apiDate, '2026-12-28');
});

// ── the tone packet must not become a service ────────────────────────────

test('"INTRO to TONE 8 packet" is a tone packet, not a service', () => {
  const r = parseAttachment('INTRO to TONE 8 packet.pdf', '2026-09-24');
  assert.equal(r.kind, 'tone');
  assert.equal(r.tone, 8);
  assert.equal(r.service, null);
  assert.equal(r.apiDate, null);
  assert.equal(r.stored, 'pdf/tone-08-intro.pdf');
});

test('a tone named alongside a service stays a service, and keeps the tone', () => {
  const r = parseAttachment('Great Vespers Tone 5 07.11.26.pdf', '2026-07-09');
  assert.equal(r.kind, 'service');
  assert.equal(r.service, 'greatVespers');
  assert.equal(r.tone, 5);
});

test('an out-of-range tone is dropped, not recorded', () => {
  const r = parseAttachment('INTRO to TONE 9 packet.pdf', '2026-09-24');
  assert.equal(r.tone, null);
  assert.notEqual(r.kind, 'tone');
});

// ── the files that MUST stay unresolved ───────────────────────────────────

test('"Lord Have Mercy (Byzantine)" is unclassified — no date, no service', () => {
  const r = parseAttachment('Lord Have Mercy (Byzantine).pdf', '2026-09-24');
  assert.equal(r.kind, 'unclassified');
  assert.ok(r.stored.startsWith('pdf/_unclassified/'));
  assert.equal(r.service, null);
});

test('"(Hierarchical Lit)" must NOT be read as a Liturgy', () => {
  const r = parseAttachment(
    'Soul Shall Rejoice.Prophets Proclaimed (Hierarchical Lit).pdf', '2026-09-24');
  assert.equal(r.kind, 'unclassified');
  assert.equal(r.service, null, 'abbreviated "Lit" is not enough to claim a service');
});

test('a service with no date anywhere is unresolved, and names the half it found', () => {
  const r = parseAttachment('Great Vespers.pdf', '2026-09-24');
  assert.equal(r.kind, 'unclassified');
  assert.ok(r.reasons.some((x) => /no date/.test(x)));
});

test('an impossible date is refused rather than rolled over', () => {
  const r = parseAttachment('Great Vespers 02.30.26.pdf', '2026-02-27');
  assert.equal(r.kind, 'unclassified', 'Feb 30 must not become Mar 2');
});

// ── the "(1)" re-download ────────────────────────────────────────────────

test('a "(1)" re-download classifies and stores identically to the original', () => {
  const a = parseAttachment('Daily Vespers 10.01.26.pdf', '2026-09-24');
  const b = parseAttachment('Daily Vespers 10.01.26 (1).pdf', '2026-09-24');
  assert.equal(b.apiDate, a.apiDate);
  assert.equal(b.stored, a.stored, 'name-level identity; sha256 settles byte identity');
  assert.ok(b.reasons.some((x) => /duplicate-download/.test(x)));
});

// ── corpus-level invariants ─────────────────────────────────────────────

test('the whole real corpus parses without throwing', () => {
  const all = parseAll();
  assert.equal(all.length, 18, '8 + 3 + 4 + 1 + 2 across the five blasts');
  for (const r of all) {
    assert.ok(['service', 'tone', 'unclassified'].includes(r.kind), r.original);
    assert.ok(typeof r.stored === 'string' && r.stored.length > 0, r.original);
  }
});

test('the corpus yields exactly the two known dateless hymn sheets as unresolved', () => {
  const unresolved = parseAll().filter((r) => r.kind === 'unclassified');
  assert.equal(unresolved.length, 2,
    'zero unresolved would mean the parser is guessing; more means it regressed');
  assert.deepEqual(
    unresolved.map((r) => r.original).sort(),
    ['Lord Have Mercy (Byzantine).pdf',
     'Soul Shall Rejoice.Prophets Proclaimed (Hierarchical Lit).pdf']);
});

test('every resolved service names a real endpoint and a sane date window', () => {
  for (const r of parseAll().filter((x) => x.kind === 'service')) {
    assert.ok(r.apiPath, `${r.original} resolved no endpoint`);
    assert.match(r.apiDate, /^\d{4}-\d{2}-\d{2}$/, r.original);
    const delta = (Date.parse(r.apiDate) - Date.parse(r.emailDate)) / 86400000;
    assert.ok(delta >= -2 && delta <= 45,
      `${r.original}: resolved ${r.apiDate} from a ${r.emailDate} email (${delta}d)`);
  }
});

/**
 * An INDEPENDENT oracle: every (apiDate, contentDate) pair in the real corpus,
 * written out by hand from the calendar rather than derived from DATE_SHIFTED.
 *
 * Deriving the expectation from the same table the code reads would assert only
 * that the parser agrees with itself — a mutation of DATE_SHIFTED would pass.
 * That is the failure mode in feedback_assert_structure_not_labels, and an
 * earlier draft of this test had it.
 */
const EXPECTED_DATES = {
  'Daily Vespers 10.01.26.pdf':                        ['2026-10-01', '2026-10-02'],
  'Daily Vespers 10.01.26 (1).pdf':                    ['2026-10-01', '2026-10-02'],
  'Great Vespers 09.26.26.pdf':                        ['2026-09-26', '2026-09-27'],
  'Divine Liturgy 09.27.26.pdf':                       ['2026-09-27', '2026-09-27'],
  'Divine Liturgy 09.27.26 (1).pdf':                   ['2026-09-27', '2026-09-27'],
  '09.19.26 Great Vespers.pdf':                        ['2026-09-19', '2026-09-20'],
  '09.20.26 Divine Liturgy.pdf':                       ['2026-09-20', '2026-09-20'],
  '09.12.26 Great Vespers.pdf':                        ['2026-09-12', '2026-09-13'],
  '09.13.26 Divine Liturgy.pdf':                       ['2026-09-13', '2026-09-13'],
  '09.14 Feastal Liturgy for the Exaltation of the Cross.pdf':
                                                       ['2026-09-14', '2026-09-14'],
  '08.06 Transfiguration Liturgy.pdf':                 ['2026-08-06', '2026-08-06'],
  '08.01.26 Great Vespers.pdf':                        ['2026-08-01', '2026-08-02'],
  '08.02.26 Divine Liturgy.pdf':                       ['2026-08-02', '2026-08-02'],
};

test('every service packet hits its hand-written (apiDate, contentDate) pair', () => {
  const services = parseAll().filter((x) => x.kind === 'service');
  assert.equal(services.length, Object.keys(EXPECTED_DATES).length,
    'the oracle must cover every service packet in the corpus');
  for (const r of services) {
    const want = EXPECTED_DATES[r.original];
    assert.ok(want, `no hand-written expectation for ${r.original}`);
    assert.deepEqual([r.apiDate, r.contentDate], want, r.original);
  }
});

test('each Great Vespers packet sits on a Saturday and draws from the Sunday', () => {
  // The shift is only correct if the weekday relationship holds. Checking the
  // weekday, not the table, is what makes this independent.
  for (const r of parseAll().filter((x) => x.service === 'greatVespers')) {
    const eve = new Date(`${r.apiDate}T12:00:00Z`).getUTCDay();
    const content = new Date(`${r.contentDate}T12:00:00Z`).getUTCDay();
    assert.equal(eve, 6, `${r.original}: Great Vespers eve should be Saturday`);
    assert.equal(content, 0, `${r.original}: its content should come from Sunday`);
  }
});

// ── canonical ordering: the original must beat its "(1)" re-download ───────

test('an un-suffixed filename sorts before its "(1)" re-download', () => {
  // A plain sort gets this backwards — space (0x20) < dot (0x2e) — which would
  // record the re-download as the packet's provenance. Observed on the real
  // 2026-09-24 folder.
  const files = ['Daily Vespers 10.01.26 (1).pdf', 'Daily Vespers 10.01.26.pdf'];
  assert.deepEqual([...files].sort(), files, 'precondition: naive sort is wrong');
  assert.deepEqual([...files].sort(canonicalOrder),
    ['Daily Vespers 10.01.26.pdf', 'Daily Vespers 10.01.26 (1).pdf']);
});

test('revision names climb -r2, -r3 and keep the extension', () => {
  assert.equal(revisionName('pdf/great-vespers-2026-09-26.pdf', 2),
    'pdf/great-vespers-2026-09-26-r2.pdf');
  assert.equal(revisionName('pdf/great-vespers-2026-09-26.pdf', 3),
    'pdf/great-vespers-2026-09-26-r3.pdf');
});

// ── the eve-reading discriminator ────────────────────────────────────────
//
// The director uses two filename conventions. Without the standing-weekday
// discriminator, EVERY Saturday Great Vespers sheet looks ambiguous, because the
// Friday before a feast genuinely has Great Vespers too — the first run of the
// verifier produced 15 useless findings that way. A check that fires every week
// gets ignored, so these four cases pin the logic down.

const { eveVerdict } = require('../scripts/choir-week-verify.js');

test('a Saturday Great Vespers sheet is read as the civil evening', () => {
  // 2026-09-26 is a Saturday. Friday 09-25 also serves Great Vespers (09-26 is
  // the Repose of St John the Theologian), so altServed is genuinely true.
  assert.equal(eveVerdict('greatVespers', '2026-09-26', true), 'standing-ok');
});

test('a Thursday "Daily Vespers" sheet is a MISREAD of the liturgical day', () => {
  // The real 2026-09-24 case: 10-01 is a Thursday and the Protection of the
  // Theotokos; the service was sung Wednesday 09-30. Read as a civil evening it
  // renders 10-02 and loses the feast entirely.
  assert.equal(eveVerdict('dailyVespers', '2026-10-01', true), 'misread');
});

test('when only one reading is served there is nothing to decide', () => {
  assert.equal(eveVerdict('greatVespers', '2026-09-26', false), 'single');
  assert.equal(eveVerdict('dailyVespers', '2026-10-01', false), 'single');
});

test('a vigil has no standing weekday, so both readings stay open', () => {
  assert.equal(eveVerdict('allNightVigil', '2026-09-13', true), 'ambiguous');
});

test('a non-vespers service is never eve-ambiguous', () => {
  assert.equal(eveVerdict('liturgy', '2026-09-27', true), 'single');
});

// ── the director's per-hymn filename convention ──────────────────────────
//
// docs/Vespers-july holds 119 files in a far richer scheme than the service
// booklets use:
//   MMDD - section - position - commemoration - incipit - melody - Tone
// It maps almost 1:1 onto ServiceBlock, which is what makes per-hymn binding
// possible at all. See docs/choir-asset-addressing-design.md.

const { parsePerHymn } = require('../scripts/choir-index-build.js');

test('a full per-hymn filename decomposes into every field', () => {
  const r = parsePerHymn(
    '0701-Lord I Call-4-3-Unmercenaries Cosmas and Damian-At first instructed by the-OBIKHOD-Tone1.pdf',
    2026);
  assert.equal(r.kind, 'block');
  assert.equal(r.section, 'Lord I Call');
  assert.equal(r.position, '4-3', 'the position itself contains a hyphen');
  assert.equal(r.tone, 1);
  assert.equal(r.melody, 'OBIKHOD');
  assert.equal(r.commemoration, 'Unmercenaries Cosmas and Damian');
  assert.equal(r.incipit, 'At first instructed by the');
  assert.equal(r.contentDate, '2026-07-01', 'the filename date is the LITURGICAL day');
  assert.equal(r.apiDate, '2026-06-30', 'Lord I Call is sung the evening before');
});

test('Glory and GloryNow are positions, not commemorations', () => {
  const g = parsePerHymn(
    '0701-Lord I Call-Glory-Unmercenaries Cosmas and Damian-Boundless is the grace that-OBIKHOD-Tone6.pdf', 2026);
  assert.equal(g.position, 'Glory');
  assert.equal(g.tone, 6);

  const gn = parsePerHymn(
    '0706-Aposticha-GloryNow-Theotokion-By the will of the-OBIKHOD-Tone3.pdf', 2026);
  assert.equal(gn.position, 'GloryNow', '"GloryNow" must win over the "Glory" alternative');
  assert.equal(gn.commemoration, 'Theotokion');
  assert.equal(gn.incipit, 'By the will of the');
});

test('a whole-day sheet is a day binding, not a block', () => {
  const r = parsePerHymn('0702-Placing of Robe of Theotokos at Blachernae.pdf', 2026);
  assert.equal(r.kind, 'day');
  assert.equal(r.contentDate, '2026-07-02');
  assert.equal(r.section, undefined);
});

test('only Vespers sections get an eve derived', () => {
  assert.equal(parsePerHymn('0701-Aposticha-Glory-X-Y-OBIKHOD-Tone6.pdf', 2026).apiDate, '2026-06-30');
  // Troparion is sung at several services; guessing an eve would be wrong.
  assert.equal(parsePerHymn('0701-Troparion-1-X-Y-OBIKHOD-Tone6.pdf', 2026).apiDate, null);
});

test('a date-RANGE filename refuses to parse and stays unbound', () => {
  // Both real files, both for the Fathers of the First Six Ecumenical Councils.
  // A guess here would bind a week's music to one arbitrary day.
  assert.equal(parsePerHymn('0713 thru 19-Fathers-First Six Ecumenical Councils-Vespers Music.pdf', 2026), null);
  assert.equal(parsePerHymn('071419-Fathers-First Six Ecumenical Councils-Vespers Music.pdf', 2026), null);
});

test('an impossible MMDD is refused', () => {
  assert.equal(parsePerHymn('9932-Lord I Call-1-X-Y-OBIKHOD-Tone1.pdf', 2026), null);
});

test('the year is marked inferred, because MMDD does not carry one', () => {
  const r = parsePerHymn('0701-Lord I Call-1-X-Y-OBIKHOD-Tone1.pdf', 2026);
  assert.equal(r.yearInferred, true);
});
