'use strict';

// Lamentations Stasis 2 (Tone 5) opens with the canonical stanza "It is right
// to magnify Thee, O Life-giving Lord." Drift here usually means the wrong
// stasis file is being injected.
module.exports = {
  id:             'HW8-lamentations-stasis-2-opening',
  family:         'provenance',
  severity:       'high',
  description:    'Lamentations Stasis 2 opens with "It is right to magnify Thee, O Life-giving Lord."',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'lamentations',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Stasis 2' && b.type === 'hymn');
    if (!blocks.length) return [];
    const first = (blocks[0].text || '').replace(/\s+/g, ' ');
    if (/it is right to magnify thee/i.test(first)) return [];
    return [{
      message: 'Lamentations Stasis 2 first hymn is not the canonical "It is right to magnify Thee" stanza.',
      hint:    'Check SVS Holy Week Vol. 3 Stasis 2 source.',
    }];
  },
};
