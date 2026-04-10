/**
 * OCA Psalter & Source Preference — Canonical source for psalm text and
 * translation preference logic across all services.
 *
 * Psalm API:
 *   const { getPsalmVerse, getPsalmBody } = require('./oca-psalter');
 *   const verse = getPsalmVerse(118, 0);  // first verse of Psalm 118
 *
 * Source preference:
 *   const { SOURCE_PRIORITY, preferredSource } = require('./oca-psalter');
 *   const best = preferredSource('oca-menaion', 'stSergius'); // → 'oca-menaion'
 */

/**
 * Source priority ranking (lower number = higher priority).
 * When multiple translations exist for the same hymn, prefer the
 * highest-priority source.
 */
const SOURCE_PRIORITY = {
  'oca-menaion':        1,   // OCA Menaion — primary
  'oca-feast':          1,   // OCA Great Feast — same tier
  'stSergius':          2,   // St. Sergius of Radonezh Cathedral
  'stSergius-general':  3,   // St. Sergius general menaion (fallback)
};

/**
 * Return the preferred source name from two candidates.
 * Unknown sources rank below all known ones.
 */
function preferredSource(a, b) {
  const pa = SOURCE_PRIORITY[a] ?? 99;
  const pb = SOURCE_PRIORITY[b] ?? 99;
  return pa <= pb ? a : b;
}

/**
 * Given an array of items each having a `source` (or `dbSource`) field,
 * deduplicate by a key function, keeping the highest-priority source.
 * @param {Array} items
 * @param {Function} keyFn - returns a grouping key for each item
 * @param {string} [sourceField='dbSource'] - name of the source property
 * @returns {Array} deduplicated items, highest-priority source wins
 */
function deduplicateBySource(items, keyFn, sourceField = 'dbSource') {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
    } else {
      const existingSrc = existing[sourceField] || '';
      const newSrc = item[sourceField] || '';
      if (preferredSource(newSrc, existingSrc) === newSrc) {
        map.set(key, item);
      }
    }
  }
  return [...map.values()];
}

let _psalter = null;

function getPsalter() {
  if (!_psalter) _psalter = require('./fixed-texts/psalter.json');
  return _psalter;
}

/**
 * Returns psalm verses with superscription (title) lines removed.
 */
function psalmBody(psalm) {
  if (!psalm.title) return psalm.verses;
  let skip = 0;
  let accumulated = '';
  for (let i = 0; i < psalm.verses.length; i++) {
    accumulated += (i > 0 ? ' ' : '') + psalm.verses[i];
    skip++;
    if (accumulated.length >= psalm.title.length) break;
  }
  return psalm.verses.slice(skip);
}

/**
 * Capitalize divine pronouns for liturgical contexts.
 * Psalm 118 (and most psalms) address God directly with thou/thy/thee/thine.
 */
function capitalizeDivinePronouns(text) {
  return text
    .replace(/\bthy\b/g, 'Thy')
    .replace(/\bthee\b/g, 'Thee')
    .replace(/\bthou\b/g, 'Thou')
    .replace(/\bthine\b/g, 'Thine');
}

/**
 * Get a single psalm verse from the OCA Psalter.
 * @param {number} psalmNum - Psalm number (1-150)
 * @param {number} verseIdx - 0-based verse index (into body, after title removal)
 * @param {Object} [opts]
 * @param {boolean} [opts.capitalizePronouns=true] - Capitalize Thy/Thee/Thou/Thine
 * @param {boolean} [opts.stripAlleluia=true] - Strip leading "Alleluia. " prefix
 * @returns {string|null} The verse text, or null if not found
 */
function getPsalmVerse(psalmNum, verseIdx, opts = {}) {
  const { capitalizePronouns = true, stripAlleluia = true } = opts;
  const psalter = getPsalter();
  const psalm = psalter[String(psalmNum)];
  if (!psalm) return null;
  const body = psalmBody(psalm);
  if (verseIdx < 0 || verseIdx >= body.length) return null;
  let text = body[verseIdx];
  if (stripAlleluia) text = text.replace(/^Alleluia\.\s*/, '');
  if (capitalizePronouns) text = capitalizeDivinePronouns(text);
  return text;
}

/**
 * Get all body verses of a psalm (title removed).
 * @param {number} psalmNum
 * @param {Object} [opts]
 * @param {boolean} [opts.capitalizePronouns=true]
 * @returns {string[]}
 */
function getPsalmBody(psalmNum, opts = {}) {
  const { capitalizePronouns = true } = opts;
  const psalter = getPsalter();
  const psalm = psalter[String(psalmNum)];
  if (!psalm) return [];
  let body = psalmBody(psalm);
  if (capitalizePronouns) body = body.map(capitalizeDivinePronouns);
  return body;
}

/**
 * Get a range of psalm verses joined as a single string.
 * @param {number} psalmNum
 * @param {number} [from=0] - Start verse index (inclusive)
 * @param {number} [to] - End verse index (exclusive, defaults to all)
 * @param {Object} [opts]
 * @returns {string}
 */
function getPsalmText(psalmNum, from = 0, to, opts = {}) {
  const body = getPsalmBody(psalmNum, opts);
  return body.slice(from, to).join('\n');
}

/**
 * Resolve a psalm verse for a service, preferring the OCA Psalter.
 * Falls back to the provided inline text if the psalter doesn't have the verse.
 *
 * @param {number} psalmNum - Psalm number
 * @param {number} verseIdx - 0-based verse index
 * @param {string} inlineText - Fallback text from the fixed-text JSON
 * @param {Object} [opts]
 * @returns {{ text: string, provenance: string }}
 */
function resolveVerse(psalmNum, verseIdx, inlineText, opts = {}) {
  const ocaVerse = getPsalmVerse(psalmNum, verseIdx, opts);
  if (ocaVerse) {
    return { text: ocaVerse, provenance: 'OCA Psalter' };
  }
  return { text: inlineText, provenance: 'inline' };
}

module.exports = {
  getPsalter,
  psalmBody,
  getPsalmVerse,
  getPsalmBody,
  getPsalmText,
  resolveVerse,
  capitalizeDivinePronouns,
  SOURCE_PRIORITY,
  preferredSource,
  deduplicateBySource,
};
