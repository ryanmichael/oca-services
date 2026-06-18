'use strict';

// Psalm 33 abbreviated form must include v8 — "O taste and see that the Lord
// is good" — restored 2026-06-14 after it had been silently dropped in an
// earlier edit. The verse is communionally significant (Eucharistic
// catechesis) and its absence is the kind of regression that's invisible
// without a rule because the section still renders, just shorter.

module.exports = {
  id:             'L9-psalm-33-verse-8',
  family:         'structure',
  severity:       'medium',
  description:    'Liturgy Psalm 33 abbreviated form includes verse 8 ("O taste and see").',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const psalm  = blocks.filter(b => b.section === 'Psalm 33');
    if (!psalm.length) return [];   // L5 catches the missing-section case
    const joined = psalm.map(b => b.text || '').join(' ').toLowerCase();
    if (/taste and see/.test(joined)) return [];
    return [{
      message: 'Psalm 33 renders without verse 8 ("O taste and see that the Lord is good…").',
      hint:    'See fixed-texts/liturgy-fixed.json psalm33 — verse 8 was restored 2026-06-14; check whether an overlay dropped it again.',
    }];
  },
};
