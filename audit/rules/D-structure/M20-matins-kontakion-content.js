'use strict';

// The Kontakion section at Matins (between Ode 6 and Ode 7 of the canon)
// renders the day's principal kontakion. Stub guard: section present must
// have at least one substantive hymn block. Catches the case where a
// variant path returns the rubric/oikos frame only.

module.exports = {
  id:             'M20-matins-kontakion-content',
  family:         'structure',
  severity:       'high',
  description:    'Matins Kontakion section contains at least one substantive hymn block.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Kontakion');
    if (!blocks.length) return [];
    const hymns = blocks.filter(b => b.type === 'hymn' && (b.text || '').trim().length >= 30);
    if (hymns.length) return [];
    return [{
      message: 'Matins Kontakion section has no substantive hymn block (≥30 chars).',
      hint:    'Section frame rendered without the day\'s kontakion text — check the canon-kontakion builder.',
    }];
  },
};
