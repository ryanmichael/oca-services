'use strict';

// Holy Monday/Tuesday/Wednesday Bridegroom Matins all use the troparion
// "Behold, the Bridegroom comes at midnight…". Counterpart to HW2: that rule
// catches Thursday wrongly retaining the Bridegroom text; this rule catches
// Mon/Tue/Wed losing it.
module.exports = {
  id:             'HW6-bridegroom-mtw-troparion',
  family:         'provenance',
  severity:       'high',
  description:    'Holy Mon/Tue/Wed Bridegroom Matins troparion is "Behold, the Bridegroom comes at midnight".',
  needsAssembled: true,
  appliesTo: (ctx) =>
    ctx.service === 'bridegroom-matins' &&
    (ctx.dow === 'monday' || ctx.dow === 'tuesday' || ctx.dow === 'wednesday'),
  check: (ctx) => {
    const trop = (ctx.assembled?.blocks || []).find(b => b.section === 'Troparion' && b.type !== 'rubric');
    if (!trop) return [];
    if (/Behold,? the Bridegroom/i.test((trop.text || '').replace(/\s+/g, ' '))) return [];
    return [{
      message: `Holy ${ctx.dow.charAt(0).toUpperCase()+ctx.dow.slice(1)} Bridegroom Matins troparion does not contain "Behold, the Bridegroom" — has it been replaced by the Thursday text or another override?`,
      hint:    'Check the troparion source for Bridegroom Mon/Tue/Wed in assembleBridegroomMatins.',
    }];
  },
};
