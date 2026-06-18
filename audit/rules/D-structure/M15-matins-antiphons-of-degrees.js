'use strict';

// The Antiphons of Degrees (Anabathmoi) are sung at Sunday + festal Matins
// between the Polyeleos / Evlogitaria and the Matins Prokeimenon. They are
// tone-specific (8 sets, one per Octoechos tone) and content varies, so
// this rule is a stub guard: section present must have at least one
// substantive hymn block.

module.exports = {
  id:             'M15-matins-antiphons-of-degrees',
  family:         'structure',
  severity:       'high',
  description:    'Matins Antiphons of Degrees section contains at least one substantive hymn block.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Antiphons of Degrees');
    if (!blocks.length) return [];
    const hymns = blocks.filter(b => b.type === 'hymn' && (b.text || '').trim().length >= 30);
    if (hymns.length) return [];
    return [{
      message: 'Matins Antiphons of Degrees section has no substantive hymn block (≥30 chars).',
      hint:    'Section frame rendered without antiphon content — check the Anabathmoi builder for this tone.',
    }];
  },
};
