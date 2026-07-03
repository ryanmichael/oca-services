'use strict';

// Rescrape harness — shared text normalizer.
//
// Applied IDENTICALLY to both the fresh DOCX parse and the DB row before the
// differ compares them, so that formatting-only differences (curly quotes,
// chant tone markers, syllable-split whitespace, Word-XML residue) don't
// masquerade as content drift.
//
// Order-sensitive. See docs/rescrape-harness-design.md § Normalization.

// XML/Word residue that occasionally survived earlier scrapes into DB text.
const XML_RESIDUE_RE = /<\/?w:[a-zA-Z]+(?:\s[^>]*)?\/?>/g;

// Leading "Tone N " chant marker — a MARKUP element, not hymn prose. Anchored
// to the start so the literal phrase "in Tone 6" inside a hymn survives.
const LEADING_TONE_RE = /^\s*Tone\s+[1-8]\s+/i;

function stripXmlResidue(s) {
  return s.replace(XML_RESIDUE_RE, ' ');
}

function stripLeadingTone(s) {
  return s.replace(LEADING_TONE_RE, '');
}

// Curly quotes → straight, en/em dash → hyphen-minus, Unicode ellipsis → "...".
function normalizePunctuation(s) {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ');   // non-breaking space
}

function collapseWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// Insert a missing space after sentence/clause punctuation glued to the next
// word ("denial.Therefore" → "denial. Therefore", "Jordan,in" → "Jordan, in").
// The 2024 scrape dropped these on line-joins. The trigger set is ONLY the
// sentence/clause enders [.,;:!?] — deliberately NOT quotes/apostrophes/parens,
// because those produce ruinous false positives (possessive "heart's" →
// "heart' s", opening quote "\"You" → "\" You"). The lookahead requires a LETTER
// (never a digit) so scripture refs ("1:3") and decimals ("3.14") are untouched.
// This is safe to apply as a data migration, not just as a comparison normalizer.
const GLUED_PUNCT_RE = /([.,;:!?])(?=[A-Za-z])/g;
function insertPunctuationSpaces(s) {
  return s.replace(GLUED_PUNCT_RE, '$1 ');
}

// True when the raw text contains glued punctuation (used by the differ to
// report the cosmetic class independently of the content match). Uses a
// non-global copy so the shared GLUED_PUNCT_RE's lastIndex isn't disturbed.
const GLUED_PUNCT_TEST = new RegExp(GLUED_PUNCT_RE.source);
function hasGluedPunctuation(s) {
  return s == null ? false : GLUED_PUNCT_TEST.test(String(s));
}

// Chant break markers ("//" mid-line, standalone "V." verse tabs already
// handled upstream). "//" marks the final-phrase break in OCA stichera; it is
// notation, not text.
function stripChantMarks(s) {
  return s.replace(/\/\//g, ' ');
}

let _yyTransform = null;
function pronounNormalize(s) {
  // Lazy-require the heavy transformer only when the flag is on.
  if (!_yyTransform) _yyTransform = require('../../scripts/yy-to-tt').transform;
  return _yyTransform(s);
}

// opts:
//   pronoun  — run yy→tt on both sides so pre-2024 DB rows don't false-positive
//              against post-update DOCX text (default false; surfaced explicitly
//              by the differ's --show-pronoun-diffs flag).
//   caseFold — lowercase for the comparison key only (first-letter case drifts
//              across chant phrase breaks). Default true.
function normalizeText(input, opts = {}) {
  const { pronoun = false, caseFold = true } = opts;
  if (input == null) return '';
  let s = String(input);
  s = stripXmlResidue(s);
  s = stripLeadingTone(s);
  s = normalizePunctuation(s);
  s = stripChantMarks(s);
  s = insertPunctuationSpaces(s);
  s = collapseWhitespace(s);
  if (pronoun) s = collapseWhitespace(pronounNormalize(s));
  return caseFold ? s.toLowerCase() : s;
}

module.exports = {
  normalizeText,
  stripXmlResidue,
  stripLeadingTone,
  normalizePunctuation,
  collapseWhitespace,
  stripChantMarks,
  insertPunctuationSpaces,
  hasGluedPunctuation,
};
