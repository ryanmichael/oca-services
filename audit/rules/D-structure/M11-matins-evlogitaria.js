'use strict';

// The Resurrection Evlogitaria — five troparia each preceded by the refrain
// "Blessed art Thou, O Lord, teach me Thy statutes" (Psalm 118:12) — are
// sung at Matins on Sundays (except Lord's-feast Sundays that displace
// them) and at Matins for the departed. Section self-scopes via presence.

module.exports = {
  id:             'M11-matins-evlogitaria',
  family:         'structure',
  severity:       'high',
  description:    'Matins Evlogitaria section contains "Blessed art Thou, O Lord, teach me Thy statutes".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Evlogitaria');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/blessed art thou[, ]+o lord[, ]+teach me thy statutes/.test(joined)) return [];
    return [{
      message: 'Matins Evlogitaria section has no "Blessed art Thou, O Lord, teach me Thy statutes" refrain.',
      hint:    'Check the Evlogitaria builder — section frame rendered without the canonical Psalm 118:12 refrain.',
    }];
  },
};
