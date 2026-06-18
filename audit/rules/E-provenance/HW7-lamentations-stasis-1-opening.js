'use strict';

// Lamentations Stasis 1 (Tone 5, Plagal of First) opens with the canonical
// stanza "In a tomb they laid Thee, O Christ the Life." If that stanza is
// missing from the first hymn block of Stasis 1, the OCA source has drifted.
module.exports = {
  id:             'HW7-lamentations-stasis-1-opening',
  family:         'provenance',
  severity:       'high',
  description:    'Lamentations Stasis 1 opens with "In a tomb they laid Thee, O Christ the Life."',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'lamentations',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Stasis 1' && b.type === 'hymn');
    if (!blocks.length) return [];
    const first = (blocks[0].text || '').replace(/\s+/g, ' ');
    if (/in a tomb they laid thee/i.test(first)) return [];
    return [{
      message: 'Lamentations Stasis 1 first hymn is not the canonical "In a tomb they laid Thee" stanza.',
      hint:    'Check SVS Holy Week Vol. 3 Stasis 1 source; first hymn after the opening verse should be the canonical Tone 5 stanza.',
    }];
  },
};
