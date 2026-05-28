'use strict';

// Bridegroom Matins assembler uses "The Praises" for what other Matins paths
// call "Lauds" — accept either.
const REQUIRED = [
  'Six Psalms',
  'Troparion',
  'Canon',
  ['The Praises', 'Lauds'],
  'Great Doxology',
  'Dismissal',
];

module.exports = {
  id:             'HW1-bridegroom-matins-skeleton',
  family:         'availability',
  severity:       'high',
  description:    'Bridegroom Matins must include the required skeleton sections (Six Psalms, Troparion, Canon, Lauds, Dismissal).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'bridegroom-matins',
  check: (ctx) => {
    const blocks  = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const present = new Set(blocks.map(b => b.section).filter(Boolean));
    const missing = REQUIRED.filter(req => {
      const aliases = Array.isArray(req) ? req : [req];
      return !aliases.some(a => present.has(a));
    }).map(req => Array.isArray(req) ? req[0] : req);
    if (!missing.length) return [];
    return [{
      message: `Bridegroom Matins missing section(s): ${missing.join(', ')}`,
      hint:    'Check assembleBridegroomMatins in assembler.js.',
    }];
  },
};
