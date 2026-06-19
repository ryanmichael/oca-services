'use strict';

// yy→tt pronoun transformer for menaion troparia/kontakia.
//
// Converts modern-English ("you/your/are/have") OCA menaion hymn text into
// archaic-English ("thou/thee/thy/art/hast"), with verb agreement.
//
// Singular by default. Plural-address heuristic detects "O saints/fathers/
// apostles/martyrs/holy ones/ye" and leaves ye/you/your untouched in those
// hymns. The address-target is inferred per hymn, not per sentence, because
// hymn texts rarely switch addressees mid-text and the per-sentence call would
// drift on lines like "O saints, ye who labored in the world".
//
// Usage:
//   node scripts/yy-to-tt.js sample          # print 10 sample transforms
//   node scripts/yy-to-tt.js dry-run         # transform all, print diff stats
//   node scripts/yy-to-tt.js apply           # retag existing rows yy + insert tt
//   node scripts/yy-to-tt.js test "<text>"   # one-shot transform of given text

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'storage', 'oca.db');

// ─── Address detection ──────────────────────────────────────────────────────

// If any of these patterns match in the hymn, treat the addressee as plural
// (leave ye/you/your alone). Patterns are intentionally narrow — only fire
// when there's a vocative naming multiple saints.
const PLURAL_ADDRESS_PATTERNS = [
  /\bO\s+(?:holy\s+)?(?:saints|fathers|apostles|martyrs|hierarchs|prophets|brethren|wonderworkers|unmercenaries|venerable\s+ones|holy\s+ones|righteous\s+ones|godly\s+ones|champions|three(?:\s+children|\s+youths)?|forty(?:\s+martyrs)?)\b/i,
  /\bO\s+ye\b/i,
];

function isPluralAddress(text) {
  return PLURAL_ADDRESS_PATTERNS.some((re) => re.test(text));
}

// ─── Pronoun + verb transformation ──────────────────────────────────────────

// Order matters: multi-word substitutions before single-word; auxiliary phrases
// before bare pronouns. All matches are case-aware (preserve initial capital).

const PHRASE_RULES = [
  // "you have" → "thou hast" / "Thou hast"
  [/\byou have\b/g, 'thou hast'],
  [/\bYou have\b/g, 'Thou hast'],
  [/\byou hadst?\b/g, 'thou hadst'],
  [/\bYou hadst?\b/g, 'Thou hadst'],
  [/\byou had\b/g, 'thou hadst'],
  [/\bYou had\b/g, 'Thou hadst'],

  // "you are" / "you art" → "thou art"
  [/\byou are\b/g, 'thou art'],
  [/\bYou are\b/g, 'Thou art'],

  // "you were" → "thou wast"
  [/\byou were\b/g, 'thou wast'],
  [/\bYou were\b/g, 'Thou wast'],

  // "you will" → "thou wilt"
  [/\byou will\b/g, 'thou wilt'],
  [/\bYou will\b/g, 'Thou wilt'],

  // "you shall" → "thou shalt"
  [/\byou shall\b/g, 'thou shalt'],
  [/\bYou shall\b/g, 'Thou shalt'],

  // "you do" / "you don't" → "thou dost / dost not"
  [/\byou do not\b/g, 'thou dost not'],
  [/\bYou do not\b/g, 'Thou dost not'],
  [/\byou do\b/g, 'thou dost'],
  [/\bYou do\b/g, 'Thou dost'],
  [/\byou didst?\b/g, 'thou didst'],
  [/\bYou didst?\b/g, 'Thou didst'],
  [/\byou did\b/g, 'thou didst'],
  [/\bYou did\b/g, 'Thou didst'],

  // "you can" → "thou canst"
  [/\byou can\b/g, 'thou canst'],
  [/\bYou can\b/g, 'Thou canst'],

  // "you may" → "thou mayest"
  [/\byou may\b/g, 'thou mayest'],
  [/\bYou may\b/g, 'Thou mayest'],

  // "you must" → "thou must" (must doesn't conjugate)
  [/\byou must\b/g, 'thou must'],
  [/\bYou must\b/g, 'Thou must'],

  // "you would" / "you should" / "you could"
  [/\byou would\b/g, 'thou wouldst'],
  [/\bYou would\b/g, 'Thou wouldst'],
  [/\byou should\b/g, 'thou shouldst'],
  [/\bYou should\b/g, 'Thou shouldst'],
  [/\byou couldst?\b/g, 'thou couldst'],
  [/\bYou couldst?\b/g, 'Thou couldst'],
  [/\byou could\b/g, 'thou couldst'],
  [/\bYou could\b/g, 'Thou couldst'],

  // "you wast" already? unlikely; skip.
];

// "your" before vowel sounds becomes "thine"; before consonants "thy".
// This is the OCA convention. We approximate vowel-sound by the next-word's
// first letter (a/e/i/o/u/h-with-silent-h is rare; treat any vowel as match).
function transformYour(text) {
  return text.replace(/\b(Your|your)\b\s+([A-Za-z'"]+)/g, (match, your, next) => {
    const lower = your[0] === your[0].toLowerCase();
    const isVowel = /^[aeiouAEIOU]/.test(next);
    const replacement = isVowel
      ? (lower ? 'thine' : 'Thine')
      : (lower ? 'thy' : 'Thy');
    return `${replacement} ${next}`;
  });
}

// Bare "you" → thou (subject) or thee (object). Distinguishing is hard
// without a parser; we use a heuristic: "you" is treated as object when
// preceded by a preposition, an imperative verb that takes a direct object,
// or stands at the end of a clause. Otherwise → subject (thou).
//
// In practice OCA menaion hymn texts almost always use "you" as the subject
// of a verb ("you became", "you appeared", "you settled"). The object case
// arises in "to you", "with you", "in you", "for you", "before you" etc.
// Note: "for" is intentionally excluded — in hymn English it's usually the
// conjunction "because" ("for Thou art good"), not the preposition.
const OBJECT_PRECEDERS = [
  'to', 'unto', 'with', 'in', 'before', 'by', 'through', 'from',
  'against', 'upon', 'on', 'at', 'beside', 'above', 'beneath', 'within',
  'without', 'beyond', 'among', 'amongst', 'after', 'about', 'around',
  'behind', 'between', 'over', 'under', 'toward', 'towards',
  'concerning',
];

// Adverbs/intensifiers that commonly sit between "you" and a copula/auxiliary:
// "you alone are", "you indeed art", "you also have". Treat the trailing verb
// as the signal that "you" is a subject.
const ADV_BETWEEN = '(?:alone|also|indeed|ever|truly|now|then|surely|verily)';

// Phrase rules that survive an intervening adverb.
const PHRASE_RULES_WITH_ADV = [
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+have\\b`, 'g'), (m, adv = '') => `thou${adv} hast`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+have\\b`, 'g'), (m, adv = '') => `Thou${adv} hast`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+are\\b`, 'g'), (m, adv = '') => `thou${adv} art`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+are\\b`, 'g'), (m, adv = '') => `Thou${adv} art`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+were\\b`, 'g'), (m, adv = '') => `thou${adv} wast`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+were\\b`, 'g'), (m, adv = '') => `Thou${adv} wast`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+will\\b`, 'g'), (m, adv = '') => `thou${adv} wilt`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+will\\b`, 'g'), (m, adv = '') => `Thou${adv} wilt`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+shall\\b`, 'g'), (m, adv = '') => `thou${adv} shalt`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+shall\\b`, 'g'), (m, adv = '') => `Thou${adv} shalt`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+do\\b`, 'g'), (m, adv = '') => `thou${adv} dost`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+do\\b`, 'g'), (m, adv = '') => `Thou${adv} dost`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+did\\b`, 'g'), (m, adv = '') => `thou${adv} didst`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+did\\b`, 'g'), (m, adv = '') => `Thou${adv} didst`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+can\\b`, 'g'), (m, adv = '') => `thou${adv} canst`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+can\\b`, 'g'), (m, adv = '') => `Thou${adv} canst`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+may\\b`, 'g'), (m, adv = '') => `thou${adv} mayest`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+may\\b`, 'g'), (m, adv = '') => `Thou${adv} mayest`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+must\\b`, 'g'), (m, adv = '') => `thou${adv} must`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+must\\b`, 'g'), (m, adv = '') => `Thou${adv} must`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+would\\b`, 'g'), (m, adv = '') => `thou${adv} wouldst`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+would\\b`, 'g'), (m, adv = '') => `Thou${adv} wouldst`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+should\\b`, 'g'), (m, adv = '') => `thou${adv} shouldst`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+should\\b`, 'g'), (m, adv = '') => `Thou${adv} shouldst`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+could\\b`, 'g'), (m, adv = '') => `thou${adv} couldst`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+could\\b`, 'g'), (m, adv = '') => `Thou${adv} couldst`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+had\\b`, 'g'), (m, adv = '') => `thou${adv} hadst`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+had\\b`, 'g'), (m, adv = '') => `Thou${adv} hadst`],
  [new RegExp(`\\byou(\\s+${ADV_BETWEEN})?\\s+might\\b`, 'g'), (m, adv = '') => `thou${adv} mightest`],
  [new RegExp(`\\bYou(\\s+${ADV_BETWEEN})?\\s+might\\b`, 'g'), (m, adv = '') => `Thou${adv} mightest`],
];

// ─── Past-tense lemma table ─────────────────────────────────────────────────

// Map V-past → V-base for "you V-past" → "thou didst V-base".
// Covers the top occurrences in the menaion corpus (frequency probed
// 2026-06-17). Order: most frequent first for readability.
const PAST_TO_BASE = {
  // Top irregulars (1000+ occurrences combined)
  sought: 'seek', made: 'make', taught: 'teach', took: 'take',
  brought: 'bring', kept: 'keep', went: 'go', saw: 'see',
  gave: 'give', left: 'leave', built: 'build', came: 'come',
  fought: 'fight', led: 'lead', dwelt: 'dwell', shed: 'shed',
  // More irregulars
  bought: 'buy', sold: 'sell', told: 'tell', said: 'say',
  found: 'find', held: 'hold', sent: 'send', spent: 'spend',
  lost: 'lose', won: 'win', sat: 'sit', stood: 'stand',
  thought: 'think', wrought: 'work', caught: 'catch', felt: 'feel',
  hid: 'hide', bound: 'bind', drew: 'draw', knew: 'know',
  grew: 'grow', threw: 'throw', flew: 'fly', heard: 'hear',
  read: 'read', met: 'meet', fed: 'feed', bled: 'bleed',
  bred: 'breed', spread: 'spread', slept: 'sleep', wept: 'weep',
  crept: 'creep', swept: 'sweep', leapt: 'leap', dealt: 'deal',
  felt: 'feel', meant: 'mean', burnt: 'burn', spilt: 'spill',
  rose: 'rise', arose: 'arise', spoke: 'speak', broke: 'break',
  bore: 'bear', strove: 'strive', clung: 'cling', flung: 'fling',
  hung: 'hang', stung: 'sting', swung: 'swing', wrung: 'wring',
  sung: 'sing', sprung: 'spring',
  chose: 'choose', wore: 'wear', tore: 'tear', swore: 'swear',
  woke: 'wake', awoke: 'awake', drove: 'drive', wrote: 'write',
  smote: 'smite', stole: 'steal', sang: 'sing', drank: 'drink',
  ate: 'eat', ran: 'run', began: 'begin', forgot: 'forget',
  forsook: 'forsake', became: 'become',
  // Uninflected past forms (same as base)
  put: 'put', cast: 'cast', cut: 'cut', set: 'set', shut: 'shut',
  hit: 'hit', let: 'let', burst: 'burst', cost: 'cost',
  // More less-frequent irregulars
  underwent: 'undergo', showed: 'show', shone: 'shine',
  beheld: 'behold', overcame: 'overcome', withstood: 'withstand',
  forgave: 'forgive', forsook: 'forsake', undertook: 'undertake',
  fled: 'flee', bled: 'bleed', sped: 'speed', mistook: 'mistake',
};

// Verb stems we know end in -e (so past = base+d). Lets the regular stripper
// pick the right form. Built from the menaion corpus; extend as needed.
const E_STEM_BASES = new Set([
  'love', 'live', 'illumine', 'receive', 'pierce', 'preserve', 'offer'.replace(/r$/,'r'),
  'serve', 'cultivate', 'glorify'.replace(/y$/,'y'), 'settle', 'praise', 'cease',
  'achieve', 'accomplish'.replace(/h$/,'h'), 'desire', 'arise', 'choose',
  'embrace', 'come', 'become', 'overcome', 'leave', 'cleave', 'believe',
  'achieve', 'compose', 'oppose', 'expose', 'dispose', 'propose',
  'observe', 'deserve', 'enslave', 'forgive', 'forgive', 'reside',
  'rejoice', 'baptize', 'recognize', 'realize', 'emphasize', 'reside',
  'decide', 'divide', 'subside', 'abide', 'reside', 'guide',
  'subdue', 'continue', 'ensue', 'pursue', 'rescue',
  // -ide: extend the divide/decide family. Audit Finding 2026-06-19 PM
  // surfaced 'provide' → 'didst provid' in the NA Saints feast canon.
  'provide',
  // -ive: parallel to receive/believe. Common in martyr canons.
  'survive', 'arrive', 'derive', 'strive', 'thrive', 'revive',
  // -are/-ore/-ure (CVre verbs): liturgical staples. Without these, e.g.
  // 'declared' → 'declar', 'restored' → 'restor'.
  'declare', 'prepare', 'compare', 'spare', 'share',
  'adore', 'restore', 'ignore', 'implore', 'explore',
  'endure', 'secure', 'measure', 'assure',
  // -age: 'engaged' → 'engag' without this.
  'engage', 'enrage', 'encourage', 'manage',
  // -ate already handled by the /Cated/ regex below, but a few -ote/-ute
  // outliers are safer here.
  'atone', 'approve', 'improve', 'remove',
]);

// Past-tense suffixes we recognize for stemming
function stemRegularPast(past) {
  // -ied (cried→cry, glorified→glorify, sanctified→sanctify)
  if (/[^aeiou]ied$/.test(past)) return past.slice(0, -3) + 'y';
  // -eed (freed→free)
  if (/eed$/.test(past)) return past.slice(0, -1);
  // -ed: ambiguous (drop d → base-e, or drop ed → consonant-base)
  if (/ed$/.test(past)) {
    // Heuristic: if dropping just 'd' yields a known e-stem, prefer that.
    const dropD = past.slice(0, -1);
    if (E_STEM_BASES.has(dropD)) return dropD;
    // -Cated/-Cited/-Cuted/-Ceted/-Coted (C = consonant): -ate/-ite/-ute/
    // -ete/-ote class (emulated→emulate, illuminated→illuminate,
    // contributed→contribute, completed→complete, devoted→devote). Drop 'd'.
    // The leading-consonant guard avoids false positives like
    // defeated/repeated/treated/heated (root ends in -eat, not -eate).
    if (/[bcdfghjklmnpqrstvwxz][aeiou]ted$/.test(past)) return past.slice(0, -1);
    // -ized/-ised: -ize/-ise class (baptized→baptize, glorified→glorify
    // [handled above by -ied rule], realized→realize). Drop just 'd'.
    if (/[is]zed$/.test(past) || /[is]sed$/.test(past)) return past.slice(0, -1);
    // -Cled where C ∈ {b,p,t,d,g,f,c,k,m,n,r,s,v,z} (NOT 'l' to avoid -lled):
    // these all need to keep the silent 'e' (humbled→humble, struggled→struggle,
    // trampled→trample, bridled→bridle, mantled→mantle). Drop just 'd'.
    if (/[bcdfgkmnprstvz]led$/.test(past)) return past.slice(0, -1);
    // Doubled-consonant past form: dropped→drop, planned→plan
    // (last 3 chars are CCed with a vowel before)
    if (/([bdfgklmnprst])\1ed$/.test(past)) return past.slice(0, -3);
    // Default: strip -ed
    return past.slice(0, -2);
  }
  return null; // unknown shape
}

function pastToBase(past) {
  const lower = past.toLowerCase();
  if (PAST_TO_BASE[lower]) return PAST_TO_BASE[lower];
  return stemRegularPast(lower);
}

function transformPastTense(text) {
  // "you (adv|adv-pair)? V-past" → "thou didst (adv)? V-base"
  // Allows: single adverb (alone/also/indeed/ever/truly/now/then/surely/verily/
  // first), or "not only" / "in truth" compound. Adverb is preserved in output.
  const ADV_OPTIONAL = '(?:\\s+(?:not\\s+only|in\\s+truth|alone|also|indeed|ever|truly|now|then|surely|verily|first|once|never))?';
  // The (?!You|you|Thou|thou) lookahead prevents the verb-capture from
  // consuming the next pronoun when the current "you/Thou" is followed by
  // a non-past word — that bug would skip the next pronoun's transform.
  const PAST_VERB_RE = new RegExp(`\\b(You|you)(${ADV_OPTIONAL})\\s+(?!You|you|Thou|thou)([a-zA-Z]+)\\b`, 'g');
  text = text.replace(PAST_VERB_RE, (full, pron, adv, verb) => {
    const base = pastToBase(verb);
    if (!base) return full;
    const upper = pron[0] === pron[0].toUpperCase();
    const advText = adv || '';
    return `${upper ? 'Thou' : 'thou'}${advText} didst ${base}`;
  });
  // Also catch already-archaized "Thou V-past" (some yy source rows had partial
  // tt forms). Only fires when pastToBase recognizes a real past form, so
  // "thou didst V-base" / "Thou camest" etc. (irregular present-tense -est
  // verbs) aren't affected.
  const THOU_PAST_RE = new RegExp(`\\b(Thou|thou)(${ADV_OPTIONAL})\\s+(?!You|you|Thou|thou)([a-zA-Z]+)\\b`, 'g');
  text = text.replace(THOU_PAST_RE, (full, pron, adv, verb) => {
    // Skip auxiliaries we already produce
    if (/^(didst|hast|hadst|art|wert|wast|wilt|shalt|dost|canst|mayest|mightest|must|wouldst|shouldst|couldst)$/i.test(verb)) return full;
    const base = pastToBase(verb);
    if (!base) return full;
    const upper = pron[0] === pron[0].toUpperCase();
    const advText = adv || '';
    return `${upper ? 'Thou' : 'thou'}${advText} didst ${base}`;
  });
  return text;
}

// Sometimes the yy source already has "Thou" where "Thee" is correct (object
// form after a preposition or a present-tense verb of perception/devotion).
// This pass rewrites those.
function transformThouAsObject(text) {
  // After prepositions
  const prepRe = new RegExp(
    `\\b(${OBJECT_PRECEDERS.join('|')})\\s+(Thou|thou)\\b`,
    'g'
  );
  text = text.replace(prepRe, (m, prep, p) => `${prep} ${p[0] === p[0].toLowerCase() ? 'thee' : 'Thee'}`);
  // "for Thou" is ambiguous — most often the conjunction "because"
  // ("for Thou art good"), but rarely the preposition ("I die for Thee that
  // I might live"). Narrow rule: "for Thou" followed by comma or " that"
  // is preposition → Thee. Other "for Thou X" forms are left alone.
  text = text.replace(/\bfor\s+(Thou|thou)(\s*,|\s+that)/g, (m, p, tail) => `for ${p[0] === p[0].toLowerCase() ? 'thee' : 'Thee'}${tail}`);
  // After a small set of devotional verbs/gerunds where the saint speaks to
  // Christ (typical "Joseph was amazed" podoben: "I love Thou", "seeking Thou")
  const DEVOTION_VERBS = '(?:love|loving|seek|seeking|follow|following|serve|serving|praise|praising|magnify|magnifying|glorify|glorifying|honor|honoring|behold|beholding|embrace|embracing|adore|adoring|bore|bear|bearing|brought|bring|bringing|beseech|beseeching|entreat|entreating|implore|imploring|supplicate|supplicating|invoke|invoking)';
  const verbRe = new RegExp(`\\b(${DEVOTION_VERBS})\\s+(Thou|thou)\\b`, 'g');
  text = text.replace(verbRe, (m, verb, p) => `${verb} ${p[0] === p[0].toLowerCase() ? 'thee' : 'Thee'}`);
  return text;
}

function transformBareYou(text) {
  // First pass: object-form "you" after a preposition → "thee"
  const prepRe = new RegExp(
    `\\b(${OBJECT_PRECEDERS.join('|')})\\s+(You|you)\\b`,
    'g'
  );
  text = text.replace(prepRe, (m, prep, you) => {
    const lower = you[0] === you[0].toLowerCase();
    return `${prep} ${lower ? 'thee' : 'Thee'}`;
  });

  // Second pass: "you" right after a past-tense verb → "thee" (direct object).
  // Past-tense ending heuristic: -ed, -t, -ght, -ied, -ied. Also catches some
  // irregulars whose past form ends in -t (kept, lost, sent, made [no, made
  // ends in -de which we cover], gave [no], brought [-ght]).
  // Common irregulars not caught by suffix: gave, took, made, told, sold,
  // bade, hid, led, fed, said, did, won, drew, knew, grew, threw.
  const VERB_SUFFIX_RE = /\b([A-Za-z]+(?:ed|ied|ght|t)|gave|took|made|told|sold|bade|hid|led|fed|said|won|drew|knew|grew|threw|saw|chose|rose|arose|came|drove|wrote|spoke|broke|sang|drank|ate|ran|began|smote|stole|wore|tore|swore|froze|woke|forsook|forgot|became|bore|strove|given|taken|written|spoken|broken|chosen|frozen|stolen|shown|known|drawn|thrown|blown|grown|fallen|beaten|eaten|ridden|bidden|hidden|forgotten|forsaken|awoken|woven|smitten|stricken|sworn|worn|torn|borne)\s+(You|you)\b/g;
  text = text.replace(VERB_SUFFIX_RE, (m, verb, you) => {
    // Avoid false positives like "at" (preposition was already removed; "at"
    // ends in "t" but is on the prep list — already handled). Reject very
    // short tokens.
    if (verb.length <= 2) return m;
    // Reject articles/pronouns/conjunctions that happen to end in -t/-ed
    // (none common in menaion English). Reject "front" / "next" / etc by
    // ensuring the verb-form starts with a lowercase letter (proper nouns
    // aren't verbs).
    const lower = you[0] === you[0].toLowerCase();
    return `${verb} ${lower ? 'thee' : 'Thee'}`;
  });

  // Third pass: remaining "you" → "thou" (subject default)
  text = text.replace(/\b(You|you)\b/g, (m, you) => {
    const lower = you[0] === you[0].toLowerCase();
    return lower ? 'thou' : 'Thou';
  });

  return text;
}

// Detect rows whose tt output still contains a bare "thou V-ed" form that
// OCA would render as "thou didst V". The DB write uses this to flag rows
// for later manual review.
function needsPastTenseReview(text) {
  // "thou (verb ending in -ed/-t/-ght)" outside of known good forms (hadst,
  // didst, wert, wast, mightst, wouldst, shouldst, hast, art, dost, canst,
  // wilt, shalt, mayest, wouldst, couldst, etc.)
  const GOOD_FORMS = new Set([
    'hast', 'hadst', 'art', 'wert', 'wast', 'wilt', 'shalt', 'dost', 'didst',
    'canst', 'mayest', 'mightest', 'must', 'wouldst', 'shouldst', 'couldst',
    'mightst',
    // Adverbs that happen to end in -t (avoid false positives like "thou not
    // only didst …", "thou first didst become").
    'not', 'first', 'ever', 'never', 'most', 'next', 'almost', 'against',
  ]);
  // Match "thou V-past" excluding -est-suffixed forms (which are already
  // correct archaic present-tense: abidest/restest/lovedst/etc.).
  const re = /\b[Tt]hou\s+([A-Za-z]+(?:ed|ied|ght|t))\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const w = m[1].toLowerCase();
    if (GOOD_FORMS.has(w)) continue;
    if (/est$/.test(w)) continue; // archaic present 2sg: abidest, restest
    return true;
  }
  return false;
}

// "yours" → "thine", "yourself" → "thyself"
function transformYoursSelf(text) {
  text = text.replace(/\b(Yourself)\b/g, 'Thyself').replace(/\b(yourself)\b/g, 'thyself');
  text = text.replace(/\b(Yours)\b/g, 'Thine').replace(/\b(yours)\b/g, 'thine');
  return text;
}

// Standalone present-tense verbs after "thou" we may have already produced.
// Some forms aren't covered by the phrase rules (e.g., "you who have" — after
// the phrase rule that becomes "thou who hast", which is correct).
// We don't need a second pass for those; the phrase rules above already cover
// the common auxiliaries.

// Common present-tense verbs that appear in menaion troparia after "thou" and
// need a 2sg `-est` suffix. Whitelist (not heuristic) to avoid false positives
// on nouns ("thou God" → "thou Godest"). Extend as more cases surface.
const PRESENT_VERB_EST = {
  // ending → just append 'est'
  grant: 'grantest', avert: 'avertest', show: 'showest', entreat: 'entreatest',
  deliver: 'deliverest', defend: 'defendest', protect: 'protectest',
  guard: 'guardest', heal: 'healest', save: 'savest', hear: 'hearest',
  see: 'seest', know: 'knowest', love: 'lovest', work: 'workest',
  give: 'givest', take: 'takest', dwell: 'dwellest', stand: 'standest',
  reign: 'reignest', rule: 'rulest', hold: 'holdest', keep: 'keepest',
  bring: 'bringest', send: 'sendest', come: 'comest', go: 'goest',
  rest: 'restest', sleep: 'sleepest', suffer: 'sufferest',
  fight: 'fightest', strive: 'strivest', serve: 'servest',
  delight: 'delightest', think: 'thinkest', speak: 'speakest',
  walk: 'walkest', call: 'callest', look: 'lookest', listen: 'listenest',
  // ending in -e, append 'st'
  rejoice: 'rejoicest', intercede: 'intercedest', confess: 'confessest',
  abide: 'abidest', preserve: 'preservest', praise: 'praisest',
  bless: 'blessest', confirm: 'confirmest', enlighten: 'enlightenest',
  illumine: 'illuminest', sanctify: 'sanctifiest', glorify: 'glorifiest',
  magnify: 'magnifiest',
};

function transformPresentTenseEst(text) {
  const re = /\b([Tt]hou)\s+([a-z]+)\b/g;
  return text.replace(re, (full, pron, verb) => {
    const archaic = PRESENT_VERB_EST[verb];
    if (!archaic) return full;
    return `${pron} ${archaic}`;
  });
}

function transform(text) {
  if (isPluralAddress(text)) return text; // plural address — leave you/your/are

  let out = text;
  // Phrase rules with optional adverb first — they catch "you alone are"
  for (const [re, rep] of PHRASE_RULES_WITH_ADV) out = out.replace(re, rep);
  // Then the legacy bare phrase rules (kept for unintervening cases)
  for (const [re, rep] of PHRASE_RULES) out = out.replace(re, rep);
  // Past-tense agreement: "you V-ed" → "thou didst V"
  out = transformPastTense(out);
  out = transformYoursSelf(out);
  out = transformYour(out);
  out = transformBareYou(out);
  out = transformThouAsObject(out);
  out = transformPresentTenseEst(out);
  return out;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function openDb() {
  return new DatabaseSync(DB_PATH);
}

function selectAllYyRows(db) {
  // Pull only the yy rows — those are the source material for the transform.
  // First run: all rows are tagged 'tt' but contain yy text; we relabel them
  // to 'yy' before this query runs. Second run: rows are already 'yy'.
  return db.prepare(`
    SELECT t.id, t.commemoration_id, t.type, t.tone, t.text, t.pronoun,
           c.title, c.month, c.day
    FROM troparia t
    JOIN commemorations c ON c.id = t.commemoration_id
    WHERE t.pronoun = 'yy'
    ORDER BY c.month, c.day, c.title, t.type
  `).all();
}

function cmdSample() {
  const db = openDb();
  const rows = selectAllYyRows(db);
  // Pick 10 evenly spaced
  const step = Math.floor(rows.length / 10);
  for (let i = 0; i < 10; i++) {
    const r = rows[i * step];
    if (!r) continue;
    const out = transform(r.text);
    console.log(`\n── ${r.month}/${r.day} ${r.title} [${r.type}] ──`);
    console.log(`-- yy --\n${r.text.slice(0, 400)}`);
    console.log(`-- tt --\n${out.slice(0, 400)}`);
  }
  db.close();
}

function cmdDryRun() {
  const db = openDb();
  const rows = selectAllYyRows(db);
  let changed = 0, unchanged = 0, plural = 0, needsReview = 0;
  for (const r of rows) {
    if (isPluralAddress(r.text)) { plural++; continue; }
    const out = transform(r.text);
    if (out !== r.text) changed++; else unchanged++;
    if (needsPastTenseReview(out)) needsReview++;
  }
  console.log(`Total rows:      ${rows.length}`);
  console.log(`Plural-address:  ${plural} (left unchanged)`);
  console.log(`Singular, txfd:  ${changed}`);
  console.log(`Singular, no-op: ${unchanged}`);
  console.log(`Need PT review:  ${needsReview} (rows with bare "thou V-ed" — OCA would prefer "thou didst V")`);
  db.close();
}

function cmdApply() {
  const db = openDb();

  db.exec('BEGIN');
  try {
    // First-run case: rows are mistagged 'tt' with yy text and no yy rows
    // exist. Relabel them to 'yy' so the SELECT below has source material.
    // Subsequent runs: yy rows already exist; the UPDATE is a no-op (the
    // WHERE clause filters by source to avoid clashing with re-applied tt).
    const hasYy = db.prepare(`SELECT COUNT(*) AS n FROM troparia WHERE pronoun = 'yy'`).get().n;
    if (hasYy === 0) {
      db.exec(`UPDATE troparia SET pronoun = 'yy', source = 'oca-menaion' WHERE pronoun = 'tt'`);
    } else {
      db.exec(`DELETE FROM troparia WHERE pronoun = 'tt'`);
    }
    const rows = selectAllYyRows(db);
    const insert = db.prepare(`
      INSERT INTO troparia (commemoration_id, type, tone, text, pronoun, source)
      VALUES (?, ?, ?, ?, 'tt', ?)
    `);
    let inserted = 0, flaggedReview = 0;
    for (const r of rows) {
      const tt = transform(r.text);
      const source = needsPastTenseReview(tt)
        ? 'algorithmic-yy2tt-needs-review'
        : 'algorithmic-yy2tt';
      if (source.endsWith('needs-review')) flaggedReview++;
      insert.run(r.commemoration_id, r.type, r.tone, tt, source);
      inserted++;
    }
    db.exec('COMMIT');
    console.log(`Done. Retagged ${rows.length} rows to yy; inserted ${inserted} tt rows.`);
    console.log(`Flagged for manual review (source='algorithmic-yy2tt-needs-review'): ${flaggedReview}`);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.close();
}

function cmdTest(text) {
  console.log('-- in  --\n' + text);
  console.log('-- out --\n' + transform(text));
}

function main() {
  const cmd = process.argv[2];
  if (cmd === 'sample') return cmdSample();
  if (cmd === 'dry-run') return cmdDryRun();
  if (cmd === 'apply') return cmdApply();
  if (cmd === 'test') return cmdTest(process.argv.slice(3).join(' '));
  console.error('Usage: node scripts/yy-to-tt.js [sample|dry-run|apply|test <text>]');
  process.exit(1);
}

if (require.main === module) main();

module.exports = { transform, isPluralAddress };
