'use strict';

// The honorific that precedes a hierarch's name is NOT fixed — it tracks his
// rank, and using the wrong one is audible.
//
//   Metropolitan  His Beatitude, the Most Blessed   / "most blessed"
//   Archbishop    His Eminence, the Most Reverend   / "most reverend"
//   Bishop        His Grace, the Right Reverend     / "right reverend"
//
// Until 2026-11-06 hierarch-commemoration-oca.json hard-coded the ARCHBISHOP
// form, so every parish whose ruling hierarch is a bishop was commemorating
// him as "His Eminence, the Most Reverend". Tyler hit it the week the Diocese
// of the South received Bp. Gerasim: the rector's own announcement reads "His
// Grace, Bishop Gerasim", and we were printing "His Eminence". Our
// sts-sluzhebnik overlay already carried the distinction in prose — "His
// Eminence, our Archbishop [N.]; (or His Grace, our Bishop [N.])" — so the
// rule was in the corpus, just not in the derivation.
//
// The rank is read from the stored title rather than held in a separate
// column. One source of truth: a parish that edits "Bishop of Dallas and the
// South" to "Archbishop of ..." gets the honorific that matches, with no
// second field to leave stale. The admin UI shows the result live.

/** Archbishop must be tested BEFORE bishop — it contains it as a substring. */
const RANKS = [
  { test: /\bmetropolitan\b/i, full: 'His Beatitude, the Most Blessed', short: 'most blessed'  },
  { test: /\barchbishop\b/i,   full: 'His Eminence, the Most Reverend', short: 'most reverend' },
  { test: /\bbishop\b/i,       full: 'His Grace, the Right Reverend',   short: 'right reverend' },
];

// What to use when the title names no rank we recognise. This is the
// pre-2026-11-06 behaviour, kept deliberately: an unrecognised title is a
// parish we know nothing about, and silently downgrading its hierarch would
// be a worse failure than leaving the previous wording in place.
const FALLBACK = { full: 'His Eminence, the Most Reverend', short: 'most reverend' };

/**
 * Honorifics for a hierarch's stored title.
 * @param {string} title e.g. "Gerasim, Bishop of Dallas and the South"
 * @returns {{full: string, short: string, rank: string|null}}
 */
function hierarchStyle(title) {
  const t = String(title || '');
  for (const r of RANKS) {
    if (r.test.test(t)) {
      return { full: r.full, short: r.short, rank: r.test.source.replace(/\\b/g, '') };
    }
  }
  return { ...FALLBACK, rank: null };
}

module.exports = { hierarchStyle, RANKS, FALLBACK };
