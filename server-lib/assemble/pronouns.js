'use strict';

// Thee/Thy → You/Your substitution. Applied to assembled blocks when ?pronoun=yy.

// Simple-past forms for the "didst <verb>" construction. Without this, "Thou
// didst descend" modernizes to the stilted "You did descend" instead of the
// natural "You descended". Irregular verbs need an explicit map; regular verbs
// fall through to the -ed rule in verbToPast(). Keep base forms lowercase.
const IRREGULAR_PAST = {
  come:'came', become:'became', overcome:'overcame', arise:'arose', rise:'rose',
  give:'gave', forgive:'forgave', make:'made', take:'took', mistake:'mistook',
  forsake:'forsook', partake:'partook', bring:'brought', buy:'bought',
  think:'thought', seek:'sought', teach:'taught', catch:'caught', fight:'fought',
  send:'sent', spend:'spent', bend:'bent', lend:'lent', set:'set', put:'put',
  shed:'shed', cast:'cast', cost:'cost', cut:'cut', let:'let', shut:'shut',
  hurt:'hurt', burst:'burst', spread:'spread', bear:'bore', tear:'tore',
  wear:'wore', swear:'swore', fall:'fell', befall:'befell', hold:'held',
  behold:'beheld', uphold:'upheld', withhold:'withheld', lead:'led', feed:'fed',
  flee:'fled', find:'found', bind:'bound', grind:'ground', wind:'wound',
  see:'saw', foresee:'foresaw', speak:'spoke', break:'broke', wake:'woke',
  awake:'awoke', choose:'chose', freeze:'froze', hide:'hid', ride:'rode',
  write:'wrote', drive:'drove', smite:'smote', shine:'shone', sing:'sang',
  ring:'rang', spring:'sprang', drink:'drank', sink:'sank', begin:'began',
  swim:'swam', run:'ran', win:'won', spin:'spun', sit:'sat', spit:'spat',
  stand:'stood', understand:'understood', withstand:'withstood', meet:'met',
  keep:'kept', sleep:'slept', sweep:'swept', weep:'wept', creep:'crept',
  leave:'left', feel:'felt', deal:'dealt', kneel:'knelt', mean:'meant',
  hear:'heard', say:'said', pay:'paid', lay:'laid', slay:'slew', do:'did',
  undo:'undid', go:'went', undergo:'underwent', have:'had', eat:'ate',
  draw:'drew', withdraw:'withdrew', blow:'blew', grow:'grew', know:'knew',
  throw:'threw', overthrow:'overthrew', fly:'flew', lie:'lay', shake:'shook',
  strike:'struck', sting:'stung', cling:'clung', fling:'flung', swing:'swung',
  wring:'wrung', hang:'hung', dig:'dug', light:'lit', sell:'sold', tell:'told',
  foretell:'foretold', dwell:'dwelt', tread:'trod', build:'built', shoot:'shot',
  weave:'wove', gird:'girded',
};

// Words that can follow "didst" without being its main verb — leave these for
// the generic didst→did rule rather than trying to conjugate them.
const NON_VERB_AFTER_DIDST = new Set(['thou','thee','you','ye','not','the','a','an']);

function verbToPast(verb) {
  const v = verb.toLowerCase();
  if (IRREGULAR_PAST[v] !== undefined) return IRREGULAR_PAST[v];
  if (/e$/.test(v))            return v + 'd';               // create→created
  if (/[^aeiou]y$/.test(v))    return v.slice(0, -1) + 'ied'; // glorify→glorified
  return v + 'ed';                                            // descend→descended
}

const YOU_YOUR_RULES = [
  // "didst <verb>" → simple past (before the generic Didst→Did below).
  // "didst not <verb>" stays "did not <verb>" (English negatives keep the base
  // verb). A non-verb after "didst" (inversion "didst thou…") is left alone.
  [/\b([Dd])idst\s+(not\s+)?([A-Za-z]+)/g, (m, d, neg, word) => {
    const did = d === 'D' ? 'Did' : 'did';
    if (neg) return `${did} not ${word}`;
    if (NON_VERB_AFTER_DIDST.has(word.toLowerCase())) return m;
    let past = verbToPast(word);
    if (d === 'D') past = past.charAt(0).toUpperCase() + past.slice(1);
    return past;
  }],
  // Predicate-nominative Thine first (before general Thine → Your)
  [/\bThine(?=\s+is\b)/g,       'Yours'],
  [/\bthine(?=\s+is\b)/g,       'yours'],
  // Pronouns
  [/\bThou\b/g,    'You'],     [/\bthou\b/g,    'you'],
  [/\bThee\b/g,    'You'],     [/\bthee\b/g,    'you'],
  [/\bThy\b/g,     'Your'],    [/\bthy\b/g,     'your'],
  [/\bThine\b/g,   'Your'],    [/\bthine\b/g,   'your'],
  [/\bThyself\b/g, 'Yourself'],[/\bthyself\b/g, 'yourself'],
  // Irregular verb forms
  [/\bArt\b/g,      'Are'],    [/\bart\b/g,      'are'],
  [/\bHast\b/g,     'Have'],   [/\bhast\b/g,     'have'],
  [/\bDost\b/g,     'Do'],     [/\bdost\b/g,     'do'],
  [/\bWilt\b/g,     'Will'],   [/\bwilt\b/g,     'will'],
  [/\bWast\b/g,     'Were'],   [/\bwast\b/g,     'were'],
  [/\bDidst\b/g,    'Did'],    [/\bdidst\b/g,    'did'],
  [/\bHadst\b/g,    'Had'],    [/\bhadst\b/g,    'had'],
  [/\bShouldst\b/g, 'Should'], [/\bshouldst\b/g, 'should'],
  [/\bWouldst\b/g,  'Would'],  [/\bwouldst\b/g,  'would'],
  [/\bCouldst\b/g,  'Could'],  [/\bcouldst\b/g,  'could'],
  // -est verbs requiring -e restoration on the stem
  [/\bGavest\b/g,   'Gave'],   [/\bgavest\b/g,   'gave'],
  [/\bGivest\b/g,   'Give'],   [/\bgivest\b/g,   'give'],
  [/\bHidest\b/g,   'Hide'],   [/\bhidest\b/g,   'hide'],
  [/\bLovest\b/g,   'Love'],   [/\blovest\b/g,   'love'],
  [/\bMakest\b/g,   'Make'],   [/\bmakest\b/g,   'make'],
  [/\bRidest\b/g,   'Ride'],   [/\bridest\b/g,   'ride'],
  [/\bTakest\b/g,   'Take'],   [/\btakest\b/g,   'take'],
  // -est verbs where stripping -est gives the correct stem
  [/\bBeholdest\b/g, 'Behold'],  [/\bbeholdest\b/g, 'behold'],
  [/\bCallest\b/g,   'Call'],    [/\bcallest\b/g,   'call'],
  [/\bCoverest\b/g,  'Cover'],   [/\bcoverest\b/g,  'cover'],
  [/\bDwellest\b/g,  'Dwell'],   [/\bdwellest\b/g,  'dwell'],
  [/\bFillest\b/g,   'Fill'],    [/\bfillest\b/g,   'fill'],
  [/\bHearest\b/g,   'Hear'],    [/\bhearest\b/g,   'hear'],
  [/\bHoldest\b/g,   'Hold'],    [/\bholdest\b/g,   'hold'],
  [/\bKeepest\b/g,   'Keep'],    [/\bkeepest\b/g,   'keep'],
  [/\bKnowest\b/g,   'Know'],    [/\bknowest\b/g,   'know'],
  [/\bLeadest\b/g,   'Lead'],    [/\bleadest\b/g,   'lead'],
  [/\bLettest\b/g,   'Let'],     [/\blettest\b/g,   'let'],
  [/\bOpenest\b/g,   'Open'],    [/\bopenest\b/g,   'open'],
  [/\bRemainest\b/g, 'Remain'],  [/\bremainist\b/g, 'remain'],
  [/\bRenewest\b/g,  'Renew'],   [/\brenewest\b/g,  'renew'],
  [/\bSendest\b/g,   'Send'],    [/\bsendest\b/g,   'send'],
  [/\bSeekest\b/g,   'Seek'],    [/\bseekest\b/g,   'seek'],
  [/\bSeest\b/g,     'See'],     [/\bseest\b/g,     'see'],
  [/\bSpeakest\b/g,  'Speak'],   [/\bspeakest\b/g,  'speak'],
  [/\bTeachest\b/g,  'Teach'],   [/\bteachest\b/g,  'teach'],
  [/\bTurnest\b/g,   'Turn'],    [/\bturnest\b/g,   'turn'],
  [/\bWalkest\b/g,   'Walk'],    [/\bwalkest\b/g,   'walk'],
  [/\bWaterest\b/g,  'Water'],   [/\bwaterest\b/g,  'water'],
  [/\bWeepest\b/g,   'Weep'],    [/\bweepest\b/g,   'weep'],
];

function applyYouYour(text) {
  for (const [re, rep] of YOU_YOUR_RULES) text = text.replace(re, rep);
  return text;
}

// Resolve the language register for a request: an explicit ?pronoun=tt|yy query
// param always wins; otherwise fall back to the active parish/overlay's
// `defaultPronoun` rubric; otherwise 'tt' (traditional). Lets a parish default
// to modern "You/Your" across services without appending ?pronoun=yy each time.
function resolvePronoun(q, overlayRubrics) {
  if (q && (q.pronoun === 'tt' || q.pronoun === 'yy')) return q.pronoun;
  const d = overlayRubrics && overlayRubrics.defaultPronoun;
  return (d === 'tt' || d === 'yy') ? d : 'tt';
}

module.exports = { YOU_YOUR_RULES, applyYouYour, resolvePronoun };
