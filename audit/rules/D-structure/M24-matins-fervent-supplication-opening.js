'use strict';

// Matins Litany of Fervent Supplication opens with the deacon's "Let us say
// with all our soul and with all our mind, let us say". Universal opening
// across Matins and Liturgy. Section self-scopes via presence — shortened
// weekday Matins variants may omit the litany.

module.exports = {
  id:             'M24-matins-fervent-supplication-opening',
  family:         'structure',
  severity:       'high',
  description:    'Matins Litany of Fervent Supplication opens with "Let us say with all our soul".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Litany of Fervent Supplication');
    if (!blocks.length) return [];
    const first = blocks.find(b => b.type === 'prayer');
    if (!first) return [];
    if (/let us say with all our soul/i.test(first.text || '')) return [];
    return [{
      message: `Matins Fervent Supplication opens with "${(first.text || '').slice(0, 80)}" — expected "Let us say with all our soul".`,
      hint:    'First petition is wrong — check the fervent litany builder for Matins.',
    }];
  },
};
