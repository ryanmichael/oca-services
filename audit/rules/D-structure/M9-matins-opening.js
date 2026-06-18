'use strict';

// Every Matins opens with one of two canonical exclamations:
//   "Blessed is our God always…"           — Daily / Lenten Matins
//   "Glory to the holy, and consubstallial,
//    and life-creating, and indivisible Trinity…"  — paschal/festal Matins
// Either is acceptable per OCA rubric depending on the day's rank and
// season. The rule guards against the failure mode where the section
// renders without either exclamation (frame only, body missing).

module.exports = {
  id:             'M9-matins-opening',
  family:         'structure',
  severity:       'high',
  description:    'Matins Opening section contains "Blessed is our God always" or the festal "Glory to the holy…Trinity" exclamation.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Opening');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/blessed is our god always/.test(joined)) return [];
    if (/glory to the holy[, ]+and consubstantial[, ]+and life-creating[, ]+and indivisible trinity/.test(joined)) return [];
    return [{
      message: 'Matins Opening section has neither "Blessed is our God always" nor "Glory to the holy…Trinity" exclamation.',
      hint:    'Check the Matins opening builder — section frame rendered without either canonical opening.',
    }];
  },
};
