'use strict';

/**
 * Feature contract: Parish Book (bound book + weekly insert)
 * Spec: features/parish-book.md
 *
 * The book is printed by a vendor and used for years; the insert is printed
 * every week. If the two ever disagree with the service, the parish holds a
 * wrong text in its hands and nothing on the page says so. So the contract is
 * stated as POSITION, not as labels ([[feedback-assert-structure-not-labels]]):
 *
 *   C1  book + insert, read in order, IS the assembled service — every block,
 *       every word, in sequence — for every Sunday the edition claims, less
 *       exactly what the edition's `omit` rule takes out (C6).
 *   C2  the probe can fail: a service with a changed, missing, or extra text
 *       outside the insert is refused, not silently printed.
 *   C3  the jump and resume markers sit exactly at the stretch's sections:
 *       the reader leaves the book right before the Troparia and comes back
 *       right after the Gospel. The Beatitudes (verses only) are in the book.
 *   C4  the frozen book still matches what the service assembles (drift).
 *       A failure here means copies in the narthex disagree with the app —
 *       rebuild + reprint, or deliberately accept: `npm run parish-book:build`.
 *   C5  "citations only" hides reading TEXT and nothing else.
 *   C6  `omit` removes the Reader's Beatitude troparia and nothing else — every
 *       one of them, on every claimed Sunday (features/beatitudes-print-cues.md).
 *   C7  a Feast of the Lord on a Sunday (festal antiphons, no Beatitudes) is not
 *       claimed: that week prints the full booklet.
 *
 * In-process: the book reads services through the same router the app does
 * (server-lib/parish-book/service-source.js), so no server is spawned.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { boot } = require('../../server-lib/boot/load-fixed');
const { getService } = require('../../server-lib/parish-book/service-source');
const { deriveBook, splitService, reconstruct, renderKey, project } = require('../../server-lib/parish-book/split');
const E = require('../../server-lib/parish-book/editions');
const { insertFor } = require('../../server-lib/routes/parish-book');

const PARISH = 'st-john-damascus-tyler';
const EDITION = 'liturgy-chrysostom';

let ctx, edition, book, claimed; // claimed: [{date, svc}]

before(async () => {
  ctx = boot();
  edition = E.loadEdition(PARISH, EDITION);
  book = E.loadBook(PARISH, EDITION);
  assert.ok(book, `${EDITION}.book.json is not built — run: npm run parish-book:build -- ${PARISH}`);
  claimed = [];
  for (const date of E.candidateDates(edition, edition.sampleYears)) {
    let svc;
    try { svc = await getService(ctx, edition, date); } catch (_) { continue; }
    if (E.claims(edition, date, svc)) claimed.push({ date, svc });
  }
});

const keys = blocks => blocks.map(renderKey);

describe('Parish Book — Chrysostom edition (St. John of Damascus)', () => {
  it('claims a full year of ordinary Sundays per sample year', () => {
    // ~38 per year; a collapse here means membership broke, not that the
    // book got better at fitting.
    assert.ok(claimed.length >= 34 * edition.sampleYears.length, `only ${claimed.length} claimed`);
  });

  it('C1: book + insert reconstructs every claimed Sunday, block for block', () => {
    const misfits = [];
    for (const { date, svc } of claimed) {
      const ins = splitService(svc.blocks, book);
      if (!ins.fits) { misfits.push(`${date} ${svc.liturgicalLabel}: ${JSON.stringify(ins.misfit)}`); continue; }
      const got = keys(reconstruct(book, ins)), want = keys(project(svc.blocks, book.omit));
      const i = got.findIndex((k, n) => k !== want[n]);
      assert.equal(got.length, want.length, `${date}: ${got.length} blocks reconstructed, service has ${want.length} (first difference at ${i})`);
      assert.equal(i, -1, `${date}: block ${i} differs — book+insert ${got[i]} vs service ${want[i]}`);
    }
    assert.deepEqual(misfits, [], 'Sundays the frozen book cannot serve');
  });

  it('C1: the HTTP insert is the same cut (route ↔ split agree)', async () => {
    const { date, svc } = claimed.find(c => c.date.startsWith('2027-01'));
    const ins = await insertFor(ctx, PARISH, date);
    assert.equal(ins.fits, true);
    assert.equal(ins.fingerprint, book.fingerprint);
    assert.deepEqual(keys(reconstruct(book, ins)), keys(project(svc.blocks, book.omit)));
  });

  it('C2: a changed book text is refused, not printed', () => {
    const { svc } = claimed[0];
    const anchor = book.anchors[Math.floor(book.anchors.length / 2)];
    const mutated = svc.blocks.map(b => b.id === anchor ? { ...b, text: b.text + ' (altered)' } : b);
    const r = splitService(mutated, book);
    assert.equal(r.fits, false);
    assert.equal(r.misfit.anchor, anchor);
  });

  it('C2: a missing book text is refused', () => {
    const { svc } = claimed[0];
    const anchor = book.anchors[5];
    const r = splitService(svc.blocks.filter(b => b.id !== anchor), book);
    assert.equal(r.fits, false);
  });

  it('C2: text appearing where the book has no slot is refused, not dropped', () => {
    const { svc } = claimed[0];
    const slotGaps = new Set(book.slots.map(s => s.gap));
    const stretchGaps = new Set(book.stretches.map(s => s.gap));
    // first gap that is neither a slot nor a stretch
    let k = 1; while (slotGaps.has(k) || stretchGaps.has(k)) k++;
    const after = book.anchors[k - 1];
    const blocks = [];
    for (const b of svc.blocks) {
      blocks.push(b);
      if (b.id === after) blocks.push({ id: 'intruder', section: b.section, type: 'hymn', speaker: 'choir', text: 'An unexpected hymn.' });
    }
    const r = splitService(blocks, book);
    assert.equal(r.fits, false, 'an extra hymn outside the insert must not vanish');
  });

  it('C3: the reader leaves before the Troparia and returns after the Gospel', () => {
    for (const { date, svc } of claimed) {
      const ins = splitService(svc.blocks, book);
      const st = ins.stretches.find(s => s.id === 'propers');
      const first = svc.blocks.findIndex(b => b.section === 'Troparia');
      let last = -1; svc.blocks.forEach((b, i) => { if (b.section === 'Gospel Reading') last = i; });
      const start = svc.blocks.indexOf(st.blocks[0]);
      const end = svc.blocks.indexOf(st.blocks[st.blocks.length - 1]);
      assert.equal(start, first, `${date}: insert starts at ${svc.blocks[start]?.section}, not the Troparia`);
      // Nothing of the Third Antiphon is left on the insert.
      assert.ok(!st.blocks.some(b => b.section === 'Third Antiphon'), `${date}: Third Antiphon text on the insert`);
      assert.equal(end, last, `${date}: insert ends at ${svc.blocks[end]?.section}, not the end of the Gospel`);
    }
    const jumps = book.items.filter(i => i.kind === 'jump').length;
    const resumes = book.items.filter(i => i.kind === 'resume').length;
    assert.equal(jumps, book.stretches.length);
    assert.equal(resumes, book.stretches.length);
  });

  it('C4: the frozen book still matches what the service assembles', () => {
    const fresh = deriveBook(claimed.map(c => ({ date: c.date, blocks: c.svc.blocks })), edition);
    assert.equal(fresh.fingerprint, book.fingerprint,
      'The printed Parish Book no longer matches the service. Review the change; if it is right, ' +
      `rebuild (npm run parish-book:build -- ${PARISH}) and plan a reprint.`);
  });

  it('C5: citations-only hides reading text and nothing else', () => {
    const re = new RegExp(edition.citationsOnly.idPattern);
    let hidden = 0;
    for (const { svc } of claimed) {
      for (const b of svc.blocks) {
        if (!re.test(b.id)) continue;
        hidden++;
        assert.match(b.section, /^(Epistle|Gospel) Reading$/, `${b.id} is not a reading`);
        assert.equal(b.speaker, 'reader');
        assert.equal(b.density, 'compact');
      }
    }
    assert.ok(hidden >= 2 * claimed.length, 'every Sunday hides at least an Epistle and a Gospel');
  });

  it('C6: omit removes the Reader\'s Beatitude troparia — all of them, nothing else', () => {
    assert.deepEqual(book.omit, { printCues: true }, 'the frozen book carries its omit rule');
    for (const { date, svc } of claimed) {
      const kept = new Set(project(svc.blocks, book.omit));
      const dropped = svc.blocks.filter(b => !kept.has(b));
      const readerTroparia = svc.blocks.filter(b =>
        b.section === 'Third Antiphon' && b.type === 'hymn' && b.speaker === 'reader');
      assert.ok(readerTroparia.length >= 8, `${date}: only ${readerTroparia.length} Reader troparia — fixture broke`);
      assert.deepEqual(dropped.map(b => b.id), readerTroparia.map(b => b.id),
        `${date}: omit must drop exactly the Reader's troparia`);
    }
    // …and the book prints the Beatitudes themselves, in order, with no troparion.
    const third = book.items.filter(i => i.kind === 'block' && i.block.section === 'Third Antiphon').map(i => i.block.id);
    assert.deepEqual(third, ['beat-open', ...Array.from({ length: 10 }, (_, i) => `beat-v${i + 1}`), 'beat-glory', 'beat-now']);
  });

  it('C7: a Sunday with festal antiphons is not claimed (full booklet that week)', async () => {
    // 2028-08-06: the Transfiguration on a Sunday in ordinary time.
    const svc = await getService(ctx, edition, '2028-08-06');
    assert.equal(svc.antiphons, 'festal');
    assert.ok(edition.membership.seasons.includes(svc.season), 'refused by the antiphons rule, not by season');
    assert.equal(E.claims(edition, '2028-08-06', svc), false);
    assert.equal(E.claims({ ...edition, membership: { ...edition.membership, antiphons: undefined } }, '2028-08-06', svc), true,
      'without the rule the date would be claimed — the probe can fail');
    assert.ok(!claimed.some(c => c.date === '2028-08-06'));
  });
});
