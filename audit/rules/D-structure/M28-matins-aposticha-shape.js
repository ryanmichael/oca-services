'use strict';

// Matins Aposticha (sung at weekday Matins after the Small Doxology) is a
// set of alternating hymn + verse blocks — typically 3 hymns interspersed
// with 2 psalm verses. A regression that collapses the Aposticha to a
// single hymn block is invisible without a shape check. Section
// self-scopes via presence — festal Matins replaces Aposticha with Lauds
// stichera, so the section is only present on weekday-shape Matins.

const MIN_APOSTICHA_HYMNS = 2;

module.exports = {
  id:             'M28-matins-aposticha-shape',
  family:         'structure',
  severity:       'high',
  description:    `Matins Aposticha section has at least ${MIN_APOSTICHA_HYMNS} hymn blocks.`,
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Aposticha');
    if (!blocks.length) return [];
    const hymns = blocks.filter(b => b.type === 'hymn');
    if (hymns.length >= MIN_APOSTICHA_HYMNS) return [];
    return [{
      message: `Matins Aposticha has ${hymns.length} hymn block(s); expected ≥${MIN_APOSTICHA_HYMNS}.`,
      hint:    'Check the weekday Matins Aposticha builder — the stichera blend may have collapsed.',
    }];
  },
};
