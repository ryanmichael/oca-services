'use strict';

// The Great Doxology ("Glory to God in the highest, and on earth peace,
// good will towards men…") is sung at the end of Matins on Sundays, festal
// days, and any service ranked "doxology" or higher. Weekday Daily Matins
// uses the "Small Doxology" (a different section) — the rule self-scopes
// via section presence.

module.exports = {
  id:             'M7-matins-great-doxology',
  family:         'structure',
  severity:       'high',
  description:    'Matins Great Doxology section contains "Glory to God in the highest, and on earth peace".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Great Doxology');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/glory to god in the highest[, ]+and on earth peace/.test(joined)) return [];
    return [{
      message: 'Matins Great Doxology section has no "Glory to God in the highest, and on earth peace" hymn body.',
      hint:    'Check the Great Doxology builder — section frame rendered without the canonical hymn.',
    }];
  },
};
