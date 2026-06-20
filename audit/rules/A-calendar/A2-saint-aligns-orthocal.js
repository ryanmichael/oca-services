'use strict';

// Cross-reference our principal-saint picker against orthocal.com's saints
// list for the same date. Catches DB-row drift (e.g. a commemoration duplicated
// onto the wrong day) that no structural rule would notice.
//
// How: extract the distinctive personal name tokens from each candidate (our
// pick + orthocal entries), and assert at least one of our tokens appears
// in at least one orthocal entry's tokens. If no overlap, we're commemorating
// a saint orthocal doesn't list for that day — almost always a data bug.
//
// Skips when:
//   - No orthocal cache file for the date (window edges).
//   - getMenaionRanked returns null (no menaion principal — e.g. movable-only
//     days where the commemoration comes from Triodion/Pentecostarion).
//   - The date is overridden by a great feast or special day (we trust the
//     override to be correct; orthocal cross-check would false-positive).
//   - The principal saint title appears on the allowlist of known legit
//     disagreements between our calendar and orthocal.

const fs   = require('fs');
const path = require('path');

const { getMenaionRanked } = require('../../../server-lib/sources/menaion.js');
const { pickPrincipalByOrthocalOrder } = require('../../../server-lib/sources/menaion-principal.js');

// Titles starting with these prefixes are feast/season contexts, not saints —
// orthocal handles them differently and would always false-positive.
const FEAST_CONTEXT_PREFIXES = [
  'forefeast', 'afterfeast', 'leavetaking', 'apodosis', 'postfeast',
  'synaxis', 'eve of', 'memorial saturday', 'soul saturday',
  'saturday of', 'sunday of', 'week of',
  'holy pascha', 'antipascha', 'bright',
  'great and holy', 'midfeast',
  'commemoration of',   // moveable cycle (Holy Fathers councils, etc.)
  'icon of',            // Marian icon feasts
  'appearance of',      // Marian icon appearances
  'finding of',         // relic findings (St Maximus the Greek, etc.)
  '"',                  // Marian icon titles in quotes (after HTML-entity strip)
];

// Patterns matching numbered Lenten Saturdays/Sundays of Great Lent.
const FEAST_CONTEXT_PATTERNS = [
  /^\d+(st|nd|rd|th)\s+(saturday|sunday)\s+of/i,
];

// Words that don't help identify a saint — strip before token comparison.
const STOP_TOKENS = new Set([
  'saint', 'saints', 'st', 'sts', 'the', 'of', 'and', 'a', 'an',
  'venerable', 'martyr', 'martyrs', 'holy', 'father', 'fathers',
  'mother', 'mothers', 'hieromartyr', 'newmartyr', 'new',
  'great', 'apostle', 'apostles', 'prophet', 'evangelist',
  'archbishop', 'bishop', 'patriarch', 'metropolitan',
  'monk', 'nun', 'wonderworker', 'confessor', 'virgin',
  'our', 'his', 'her', 'their', 'all', 'with', 'who', 'whom',
  'king', 'queen', 'prince', 'princess', 'emperor', 'empress',
  'presbyter', 'priest', 'deacon', 'archdeacon', 'reader',
  'in', 'on', 'at', 'by', 'to', 'from', 'for', 'as',
]);

// Legit disagreements between our calendar and orthocal — known intentional.
// Keyed by `${MM}-${DD}` → array of {ourTitle, reason} pairs that bypass.
// Every entry is a saint OCA commemorates that orthocal does not surface as
// the principal for that date. Verify against the OCA Service Book before
// adding; this list is reviewed at calendar-year rollover.
const ALLOWLIST = {
  // 2026-06-20 PM2: the 5 "SUSPECTED PICKER BUG" entries (04-25 / 07-04 /
  // 11-04 / 11-30 / 12-12) are now resolved by the orthocal-aware principal
  // picker shipped in server-lib/sources/menaion-principal.js — Vespers and
  // Matins both consult it via for-date.js + matins-spec.js, with a
  // conservative guard that preserves deliberate OCA disagreements
  // (Mary of Egypt Apr 1). Remaining entries:
  //   - 10-27 / 10-28: AMBIGUOUS — picker leaves these in place because our
  //     default already appears somewhere in orthocal's saints[] (conservative
  //     guard keeps it). Verify against OCA Service Book on year rollover.
  //   - 11-15: GENUINE OCA-vs-orthocal disagreement on Sunday name vs saint.
  '10-27': [{ ourTitle: 'Righteous Mother Olga of Kwethluk–Tanqilria Arrsamquq–Wonderworker, Matushka of All Alaska',
              reason: 'POSSIBLY DELIBERATE: OCA-glorified saint (2023). Conservative picker keeps her because she appears in orthocal saints[] alongside Nestor.' }],
  '10-28': [{ ourTitle: 'Venerable Stephen the Hymnographer of Saint Savva Monastery',
              reason: 'AMBIGUOUS: OCA Oct 28 has multiple traditions. Picker leaves intact when default appears in orthocal pool.' }],
  '11-15': [{ ourTitle: 'Holy Martyrs and Confessors Gurias, Samonas, and Habibus, of Edessa',
              reason: 'GENUINE OCA-vs-orthocal disagreement. Orthocal summary_title is "24th Sunday after Pentecost" (no saint signal); saints[] foregrounds Paisios Velichkovsky + Nativity Fast start. OCA Service Book foregrounds Gurias-Samonas-Habibus.' }],
};

// Normalize transliteration drift for Greek/Slavonic saint names:
//   k ↔ c (Niketas/Nicetas, Kyriakos/Cyriacos)
//   y ↔ i (Kyriakos/Cyriacos, Eutyches/Eutiches)
//   ph ↔ f (rare but legal)
//   oe ↔ e (Poemen/Pemen)
//   doubled consonant → single (Habakkuk/Habakuk)
function normalizeToken(t) {
  return t
    .replace(/ph/g, 'f')
    .replace(/k/g, 'c')
    .replace(/y/g, 'i')
    .replace(/oe/g, 'e')
    .replace(/(.)\1+/g, '$1');         // collapse doubles last
}

// Returns true iff the strings are within Levenshtein distance 1
// (single insert, delete, or substitution). Cheap iterative check —
// doesn't build a full DP table since we only care about distance ≤ 1.
function levenshtein1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length === l.length) {
    let diffs = 0;
    for (let i = 0; i < s.length; i++) if (s[i] !== l[i]) if (++diffs > 1) return false;
    return true;
  }
  // l is one char longer — find the insertion point
  for (let i = 0, j = 0; j < l.length; j++) {
    if (i < s.length && s[i] === l[j]) i++;
    else if (j > i) return false;       // second mismatch
  }
  return true;
}

function tokenize(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')          // strip HTML entities (&ldquo; &mdash;)
    .replace(/\(.*?\)/g, ' ')           // strip parentheticals like (5th c.)
    .replace(/[^a-z\s]/g, ' ')          // strip punctuation + digits
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_TOKENS.has(t))
    .map(normalizeToken);
}

function readOrthocal(dateForEntry) {
  const p = path.resolve(__dirname, '..', '..', '..', 'data', 'orthocal', `${dateForEntry}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

module.exports = {
  id:             'A2-saint-aligns-orthocal',
  family:         'calendar',
  severity:       'high',
  description:    'Principal saint resolved from our menaion DB shares a distinctive name token with orthocal.com\'s saints list for the same date.',
  needsAssembled: false,
  // Run once per date — vespers is the canonical entry point.
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const dateForEntry = ctx.dateForEntry || ctx.date;
    const orthocal = readOrthocal(dateForEntry);
    if (!orthocal) return [];                           // skip — out of window
    const orthocalSaints = Array.isArray(orthocal.saints) ? orthocal.saints : [];
    if (orthocalSaints.length === 0) return [];         // skip — no saints listed

    // If a great feast overrides this date, trust the override.
    if (ctx.calendarEntry?.liturgicalContext?.greatFeast) return [];

    const [, m, d] = dateForEntry.split('-').map(Number);
    const ranked = getMenaionRanked(m, d);
    if (!ranked || !ranked.principal) return [];        // skip — no menaion principal

    // Apply the same orthocal-aware picker that Vespers/Matins/Liturgy use
    // at render time, so the audit checks the saint we actually surface.
    const principal = ranked.notable?.length
      ? pickPrincipalByOrthocalOrder(ranked.notable, orthocal, ranked.principal)
      : ranked.principal;
    const allowKey = `${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if ((ALLOWLIST[allowKey] || []).some(a => a.ourTitle === principal.title)) return [];

    // Skip feast-context principals (Forefeast/Afterfeast/Synaxis/etc.) —
    // orthocal lists the day's saint, not the season context.
    const titleLc = principal.title
      .toLowerCase()
      .replace(/&[a-z]+;/g, '"');       // collapse HTML entities to "

    if (FEAST_CONTEXT_PREFIXES.some(p => titleLc.startsWith(p))) return [];
    if (FEAST_CONTEXT_PATTERNS.some(re => re.test(principal.title))) return [];

    const ourTokens = tokenize(principal.title);
    if (ourTokens.length === 0) return [];              // can't classify — skip

    // Orthocal sometimes lists the day's principal saint in `summary_title`
    // or `feasts` (e.g. Anthony the Great, Euthymius the Great) while
    // `saints[]` carries only the lesser commemorations. Treat all three
    // fields as the canonical orthocal saint pool.
    const orthocalPool = [
      ...orthocalSaints,
      orthocal.summary_title,
      ...(Array.isArray(orthocal.feasts) ? orthocal.feasts : []),
    ].filter(Boolean);
    const orthocalTokens = orthocalPool.flatMap(tokenize);

    // Match if any of our tokens equals — or shares a ≥5-char prefix with —
    // or is within Levenshtein-1 of — any orthocal token. Each rung handles
    // a separate class of drift (exact, prefix-tolerance, single-char sub
    // for Slavonic↔Greek vowel swaps like Pimen/Poemen).
    const hit = ourTokens.some(ot => orthocalTokens.some(rt => {
      if (ot === rt) return true;
      const minLen = Math.min(ot.length, rt.length);
      if (minLen >= 5 && ot.slice(0, 5) === rt.slice(0, 5)) return true;
      if (minLen >= 5 && levenshtein1(ot, rt)) return true;
      return false;
    }));
    if (hit) return [];                                  // ✓ match

    return [{
      message:
        `Principal saint "${principal.title}" not found in orthocal.com saints list for ${dateForEntry}. ` +
        `Orthocal lists: ${orthocalSaints.map(s => `"${s}"`).join(', ')}.`,
      hint:
        `Check commemorations table for (month=${m}, day=${d}). Possible causes: ` +
        `(a) commemoration row duplicated onto wrong date, ` +
        `(b) picker preferring a saint with stichera over the OCA-canonical commemoration, ` +
        `(c) intentional disagreement with orthocal — add to ALLOWLIST in this rule if so.`,
    }];
  },
};
