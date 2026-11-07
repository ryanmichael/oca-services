'use strict';

/**
 * Pairs the Old Testament lessons DECLARED on a calendar entry with the
 * scripture text orthocal carries for that day.
 *
 * Both /api/service and /api/vigil used to do this positionally —
 * `vesperReadings[i]` — which is only correct when orthocal's Vespers list is
 * exactly our appointed list, in our order. It frequently is not:
 *
 *   2026-11-08 (Synaxis of the Archangels) carries SIX Vespers readings in the
 *   mirror, because upstream also keys the Unmercenaries' common-of-a-martyr
 *   set to that date (see project_orthocal_upstream_defects). The three the
 *   OCA order appoints — Joshua 5:13-15, Judges 6:2/7/11-24, Isaiah 14:7-20 —
 *   sit at indices 1, 3 and 5. Positional pairing printed Isaiah 43:9 under
 *   the heading "Joshua 5:13-15", Joshua 5 under "Judges", and Wisdom 3 under
 *   "Isaiah 14:7-20": three wrong lessons, each under a correct citation, and
 *   nothing anywhere reported a fault. Measured 2026-11-07.
 *
 * The citation is the thing we are confident about — it comes from the OCA
 * order or the Menaion. So match on it, and when no match can be established
 * leave the text absent: the renderer then prints `[Joshua 5:13-15]`, which
 * sends the reader to the book. A placeholder is recoverable in church; the
 * wrong lesson read aloud is not.
 */

// Orthocal spells several books differently from the OCA orders and from our
// menaion files: "3 [1] Kings" for I Kings, "Wisdom of Solomon" where a file
// may say "Wisdom", and it prefixes conflated readings "Composite 17 - ".
const BOOK_ALIASES = new Map(Object.entries({
  '1kings': '3kings', 'ikings': '3kings', 'firstkings': '3kings',
  '2kings': '4kings', 'iikings': '4kings', 'secondkings': '4kings',
  '1samuel': '1kingdoms', 'isamuel': '1kingdoms',
  '2samuel': '2kingdoms', 'iisamuel': '2kingdoms',
  'wisdom': 'wisdomofsolomon',
  'wisdomofsolomonwisdomofsolomon': 'wisdomofsolomon',
  'canticles': 'songofsongs', 'songofsolomon': 'songofsongs',
  'sirach': 'wisdomofsirach', 'ecclesiasticus': 'wisdomofsirach',
  '3kingdoms': '3kings', '4kingdoms': '4kings',
}));

function normalizeBook(book) {
  const key = String(book || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')      // "3 [1] Kings" → "3 Kings"
    .replace(/[^a-z0-9]/g, '');
  return BOOK_ALIASES.get(key) || key;
}

// "6:2, 7, 11-24" and "6.2, 7, 11-24" are the same pericope; orthocal uses
// dots, the orders use colons, and en-dashes turn up in hand-authored files.
function normalizeRef(ref) {
  return String(ref || '')
    .toLowerCase()
    .replace(/–|—/g, '-')
    .replace(/\./g, ':')
    .replace(/[^a-z0-9:,\-]/g, '');
}

// A conflated ("composite") reading carries its own identifier on both sides —
// february-02 declares the book as `Composite 6 (Exodus 12:51-13:3; Leviticus
// 12:2-7; Numbers 8:16-17)` and orthocal displays `Composite 6 - Exodus 12,
// 13; Numbers 8; Leviticus 12`. The books are listed in a different order and
// at different granularity, so neither book nor pericope will ever agree; the
// number is the one thing that does, and it is exact.
function compositeNumber(s) {
  const m = String(s || '').match(/composite\s+(\d+)/i);
  return m ? m[1] : null;
}

// Splits an orthocal `display` into { book, pericope }: "Composite 17 - Exodus
// 40:1-5, 9, 10" → { book: 'Exodus', pericope: '40:1-5, 9, 10' }.
function splitDisplay(display) {
  const s = String(display || '')
    .replace(/​/g, '')
    .replace(/^\s*composite\s+\d+\s*[-–—]\s*/i, '')
    // "3 [1] Kings" is orthocal's way of giving both numberings. Without this
    // the bracket blocked the split below and the WHOLE string became the book
    // name, which on 2026-07-20 let the sole-same-book rule pair "3 Kings 18,
    // 19" (Composite 13) with Composite 14's text. Found 2026-11-07.
    .replace(/(\d)\s*\[\s*\d+\s*\]/g, '$1')
    .trim();
  // The book part has to END in a letter or a period ("Wisdom of Solomon",
  // "3 Kings", "Jas."), so a leading volume number stays with the book and a
  // chapter-only reference ("3 Kings 18, 19") still splits.
  const m = s.match(/^(.*?[A-Za-z.])\s+(\d.*)$/);
  if (m) return { book: m[1].trim(), pericope: m[2].trim() };
  return { book: s, pericope: '' };
}

/**
 * @param {Array<{order?:number,book:string,pericope?:string,reference?:string}>} declared
 * @param {Array<{display?:string,passage?:Array<{content:string}>}>} orthocalVespers
 * @returns {Array} declared readings, each with `text` when a confident match exists
 */
function matchOTReadings(declared, orthocalVespers) {
  const candidates = (orthocalVespers || []).map((r, i) => ({
    i,
    passage: r?.passage,
    composite: compositeNumber(r?.display),
    ...splitDisplay(r?.display),
  }));
  const taken = new Set();

  const pick = (predicate) => candidates.find(c => !taken.has(c.i) && predicate(c));

  return (declared || []).map((r) => {
    // Our files carry either `pericope` or a `reference` that repeats the book.
    const book = normalizeBook(r.book);
    const ownRef = normalizeRef(
      r.pericope ?? String(r.reference || '').replace(r.book, ''),
    );

    // 0. Both sides name the same composite reading.
    // Menaion files record the number in `_composite` (january-01), or carry it
    // in the book itself when the composite spans several books (february-02).
    const comp = compositeNumber(r._composite)
      ?? compositeNumber(r.book)
      ?? compositeNumber(r.pericope ?? r.reference);
    let hit = comp ? pick(c => c.composite === comp) : null;

    // 1. Book and pericope both agree — the only unambiguous pairing.
    if (!hit) hit = pick(c => normalizeBook(c.book) === book && normalizeRef(c.pericope) === ownRef);

    // 2. Book agrees and it is the only unclaimed reading from that book. A
    //    pericope can legitimately differ in spelling ("34:4-6, 8" vs
    //    "34.4-6,8") more ways than normalising catches, so a sole candidate
    //    from the right book is still a safe pairing.
    if (!hit && !comp) {
      const chapter = ownRef.match(/^\d+/)?.[0];
      const sameBook = candidates.filter(c =>
        !taken.has(c.i)
        && normalizeBook(c.book) === book
        // ...and opening on the same chapter. Book agreement alone is too
        // weak: on 2026-07-20 all three lessons come from 3 Kings, and the
        // "sole remaining candidate from that book" was the wrong one.
        && (!chapter || normalizeRef(c.pericope).startsWith(chapter)));
      if (sameBook.length === 1) hit = sameBook[0];
    }

    // Deliberately no positional fallback. See the header.
    if (!hit?.passage?.length) return r;
    taken.add(hit.i);
    return { ...r, text: hit.passage.map(p => p.content).join(' ') };
  });
}

module.exports = { matchOTReadings, normalizeBook, normalizeRef, splitDisplay, compositeNumber };
