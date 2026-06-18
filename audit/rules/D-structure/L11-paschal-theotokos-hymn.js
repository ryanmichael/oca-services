'use strict';

// During Pascha and Bright Week the Hymn to the Theotokos substitutes
// "The Angel cried…" (and the irmos "Shine, shine, O new Jerusalem…") for
// the standard "It is truly meet…". Regression check: a stray "It is truly
// meet" inside the paschal window means the substitution path didn't fire.

module.exports = {
  id:             'L11-paschal-theotokos-hymn',
  family:         'structure',
  severity:       'high',
  description:    'Hymn to the Theotokos substitutes "The Angel cried" / "Shine, shine" during Pascha + Bright Week.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    return ctx.isBrightWeek || ctx.daysSincePascha === 0;
  },
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Hymn to the Theotokos');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/angel cried|shine, shine/.test(joined)) return [];
    if (/it is truly meet/.test(joined)) {
      return [{
        message: 'Paschal window but Hymn to the Theotokos still renders "It is truly meet" — paschal substitution did not fire.',
        hint:    'Check getTheotokosHymnSubstitution / paschal-period overrides in calendar-rules.js.',
      }];
    }
    return [{
      message: 'Paschal window but Hymn to the Theotokos matches neither paschal substitution nor "It is truly meet" — unexpected content.',
    }];
  },
};
