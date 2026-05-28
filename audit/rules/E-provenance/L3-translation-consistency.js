'use strict';

// The project default is OCA TT (thee/thy). Variable hymn/troparion/kontakion
// blocks that contain You/Your/yours (as second-person address) leak YY into
// an otherwise TT service — see project_pronoun_consistency feedback memo.
//
// Exceptions: Christ speaking plural-"you" to the disciples (e.g. "I am with
// you" in the Ascension Kontakion) is intentional and OCA-canonical.

const TT_MARKER     = /\b(thou|thee|thy|thine|hast|hadst|didst|dost|wast|art)\b/i;
const YY_PRONOUN    = /\b(you|your)\b/i;
const YY_EXCEPTIONS = [
  /I am with you/i,
  /there is no one against you/i,
];

// Sections that only ever contain feast variant content (no Menaion-injected
// saint troparia mixed in). Menaion content is YY across the board — a
// separate, much larger tracked gap — so flagging Troparia/Kontakia broadly
// produces ~3,000 findings/year. Scope to feast-only sections here.
const FLAGGABLE_SECTIONS = new Set([
  'First Antiphon', 'Second Antiphon', 'Third Antiphon',
  'Entrance Hymn',
  'Hymn to the Theotokos',
  'Communion Hymn',
]);

function isLikelyTTBlock(text) {
  return TT_MARKER.test(text);
}

function hasUnexpectedYY(text) {
  if (!YY_PRONOUN.test(text)) return false;
  let stripped = text;
  for (const re of YY_EXCEPTIONS) stripped = stripped.replace(re, '');
  return YY_PRONOUN.test(stripped);
}

module.exports = {
  id:             'L3-translation-consistency',
  family:         'provenance',
  severity:       'high',
  description:    'Liturgy variable-text blocks should be TT (thee/thy); flag YY pronouns in a service that is otherwise TT.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b =>
      FLAGGABLE_SECTIONS.has(b.section) && b.text && b.type !== 'rubric' && b.type !== 'verse'
    );
    if (!blocks.length) return [];

    // Use the surrounding service to decide if the service is "in TT mode".
    // If most flaggable blocks contain TT markers, then a YY block is drift.
    const ttCount = blocks.filter(b => isLikelyTTBlock(b.text)).length;
    if (ttCount < 3) return []; // not enough signal; service may be YY mode

    const issues = [];
    for (const b of blocks) {
      if (!hasUnexpectedYY(b.text)) continue;
      if (isLikelyTTBlock(b.text)) continue; // block itself has both markers — mixed inside, but probably the dialogue case
      issues.push({
        message: `${b.section}${b.label ? ` (${b.label})` : ''} contains YY pronoun(s) in an otherwise-TT service: "${b.text.slice(0, 80).replace(/\s+/g, ' ')}…"`,
        hint:    'Convert You/Your/yours → Thou/Thee/Thy/Thine; see GREAT_FEAST_VARIANTS in server.js for examples.',
      });
    }
    return issues;
  },
};
