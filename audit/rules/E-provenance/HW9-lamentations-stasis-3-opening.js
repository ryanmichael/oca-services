'use strict';

// Lamentations Stasis 3 (Tone 3) opens with the canonical stanza "Every
// generation offers Thee its hymn of praise at Thy burial, O my Christ."
module.exports = {
  id:             'HW9-lamentations-stasis-3-opening',
  family:         'provenance',
  severity:       'high',
  description:    'Lamentations Stasis 3 opens with "Every generation offers Thee its hymn of praise at Thy burial."',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'lamentations',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Stasis 3' && b.type === 'hymn');
    if (!blocks.length) return [];
    const first = (blocks[0].text || '').replace(/\s+/g, ' ');
    if (/every generation offers thee/i.test(first)) return [];
    return [{
      message: 'Lamentations Stasis 3 first hymn is not the canonical "Every generation offers Thee" stanza.',
      hint:    'Check SVS Holy Week Vol. 3 Stasis 3 source.',
    }];
  },
};
