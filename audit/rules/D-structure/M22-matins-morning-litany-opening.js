'use strict';

// The Matins Morning Litany opens with "Let us complete our morning prayer
// unto the Lord" — the Matins-specific opening that distinguishes it from
// the Liturgy's "Let us complete our prayer unto the Lord" and the
// Vespers' "Let us complete our evening prayer unto the Lord". A regression
// that crosses these litanies between services is invisible without an
// opening-anchor rule.

module.exports = {
  id:             'M22-matins-morning-litany-opening',
  family:         'structure',
  severity:       'high',
  description:    'Matins Morning Litany opens with "Let us complete our morning prayer unto the Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Morning Litany');
    if (!blocks.length) return [];
    const first = blocks.find(b => b.type === 'prayer');
    if (!first) return [];
    if (/let us complete our morning prayer unto the lord/i.test(first.text || '')) return [];
    return [{
      message: `Matins Morning Litany opens with "${(first.text || '').slice(0, 80)}" — expected "Let us complete our morning prayer unto the Lord".`,
      hint:    'First petition is wrong — check the Matins morning litany builder.',
    }];
  },
};
