'use strict';

// Principal-commemoration picker shared by Liturgy, Vespers, and Matins.
//
// The menaion DB's row order matches the OCA web page's commemoration list,
// but OCA's *liturgical* principal is sometimes different — a stichera-rich
// lesser saint sits ahead of a canonical principal who has only a troparion
// (e.g. Apostle Mark Apr 25, Apostle Andrew Nov 30, Spyridon Dec 12). The
// `getMenaionRanked` heuristic in menaion.js correctly prefers stichera-
// content-richness for the unguided case, but that loses on dates where the
// canonical principal lives at a different row.
//
// Orthocal's `saints[]`/`feasts[]`/`summary_title` already encode OCA's
// principal ordering for fixed-calendar saints. We use those as the override
// signal — but conservatively, since orthocal's principal disagrees with our
// menaion pick in two distinct ways:
//
//   (a) Picker accident — we elevate a stichera-rich lesser saint over the
//       OCA principal. Fix: rebind to whoever orthocal lists first.
//   (b) Deliberate OCA-cycle disagreement — Mary of Egypt on Apr 1, where OCA
//       elevates the moveable-cycle Lenten commemoration over orthocal's
//       fixed-calendar pick (Euthymius of Suzdal). Fix: keep our pick.
//
// We distinguish via the conservative guard: if our default's title matches
// ANY orthocal saint hint, we keep it (case b — orthocal acknowledges our
// saint, just doesn't lead with them). We only rebind when our default is
// nowhere in orthocal's pool (case a — picker accident).

const fs   = require('fs');
const path = require('path');

const PICKER_RANK_WORDS = new Set([
  'martyr','martyrs','hieromartyr','hieromartyrs','venerable','ven','holy','father','fathers','mother','mothers',
  'saint','saints','sts','st','our','new','translation','trans','relics','rel','uncovering','unc','synaxis',
  'forefathers','hierarch','hierarchs','apostle','apostles','prophet','prophets','confessor','confessors',
  'patriarch','pope','bishop','archbishop','metropolitan','deacon','deacons','presbyter','priest','priests',
  'reader','nun','nuns','monk','monks','wonderworker','wonderworkers','unmercenaries','unmercenary','healer',
  'brother','brothers','sister','sisters','widow','maiden','virgin','queen','king','empress','emperor',
  'tsar','tsaritsa','prince','princess','abbot','abbots','abbess','righteous','great','equal','greatmartyr',
  'greatmartyrs','protomartyr','passionbearer','forerunner','baptist','enlightener','illuminator',
  'wonderworking','blessed','god','bearing','bearer','bearers','cross','icon','image','founder','companion',
  'companions','disciples','disciple','six','seven','three','two','first','second','third','near',
  'theotokos','his','her',
]);
const PICKER_STOPWORDS = new Set(['the','of','and','to','in','on','at','from','for','with','their','as','this','a','an','also','was','were','is','are','be','by','or','but']);

function tokenizeTitle(title) {
  let t = String(title || '').replace(/\([^)]*\)/g, ' ');
  t = t.replace(/&[a-z]+;/gi, ' ');                       // HTML entities
  t = t.replace(/\b\d+(?:st|nd|rd|th)?\s*c\.?\b/gi, ' '); // "5th c."
  t = t.replace(/\b\d+\b/g, ' ');
  const words = t.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.filter(w => !PICKER_RANK_WORDS.has(w) && !PICKER_STOPWORDS.has(w) && w.length > 1);
}

// Normalize Greek/Slavonic transliteration drift (k↔c, y↔i, ph↔f, oe↔e,
// doubled-consonant collapse). Mirrors A2-saint-aligns-orthocal's normalizer
// so the picker and the audit rule agree on what counts as the same name.
//   Joannicius ↔ Joannicus → joannicus (after y/i collapse + doubled-i fold)
//   Niketas ↔ Nicetas      → nicetas
//   Poemen   ↔ Pemen        → pemen
function normalizeToken(t) {
  return t
    .replace(/ph/g, 'f')
    .replace(/k/g, 'c')
    .replace(/y/g, 'i')
    .replace(/oe/g, 'e')
    .replace(/(.)\1+/g, '$1');
}

// Lev-1: true iff a and b are within edit distance 1.
function levenshtein1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length === l.length) {
    let diffs = 0;
    for (let i = 0; i < s.length; i++) if (s[i] !== l[i]) if (++diffs > 1) return false;
    return true;
  }
  for (let i = 0, j = 0; j < l.length; j++) {
    if (i < s.length && s[i] === l[j]) i++;
    else if (j > i) return false;
  }
  return true;
}

// Returns true if any normalized token in `setA` is "equivalent" (exact,
// prefix-5, or Lev-1) to token `tb`. Used in place of strict Set.has so the
// picker is robust to transliteration drift (Joannicius ↔ Joannicus, etc.)
function fuzzyMatch(setA, tb) {
  const nb = normalizeToken(tb);
  for (const ta of setA) {
    const na = normalizeToken(ta);
    if (na === nb) return true;
    const minLen = Math.min(na.length, nb.length);
    if (minLen >= 5 && na.slice(0, 5) === nb.slice(0, 5)) return true;
    if (minLen >= 5 && levenshtein1(na, nb)) return true;
  }
  return false;
}

// Titles that came in via the moveable cycle (Triodion/Pentecostarion/
// forefeast-afterfeast). Orthocal doesn't represent these — its arrays only
// list fixed-calendar saints. If the menaion picker has already landed on one
// of these, we must NOT rebind to whoever orthocal has listed first.
const MOVEABLE_CYCLE_TITLE = new RegExp(
  '^(?:'
  + 'Afterfeast '
  + '|Forefeast '
  + '|Leavetaking '
  + '|Bright (?:Mon|Tues|Wednes|Thurs|Fri|Satur)day'
  + '|Great and Holy '
  + '|HOLY PASCHA'
  + '|Holy Pentecost\\b'
  + '|Holy Saturday\\b'
  + '|Lazarus'
  + '|The Raising of Lazarus'
  + '|Saturday of (?:Cheese|Meat)fare'
  + '|Sunday of (?:Cheesefare|Meatfare|the |Orthodoxy)'
  + '|\\d+(?:st|nd|rd|th) (?:Saturday|Sunday) of Great Lent'
  + '|Antipascha\\b'
  + '|Memorial Saturday '
  + '|Midfeast of '
  + '|Postfeast of '
  + '|Synaxis of (?:All Saints|the Saints of)'
  + '|Second Day of the Nativity'
  + '|Third Day of the Nativity'
  + '|Commemoration of the Holy Righteous David'
  + ')'
);

// Co-celebration hints from orthocal use "/" or ";" as separators between
// the day's commemorations, with the FIRST segment being the primary by
// OCA typikon precedence. Example: "St Tikhon, Patriarch of Moscow / Holy
// Apostle James, Son of Alphaeus" — Tikhon is the rank-bearer; the slash
// is co-celebration, not equality. Splitting lets us score each segment
// independently so token-count from the secondary doesn't drown out the
// primary's match (which previously caused 10-09 to land on James).
function splitHintSegments(hint) {
  return hint.split(/\s*[;/]\s*/).map(s => s.trim()).filter(s => s.length);
}

// Returns true if `titleTokens` has a sufficient overlap with `hint` (any
// segment thereof) to consider them the same saint. Threshold: ≥1 shared
// proper-name token AND ≥ half of the segment's tokens land. The conservative
// guard and the override-search use the same heuristic so they agree on what
// counts as a hit.
function hintMatches(titleTokens, hint) {
  for (const segment of splitHintSegments(hint)) {
    const hintTokens = tokenizeTitle(segment);
    if (!hintTokens.length) continue;
    const hintSet = new Set(hintTokens);
    let score = 0;
    for (const t of hintSet) if (fuzzyMatch(titleTokens, t)) score++;
    if (score >= 1 && score * 2 >= hintSet.size) return true;
  }
  return false;
}

/**
 * Picks the principal commemoration whose troparion/kontakion is sung at the
 * service by honoring orthocal's saint ordering, with a conservative guard.
 *
 * Algorithm:
 *   1. If fallback title is a moveable-cycle entry (Afterfeast/Forefeast/
 *      Bright-N/Lenten-Nth-Sunday/etc.), keep fallback. Orthocal doesn't
 *      carry these; rebinding would always be wrong.
 *   2. If fallback title matches ANY orthocal saint hint, keep fallback.
 *      Catches deliberate-OCA-disagreement cases (Mary of Egypt Apr 1)
 *      where orthocal's principal is different but it still acknowledges our
 *      saint somewhere in saints[]/feasts[].
 *   3. Otherwise iterate orthocal hints in order; for each, find the best-
 *      matching candidate in `notable`. Return the first sufficient match.
 *   4. Fall back to the caller-supplied fallback if no candidate matches.
 */
function pickPrincipalByOrthocalOrder(notable, orthocalData, fallback) {
  if (!notable?.length) return fallback ?? null;
  if (fallback?.title && MOVEABLE_CYCLE_TITLE.test(fallback.title)) return fallback;

  const hints = [
    ...(Array.isArray(orthocalData?.feasts) ? orthocalData.feasts : []),
    ...(Array.isArray(orthocalData?.saints) ? orthocalData.saints : []),
  ];
  if (!hints.length) return fallback ?? notable[0];

  // Conservative guard: if our default is in orthocal's pool at all, keep it.
  if (fallback?.title) {
    const fbTokens = new Set(tokenizeTitle(fallback.title));
    if (fbTokens.size > 0 && hints.some(h => hintMatches(fbTokens, h))) {
      return fallback;
    }
  }

  // Default not in pool — search for a better candidate, orthocal order first.
  // Iterate segments within each hint so co-celebration entries surface their
  // primary (e.g. "St Tikhon / Holy Apostle James" yields Tikhon first).
  for (const hint of hints) {
    for (const segment of splitHintSegments(hint)) {
      const hintTokens = tokenizeTitle(segment);
      if (!hintTokens.length) continue;
      const hintSet = new Set(hintTokens);
      let best = null, bestScore = 0;
      for (const comm of notable) {
        const titleSet = new Set(tokenizeTitle(comm.title));
        let score = 0;
        for (const t of hintSet) if (fuzzyMatch(titleSet, t)) score++;
        if (score > bestScore) { best = comm; bestScore = score; }
      }
      if (best && bestScore >= 1 && bestScore * 2 >= hintSet.size) return best;
    }
  }
  return fallback ?? notable[0];
}

/**
 * Loads orthocal JSON for a civil date (YYYY-MM-DD) from the vendored cache.
 * Returns null when out-of-window or unreadable — callers should treat as
 * "no override signal" and use the menaion default.
 */
function loadOrthocalForDate(date) {
  if (!date) return null;
  const p = path.resolve(__dirname, '..', '..', 'data', 'orthocal', `${date}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

module.exports = {
  pickPrincipalByOrthocalOrder,
  loadOrthocalForDate,
  tokenizeTitle,
  MOVEABLE_CYCLE_TITLE,
};
