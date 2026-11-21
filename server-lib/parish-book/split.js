'use strict';

/**
 * Parish Book — the book / insert split. Pure functions; no I/O.
 * Spec: features/parish-book.md
 *
 * The Parish Book is a bound book holding the parts of a service that do not
 * change, plus a loose weekly insert holding the parts that do. NOTHING here
 * owns any text: both halves are cut from the assembled service (the same
 * `/api/<service>` blocks the app, the booklet and the audit read), so choir
 * corrections, parish variants and translation overlays reach the book exactly
 * as they reach every other surface.
 *
 * Which blocks are "fixed" is DERIVED, not hand-tagged: a block is a book
 * ANCHOR when it renders identically on at least `anchorShare` of the
 * edition's sample dates. Everything between two anchors is a GAP. The edition
 * config names one or more STRETCHES (e.g. Third Antiphon → Gospel) that the
 * insert carries whole; every other gap that ever has content is an
 * occasional SLOT — the book prints its usual content (when one usual content
 * exists) and the insert lists it only in a week it differs.
 *
 * The contract (test/contracts/parish-book.test.js) is `reconstruct(book,
 * insert) === assembled service`, block for block, for every date the
 * edition claims. A date that cannot satisfy it does not fit the edition and
 * says so; it never prints a book that disagrees with the service.
 */

const crypto = require('crypto');

/** Fields that decide what a block LOOKS like in print. Provenance fields
 *  (_overlay, source, provenance…) are excluded: two Sundays that print the
 *  same words the same way are the same block even if the words were reached
 *  through a different layer. */
const RENDER_FIELDS = ['id', 'section', 'type', 'speaker', 'text', 'label', 'density', 'tone', 'repetitions'];

function renderKey(b) {
  const o = {};
  for (const f of RENDER_FIELDS) if (b[f] !== undefined && b[f] !== null && b[f] !== '') o[f] = b[f];
  return JSON.stringify(o);
}

function gapKey(blocks) { return blocks.map(renderKey).join('\n'); }

/**
 * Derive the book from the edition's sample services.
 *
 * @param {Array<{date:string, blocks:object[]}>} samples
 * @param {{ anchorShare?:number, stretches:Array<{id:string,label:string,fromSection:string,toSection:string}> }} cfg
 * @returns {object} book layout (JSON-serialisable; this is what gets frozen)
 */
function deriveBook(samples, cfg) {
  if (!samples.length) throw new Error('deriveBook: no sample services');
  const share = cfg.anchorShare ?? 0.95;
  const need = Math.ceil(share * samples.length);

  // 1. Count, per block id, how often each rendering occurs.
  const byId = new Map();
  for (const s of samples) {
    for (const b of s.blocks) {
      if (!byId.has(b.id)) byId.set(b.id, new Map());
      const m = byId.get(b.id);
      const k = renderKey(b);
      m.set(k, { n: (m.get(k)?.n || 0) + 1, block: b });
    }
  }
  const anchorKey = new Map(); // id -> renderKey
  for (const [id, m] of byId) {
    let best = null;
    for (const [k, v] of m) if (!best || v.n > best.n) best = { k, ...v };
    if (best.n >= need) anchorKey.set(id, best.k);
  }

  // 2. Anchor ORDER: take it from the first sample that carries every anchor
  //    at its usual rendering; verify every sample that fits agrees.
  const isAnchorHere = b => anchorKey.get(b.id) === renderKey(b);
  let order = null;
  for (const s of samples) {
    const seq = s.blocks.filter(isAnchorHere).map(b => b.id);
    if (seq.length === anchorKey.size) { order = seq; break; }
  }
  if (!order) throw new Error('deriveBook: no sample carries every anchor — lower anchorShare or narrow the edition');
  const anchorBlock = new Map();
  for (const s of samples) for (const b of s.blocks) if (isAnchorHere(b) && !anchorBlock.has(b.id)) anchorBlock.set(b.id, b);

  // 3. Resolve each stretch to an anchor range [from, to] (inclusive), using
  //    the section of the blocks. The range always starts and ends on an
  //    anchor, so the book has a fixed place to jump from and resume at.
  const ref = samples.find(s => s.blocks.filter(isAnchorHere).length === order.length);
  const bounds = (cfg.stretches || []).map(st => {
    const firstIdx = ref.blocks.findIndex(b => b.section === st.fromSection);
    let lastIdx = -1;
    ref.blocks.forEach((b, i) => { if (b.section === st.toSection) lastIdx = i; });
    if (firstIdx < 0 || lastIdx < firstIdx) throw new Error(`stretch ${st.id}: sections not found in order`);
    // The stretch is everything strictly BETWEEN the last anchor before its
    // first section and the first anchor after its last one. Both bounding
    // anchors stay in the book: the reader leaves the book after one and
    // comes back before the other, and the insert carries exactly the gap.
    let f = firstIdx - 1; while (f >= 0 && !isAnchorHere(ref.blocks[f])) f--;
    let t = lastIdx + 1; while (t < ref.blocks.length && !isAnchorHere(ref.blocks[t])) t++;
    if (f < 0 || t >= ref.blocks.length) throw new Error(`stretch ${st.id}: needs a book block on each side`);
    return { st, beforeId: ref.blocks[f].id, afterId: ref.blocks[t].id };
  });
  // A stretch's interior is carried whole by the insert, so an "invariant"
  // block inside it pins nothing. Keeping such blocks as anchors made a Sunday
  // with one extra kontakion fail to fit a book that never prints that
  // stretch at all. Only the two bounding anchors remain.
  for (const { beforeId, afterId } of bounds) {
    const a = order.indexOf(beforeId), z = order.indexOf(afterId);
    for (const id of order.slice(a + 1, z)) anchorKey.delete(id);
    order = order.filter((id, i) => i <= a || i >= z);
  }
  // Gap k sits BEFORE anchor k (k = order.length is the gap after the last
  // anchor). A stretch is one gap: the one before its `after` anchor.
  const stretches = bounds.map(({ st, afterId }) => ({ ...st, gap: order.indexOf(afterId) }));
  const gapInStretch = k => stretches.find(st => st.gap === k);

  // 4. Gaps outside stretches → slots. Tally their contents across samples.
  const slotTally = new Map(); // k -> Map(gapKey -> {n, blocks})
  let fitting = 0;
  for (const s of samples) {
    const g = gapsOf(s.blocks, order, anchorKey);
    if (!g) continue;
    fitting++;
    g.forEach((blocks, k) => {
      if (gapInStretch(k)) return;
      if (!slotTally.has(k)) slotTally.set(k, new Map());
      const t = slotTally.get(k);
      const key = gapKey(blocks);
      t.set(key, { n: (t.get(key)?.n || 0) + 1, blocks });
    });
  }
  const slots = [];
  for (const [k, t] of [...slotTally].sort((a, b) => a[0] - b[0])) {
    const anyContent = [...t.values()].some(v => v.blocks.length);
    if (!anyContent) continue;
    let best = null;
    for (const v of t.values()) if (!best || v.n > best.n) best = v;
    const usual = best.n / fitting >= 0.5 ? best.blocks : null;
    const sample = [...t.values()].find(v => v.blocks.length).blocks;
    slots.push({
      id: 'slot-' + (order[k - 1] || 'start'),
      gap: k,
      section: sample[0].section,
      usual,                          // what the book prints (null → a pointer to the insert)
      usualShare: +(best.n / fitting).toFixed(3),
      varies: t.size > 1,
    });
  }

  // 5. Lay out the book in reading order.
  const items = [];
  const slotAt = new Map(slots.map(s => [s.gap, s]));
  for (let k = 0; k <= order.length; k++) {
    const slot = slotAt.get(k);
    if (slot) items.push({ kind: 'slot', slot: slot.id });
    const st = gapInStretch(k);
    if (st) {
      items.push({ kind: 'jump', stretch: st.id, label: st.label });
      items.push({ kind: 'resume', stretch: st.id, label: st.label });
    }
    if (k === order.length) break;
    items.push({ kind: 'block', block: anchorBlock.get(order[k]) });
  }

  const book = {
    anchors: order,
    anchorKeys: order.map(id => anchorKey.get(id)),
    stretches: stretches.map(({ id, label, fromSection, toSection, gap }) =>
      ({ id, label, fromSection, toSection, gap })),
    slots,
    items,
    sample: { dates: samples.map(s => s.date), fitting },
  };
  book.fingerprint = fingerprint(book);
  return book;
}

/** Split a service into the gaps between anchors, or null if it does not
 *  carry every anchor, in order, at its book rendering. */
function gapsOf(blocks, order, anchorKey) {
  const gaps = [[]];
  let next = 0;
  for (const b of blocks) {
    if (next < order.length && b.id === order[next] && anchorKey.get(b.id) === renderKey(b)) {
      next++; gaps.push([]);
    } else {
      gaps[gaps.length - 1].push(b);
    }
  }
  return next === order.length ? gaps : null;
}

/** Why a service does not fit the book — the first anchor it breaks. */
function misfit(blocks, book) {
  const keyOf = new Map(book.anchors.map((id, i) => [id, book.anchorKeys[i]]));
  const byId = new Map(blocks.map(b => [b.id, b]));
  for (const id of book.anchors) {
    const b = byId.get(id);
    if (!b) return { anchor: id, reason: 'missing' };
    if (renderKey(b) !== keyOf.get(id)) return { anchor: id, reason: 'different text', section: b.section };
  }
  return { reason: 'anchors out of order' };
}

/**
 * Cut one date's service into its insert.
 * @returns {{fits:true, stretches:{id,label,blocks}[], also:{slot,section,blocks}[]} | {fits:false, misfit}}
 */
function splitService(blocks, book) {
  const anchorKey = new Map(book.anchors.map((id, i) => [id, book.anchorKeys[i]]));
  const gaps = gapsOf(blocks, book.anchors, anchorKey);
  if (!gaps) return { fits: false, misfit: misfit(blocks, book) };

  // A gap outside every stretch with content the book has no slot for would
  // be silently dropped — that is a misfit, not an omission.
  const slotByGap = new Map(book.slots.map(s => [s.gap, s]));
  const inStretchGap = k => book.stretches.some(st => st.gap === k);
  for (let k = 0; k < gaps.length; k++) {
    if (gaps[k].length && !inStretchGap(k) && !slotByGap.has(k)) {
      return { fits: false, misfit: { reason: 'text where the book has no slot', after: book.anchors[k - 1], section: gaps[k][0].section } };
    }
  }

  const stretches = book.stretches.map(st => ({ id: st.id, label: st.label, blocks: gaps[st.gap] }));

  const also = [];
  for (const s of book.slots) {
    const here = gaps[s.gap];
    if (s.usual && gapKey(here) === gapKey(s.usual)) continue;
    also.push({ slot: s.id, section: s.section, blocks: here, replacesUsual: !!s.usual });
  }
  return { fits: true, stretches, also };
}

/** Book + insert → the full service, in order. The contract's left side. */
function reconstruct(book, insert) {
  const slots = new Map(book.slots.map(s => [s.id, s]));
  const also = new Map((insert.also || []).map(a => [a.slot, a.blocks]));
  const stretch = new Map((insert.stretches || []).map(s => [s.id, s.blocks]));
  const out = [];
  for (const it of book.items) {
    if (it.kind === 'block') out.push(it.block);
    else if (it.kind === 'jump') out.push(...(stretch.get(it.stretch) || []));
    else if (it.kind === 'slot') {
      const s = slots.get(it.slot);
      out.push(...(also.has(it.slot) ? also.get(it.slot) : (s.usual || [])));
    }
  }
  return out;
}

/** A stable hash of what the book PRINTS (layout + text), not of when or
 *  from which dates it was derived. Two builds that would print the same book
 *  have the same fingerprint. */
function fingerprint(book) {
  const printed = book.items.map(it => {
    if (it.kind === 'block') return renderKey(it.block);
    if (it.kind === 'slot') {
      const s = book.slots.find(x => x.id === it.slot);
      return 'slot:' + s.id + ':' + (s.usual ? gapKey(s.usual) : '-');
    }
    return it.kind + ':' + it.stretch + ':' + it.label;
  }).join('\n');
  return crypto.createHash('sha256').update(printed).digest('hex').slice(0, 12);
}

module.exports = { deriveBook, splitService, reconstruct, fingerprint, renderKey, RENDER_FIELDS };
