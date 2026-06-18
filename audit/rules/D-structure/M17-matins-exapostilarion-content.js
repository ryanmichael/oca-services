'use strict';

// The Exapostilarion (Sunday: the 11 paschal eothina; festal: feast-specific
// hymn) is sung at Matins after the Canon. Content varies by day; this rule
// is a stub guard ensuring the section has at least one substantive hymn
// block. Section self-scopes via presence — not all Matins types render it.

module.exports = {
  id:             'M17-matins-exapostilarion-content',
  family:         'structure',
  severity:       'high',
  description:    'Matins Exapostilarion section contains at least one substantive hymn block.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Exapostilarion');
    if (!blocks.length) return [];
    const hymns = blocks.filter(b => b.type === 'hymn' && (b.text || '').trim().length >= 30);
    if (hymns.length) return [];
    return [{
      message: 'Matins Exapostilarion section has no substantive hymn block (≥30 chars).',
      hint:    'Section frame rendered without exapostilarion content — check the post-Canon builder.',
    }];
  },
};
