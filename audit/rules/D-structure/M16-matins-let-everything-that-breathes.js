'use strict';

// "Let everything that breathes praise the Lord" (Psalm 150:6) is sung at
// Matins immediately before the Lauds stichera, at Sundays + festal days.
// Section self-scopes via presence — weekday Matins doesn't have it.

module.exports = {
  id:             'M16-matins-let-everything-that-breathes',
  family:         'structure',
  severity:       'high',
  description:    'Matins "Let Everything That Breathes" section contains "Let everything that breathes praise the Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Let Everything That Breathes');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/let everything that breathes praise the lord/.test(joined)) return [];
    return [{
      message: 'Matins "Let Everything That Breathes" section has no canonical verse.',
      hint:    'Check the pre-Lauds Psalm 150:6 builder — section frame rendered without the verse.',
    }];
  },
};
