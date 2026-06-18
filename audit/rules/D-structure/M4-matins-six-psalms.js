'use strict';

// The Six Psalms (Hexapsalmos) of Matins opens with the angelic hymn
// "Glory to God in the highest and on earth peace, good will towards men"
// sung thrice, followed by "O Lord, open my lips" twice — the framing
// rubric before the six psalms themselves are read.

module.exports = {
  id:             'M4-matins-six-psalms',
  family:         'structure',
  severity:       'high',
  description:    'Matins Six Psalms section contains "Glory to God in the highest and on earth peace".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Six Psalms');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/glory to god in the highest and on earth peace/.test(joined)) return [];
    return [{
      message: 'Matins Six Psalms section has no "Glory to God in the highest and on earth peace" opening hymn.',
      hint:    'Check the Hexapsalmos builder — section frame rendered without the canonical opening.',
    }];
  },
};
