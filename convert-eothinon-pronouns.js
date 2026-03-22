#!/usr/bin/env node
/**
 * convert-eothinon-pronouns.js
 *
 * Converts eothinon.json texts from GOA (you/your) to OCA (thee/thy) style.
 * Writes the result to eothinon-oca.json for review before replacing.
 *
 * Rules for liturgical English pronoun conversion:
 *   Subject "you" + verb  → "thou" + archaic verb form
 *   Object "you"          → "thee"
 *   "your"                → "thy"
 *   "yours"               → "thine"
 *   "yourself"            → "thyself"
 *
 * Usage: node convert-eothinon-pronouns.js [--apply]
 *   Without --apply: writes eothinon-oca.json for review
 *   With --apply: overwrites variable-sources/eothinon.json in place
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, 'variable-sources', 'eothinon.json');
const OUT  = path.join(__dirname, 'eothinon-oca.json');
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// ── Archaic verb forms ───────────────────────────────────────────────────────
// "you VERB" → "thou VERBest/VERBst" or irregular
const IRREGULAR_VERBS = {
  'are':       'art',
  'were':      'wast',
  'have':      'hast',
  'had':       'hadst',
  'do':        'dost',
  'did':       'didst',
  'will':      'wilt',
  'shall':     'shalt',
  'would':     'wouldst',
  'should':    'shouldst',
  'could':     'couldst',
  'can':       'canst',
  'may':       'mayest',
  'might':     'mightest',
};

// Past tense verbs that get -est (irregular past forms)
const PAST_EST = {
  'came':       'camest',
  'made':       'madest',
  'gave':       'gavest',
  'rose':       'rosest',
  'said':       'saidest',
  'told':       'toldest',
  'entered':    'enteredst',
  'showed':     'showedst',
  'filled':     'filledst',
  'shared':     'sharedst',
  'ascended':   'ascendedst',
  'calmed':     'calmedst',
  'opened':     'openedst',
  'revealed':   'revealedst',
  'set':        'settest',
  'partook':    'partookest',
  'consented':  'consentedst',
};

function archaicVerb(verb) {
  const lower = verb.toLowerCase();

  // Check irregulars
  if (IRREGULAR_VERBS[lower]) {
    return matchCase(verb, IRREGULAR_VERBS[lower]);
  }

  // Check past tense specials
  if (PAST_EST[lower]) {
    return matchCase(verb, PAST_EST[lower]);
  }

  // Regular: add -est or -st
  // Ends in -e: add -st (e.g., "love" → "lovest")
  if (lower.endsWith('e')) {
    return verb + 'st';
  }
  // Ends in -s, -sh, -ch, -x, -z: add -est
  if (/(?:s|sh|ch|x|z)$/i.test(lower)) {
    return verb + 'est';
  }
  // Default: add -est
  return verb + 'est';
}

function matchCase(original, replacement) {
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// ── Main conversion ──────────────────────────────────────────────────────────

function convertText(text) {
  let result = text;

  // 1. "yourself" → "thyself"
  result = result.replace(/\bYourself\b/g, 'Thyself');
  result = result.replace(/\byourself\b/g, 'thyself');

  // 2. "your" → "thy"
  result = result.replace(/\bYour\b/g, 'Thy');
  result = result.replace(/\byour\b/g, 'thy');

  // 3. "yours" → "thine"
  result = result.replace(/\bYours\b/g, 'Thine');
  result = result.replace(/\byours\b/g, 'thine');

  // 3.4. Inverted "are/were you" → "art/wast thou" (question/relative word order)
  result = result.replace(/\b([Aa])re\s+([Yy])ou\b/g, (m, a, y) => {
    return matchCase(a + 're', 'art') + ' ' + matchCase(y + 'ou', 'thou');
  });
  result = result.replace(/\b([Ww])ere\s+([Yy])ou\b/g, (m, w, y) => {
    return matchCase(w + 'ere', 'wast') + ' ' + matchCase(y + 'ou', 'thou');
  });
  result = result.replace(/\b([Hh])ave\s+([Yy])ou\b/g, (m, h, y) => {
    return matchCase(h + 'ave', 'hast') + ' ' + matchCase(y + 'ou', 'thou');
  });

  // 3.5. Auxiliary + "you" + verb → archaic auxiliary + "thou" + bare verb
  // e.g., "did you leave" → "didst thou leave" (NOT "didst thou leavest")
  // Also handles: "Nor did you leave" patterns where aux and you aren't adjacent
  result = result.replace(/\b(did|do|does|will|shall|would|could|should|may|might|can)\s+([Yy])ou\s+(\w+)/gi,
    (match, aux, y, verb) => {
      const arcAux = archaicVerb(aux);
      const thou = y === 'Y' ? 'Thou' : 'thou';
      return arcAux + ' ' + thou + ' ' + verb; // bare verb, no -est
    }
  );

  // 4. Subject "you" + verb → "thou" + archaic verb
  // Match "you" followed by a word, and determine if it's a verb
  result = result.replace(/\b([Yy])ou\s+(\w+)/g, (match, y, nextWord) => {
    const lower = nextWord.toLowerCase();

    // Non-verbs: prepositions, conjunctions, pronouns, nouns, adjectives, adverbs
    const nonVerbs = new Set([
      // articles, conjunctions, prepositions
      'o', 'the', 'a', 'an', 'and', 'or', 'but', 'nor', 'so', 'yet',
      'in', 'on', 'at', 'to', 'for', 'of', 'by', 'with', 'from', 'as',
      'into', 'unto', 'upon', 'about', 'after', 'before', 'between',
      'through', 'against', 'among', 'toward', 'towards', 'behind', 'near',
      'not', 'also', 'even', 'then', 'too', 'still', 'only', 'just',
      // pronouns
      'who', 'whom', 'that', 'which', 'this', 'these', 'those',
      // nouns commonly following "you" in vocative/appositional contexts
      'christ', 'lord', 'virgin', 'maiden', 'savior', 'master', 'god',
    ]);

    if (nonVerbs.has(lower)) {
      return matchCase(y + 'ou', 'thee') + ' ' + nextWord;
    }

    // Participles (-ing, -ed as adjective) → object "thee" + participle unchanged
    // "you, doing X" or "you, risen from..."
    // But "you entered" = past tense verb → "thou enteredst"
    // Heuristic: -ing words are gerunds/participles → treat as non-verb
    if (lower.endsWith('ing')) {
      return matchCase(y + 'ou', 'thee') + ' ' + nextWord;
    }

    // Past participles used as adjectives (after comma typically)
    // But simple past tense → verb. Check if preceded by comma.
    // We can't look back easily, so handle known participles:
    const pastParticiples = new Set(['done', 'been', 'born', 'given', 'known',
      'risen', 'taken', 'chosen', 'written', 'spoken', 'broken', 'fallen',
      'hidden', 'driven', 'forgotten', 'grown', 'drawn', 'thrown', 'worn',
      'torn', 'sworn', 'proven']);
    if (pastParticiples.has(lower)) {
      // These follow auxiliary verbs. If standalone, it's likely a reduced clause.
      // Convert to "thee" for safety — "you, risen from death" → "thee, risen..."
      // But "you have done" would be caught differently (have → hast first)
      return matchCase(y + 'ou', 'thee') + ' ' + nextWord;
    }

    // Subject "you" + verb → "thou" + archaic form
    const thou = y === 'Y' ? 'Thou' : 'thou';
    return thou + ' ' + archaicVerb(nextWord);
  });

  // 5. Remaining object "you" (after prepositions, as complement)
  // Pattern: preposition + "you" or verb + "you"
  result = result.replace(/\b(to|for|with|from|upon|unto|before|after|about|against|in|on|at|by|of|through|into|toward|towards|behind|near|see|praise|glorify|worship|bless|behold|touch|know|love|save|deliver|enlighten|make) ([Yy])ou\b/g,
    (match, prep, y) => {
      return prep + ' ' + matchCase(y + 'ou', 'thee');
    }
  );

  // 6. Catch remaining standalone "you" at end of clause/sentence → "thee"
  result = result.replace(/\b([Yy])ou([.,;:!?"\s])/g, (match, y, after) => {
    return matchCase(y + 'ou', 'thee') + after;
  });

  // End of string
  result = result.replace(/\b([Yy])ou$/g, (match, y) => {
    return matchCase(y + 'ou', 'thee');
  });

  return result;
}

// ── Apply and output ─────────────────────────────────────────────────────────

const output = JSON.parse(JSON.stringify(data)); // deep clone

let totalChanges = 0;
for (let i = 1; i <= 11; i++) {
  const entry = output[String(i)];
  const fields = ['exapostilarion', 'theotokion', 'doxastikon'];

  for (const field of fields) {
    if (!entry[field]) continue;
    const original = entry[field];
    const converted = convertText(original);
    if (original !== converted) {
      totalChanges++;
      console.log(`\n── Eothinon ${i} ${field} ──`);
      // Show changes
      const origWords = original.split(/\s+/);
      const convWords = converted.split(/\s+/);
      for (let w = 0; w < origWords.length; w++) {
        if (origWords[w] !== convWords[w]) {
          console.log(`  "${origWords[w]}" → "${convWords[w]}"`);
        }
      }
    }
    entry[field] = converted;
  }

  // Update source metadata
  entry._source = 'johnsanidopoulos-goarch-theethy';
  entry._sourceNote = 'Converted from GOA you/your to OCA thee/thy by convert-eothinon-pronouns.js';
}

console.log(`\n${totalChanges} texts modified out of 33.`);

const applyMode = process.argv.includes('--apply');
const outPath = applyMode ? SRC : OUT;
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Written to ${outPath}`);
if (!applyMode) {
  console.log('Review the output, then run with --apply to update eothinon.json.');
}
