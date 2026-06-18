'use strict';

// On weekday Matins (Daily Matins without festal rank) the Great Doxology
// is replaced by the Small Doxology — same opening text ("Glory to God in
// the highest, and on earth peace…") but READ rather than sung, with a
// different framing rubric. The section name "Small Doxology" self-scopes
// the rule to weekday Matins; festal Matins renders "Great Doxology"
// instead (covered by M7).

module.exports = {
  id:             'M25-matins-small-doxology',
  family:         'structure',
  severity:       'high',
  description:    'Matins Small Doxology section contains "Glory to God in the highest, and on earth peace".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Small Doxology');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/glory to god in the highest[, ]+and on earth peace/.test(joined)) return [];
    return [{
      message: 'Matins Small Doxology section has no "Glory to God in the highest, and on earth peace" body.',
      hint:    'Check the weekday Matins doxology builder — section frame rendered without the canonical hymn.',
    }];
  },
};
