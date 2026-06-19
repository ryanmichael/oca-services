'use strict';

// Eothinon cycle: 11 Sunday Matins gospel readings rotating week-by-week
// starting on All Saints Sunday (Pascha+56+7). For a Sunday with eothinon
// number N, the Matins Gospel label must reference the canonical passage.
// Suspended in Triodion/Pentecostarion — getEothinon returns null there.
const EOTHINON_GOSPELS = {
  1:  /Matthew\s+28[:\s]\s*16/i,
  2:  /Mark\s+16[:\s]\s*1\b/i,
  3:  /Mark\s+16[:\s]\s*9\b/i,
  4:  /Luke\s+24[:\s]\s*1\b/i,
  5:  /Luke\s+24[:\s]\s*12/i,
  6:  /Luke\s+24[:\s]\s*36/i,
  7:  /John\s+20[:\s]\s*1\b/i,
  8:  /John\s+20[:\s]\s*11/i,
  9:  /John\s+20[:\s]\s*19/i,
  10: /John\s+21[:\s]\s*1\b/i,
  11: /John\s+21[:\s]\s*15/i,
};

const cal = require('../../../calendar-rules.js');

module.exports = {
  id:             'M3-eothinon-gospel-match',
  family:         'calendar',
  severity:       'high',
  description:    'Sunday Matins Gospel matches the canonical eothinon passage for that Sunday.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'matins' || ctx.dow !== 'sunday') return false;
    return cal.getEothinon(ctx.d) !== null;
  },
  check: (ctx) => {
    const eoth = cal.getEothinon(ctx.d);
    const pattern = EOTHINON_GOSPELS[eoth];
    if (!pattern) return [];
    const gospel = (ctx.assembled?.blocks || []).find(b => b.section === 'Matins Gospel' && b.label);
    if (!gospel) return [];
    if (pattern.test(gospel.label)) return [];
    // Festal-Sunday override: when a major feast (Sun after Theophany,
    // Sun of Zacchaeus, vigil-rank saint with their own Gospel that falls
    // on Sun) displaces the eothinon, the rendered Gospel matches none of
    // the 11 eothinon passages. That's a deliberate replacement, not a
    // cycle-drift bug. Only flag when the Gospel matches a DIFFERENT
    // eothinon (off-by-one in the cycle is the rule's real target).
    const matchesAnyEothinon = Object.values(EOTHINON_GOSPELS).some(p => p.test(gospel.label));
    if (!matchesAnyEothinon) return [];
    return [{
      message: `Matins Gospel label "${gospel.label}" doesn't match eothinon ${eoth} pattern (expected ${pattern})`,
      hint:    'Check variable-sources/eothinon.json and the Sunday Matins gospel wiring.',
    }];
  },
};
