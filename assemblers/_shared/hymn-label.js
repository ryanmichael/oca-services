'use strict';

/**
 * Choosing between a hymn row's own label and the slot's.
 *
 * Shared by lord-i-call.js and aposticha.js so the two cannot drift apart —
 * they had two different, partial versions of this rule before 2026-08-29.
 *
 * The corpus carries labels in two forms:
 *   - "(for X)" / "from X"  — e.g. "(for the Image)", "(for the Dormition, by
 *     the Emperor Leo the Wise)"
 *   - a bare descriptor      — "the holy forerunner", "the venerable one",
 *     "the holy martyrs"
 *
 * The bare form is the larger half (1,451 of 2,390 labelled lordICall rows) and
 * was invisible to both callers until 2026-08-29, which is why 2026-08-30's
 * three Forerunner stichera printed under "Saint Alexander, Patriarch of
 * Constantinople".
 *
 * A bare descriptor is nearly always LESS informative than the commemoration
 * title the slot supplies, so it must not simply win. It wins only when it
 * describes someone else — i.e. when it shares no content word with the slot's
 * title. "the holy prophet" against a slot titled "Prophet Hosea" is the same
 * subject and the title is better; "the venerable martyr" against that slot is
 * a different saint and the descriptor is the only true thing available.
 */

// Words that carry no distinguishing subject. "one" matters: "the venerable
// one" would otherwise reduce to {one} and beat the saint's actual name.
const LABEL_STOPWORDS = new Set([
  'the', 'holy', 'of', 'and', 'saint', 'saints', 'st', 'sts', 'our', 'most',
  'all', 'venerable', 'blessed', 'god', 'one', 'ones', 'his', 'her', 'those',
  'with', 'them', 'who', 'for', 'from', 'by',
  // Genre and book words. These name the KIND of hymn, never its subject, and
  // two labels sharing one is not evidence they share a commemoration. Without
  // them 2026-03-25 collapsed "24 stichera by Simeon the Translator" to the
  // slot's bare "Stichera" — and only for some of the rows, because they sit in
  // different slots, so two identical hymns printed under different headings.
  'stichera', 'sticheron', 'troparion', 'troparia', 'kontakion', 'theotokion',
  'idiomelon', 'doxastikon', 'doxasticon', 'glory', 'hymn', 'hymns', 'verse',
  'verses', 'tone', 'menaion', 'triodion', 'pentecostarion', 'octoechos',
  'aposticha', 'canon', 'ode',
]);

/** Distinguishing lowercase content words of a label. */
function contentWords(label) {
  return new Set(
    String(label || '')
      .toLowerCase()
      .replace(/[^a-z ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !LABEL_STOPWORDS.has(w))
  );
}

/**
 * The subject a label names, or null when it names none. Used to decide whether
 * a slot holds stichera of MORE THAN ONE commemoration.
 *
 * "Glory" returns null by the leading-"the" test — it is a slot marker, not a
 * subject, and admitting it would make every slot holding a Glory row look
 * mixed.
 */
function labelSubject(label) {
  if (!label) return null;
  const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, '').trim() || null;
  const m = /(?:^|\()\s*(?:for|from)\s+(.+?)\s*(?:,|\)|$)/i.exec(label);
  if (m) return norm(m[1]);
  // Bare descriptor: drop any trailing melody incipit and attribution first,
  // exactly as the "(for X)" branch does.
  const bare = String(label).replace(/\([^)]*\)/g, ' ').split(',')[0];
  return /^\s*the\s+\S/i.test(bare) ? norm(bare) : null;
}

/**
 * Pick the label to print for one hymn: its own, or the slot's.
 *
 * Returns the SLOT's label when the row belongs to the slot's own
 * commemoration — detected by a shared content word, allowing containment so
 * "feast" matches "Afterfeast" — and the row's own label otherwise. A row whose
 * label has no content words at all can never outrank the slot's title.
 */
function preferRowLabel(rowLabel, slotLabel) {
  if (!rowLabel) return slotLabel;
  if (!slotLabel) return rowLabel;
  const rw = contentWords(rowLabel);
  if (rw.size === 0) return slotLabel;
  const sw = contentWords(slotLabel);
  for (const w of rw) {
    for (const x of sw) {
      if (w === x) return slotLabel;
      if (w.length >= 4 && x.includes(w)) return slotLabel;
      if (x.length >= 4 && w.includes(x)) return slotLabel;
    }
  }
  return rowLabel;
}

module.exports = { labelSubject, preferRowLabel, contentWords };
