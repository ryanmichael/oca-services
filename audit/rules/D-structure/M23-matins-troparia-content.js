'use strict';

// The Matins Troparia section (sung after the Great Doxology, or read after
// the Aposticha on weekday Matins) renders the day's troparion. Stub guard:
// section present must have at least one substantive hymn block.

module.exports = {
  id:             'M23-matins-troparia-content',
  family:         'structure',
  severity:       'high',
  description:    'Matins Troparia section contains at least one substantive hymn block.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Troparia');
    if (!blocks.length) return [];
    const hymns = blocks.filter(b => b.type === 'hymn' && (b.text || '').trim().length >= 30);
    if (hymns.length) return [];
    return [{
      message: 'Matins Troparia section has no substantive hymn block (≥30 chars).',
      hint:    'Section frame rendered without the day\'s troparion text — check the troparia builder.',
    }];
  },
};
