'use strict';

// At Holy Saturday Vesperal Liturgy, the Cherubic Hymn is substituted with
// "Let all mortal flesh keep silent, and in fear and trembling stand,
// pondering nothing earthly-minded. For the King of kings, the Lord of
// lords, comes to be slain…" — the great Holy Saturday hymn. Section
// self-scopes via presence (the substitute only renders on Holy Sat VL).

module.exports = {
  id:             'V2-vesperal-let-all-mortal-flesh',
  family:         'structure',
  severity:       'high',
  description:    'Vesperal Liturgy "Let All Mortal Flesh Keep Silence" contains canonical hymn body.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vesperal-liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Let All Mortal Flesh Keep Silence');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/let all mortal flesh keep silent/.test(joined)) return [];
    return [{
      message: 'Vesperal Liturgy "Let All Mortal Flesh Keep Silence" section has no canonical hymn body.',
      hint:    'Check the Holy Saturday Cherubic substitution builder.',
    }];
  },
};
