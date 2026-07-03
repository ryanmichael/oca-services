'use strict';

// Sunday Kontakia, post-2026-06-14 restructure (see features/sunday-kontakia-
// restructure.md): the section closes with a "Kontakion-Theotokion" rubric
// followed by the Theotokion hymn ("Protection of Christians that cannot be
// put to shame…" by default). A regression that drops the Theotokion or
// reverts to the old "saint kontakion last" shape would silently shorten the
// rubric — this rule catches both.
//
// Excluded: Pascha + Bright Week (paschal kontakion-only shape) and the few
// Lord's-feast Sundays that displace the Sunday template entirely (Palm
// Sunday, Pentecost — same list as L8). Also excluded: Lenten commemoration
// Sundays (weeks 1-5 of Great Lent), where OCA typikon combines the "Glory /
// Now and ever" connectors onto a single kontakion (Cross, Palamas, Climacus,
// Mary of Egypt, Orthodoxy) and does NOT append a separate Theotokion-
// Kontakion. See features/sunday-kontakia-restructure.md.

const { getWeekOfLent } = require('../../../calendar-rules');

module.exports = {
  id:             'L10-sunday-kontakion-theotokion',
  family:         'structure',
  severity:       'high',
  description:    'Sunday Kontakia closes with a Kontakion-Theotokion rubric + hymn.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (ctx.dow !== 'sunday') return false;
    if (ctx.isBrightWeek) return false;
    if (ctx.isPentecostarion) return false;          // paschal-cycle kontakia template differs
    if (ctx.daysSincePascha === 0)  return false;   // Pascha
    if (ctx.daysSincePascha === -7) return false;   // Palm
    if (ctx.daysSincePascha === 49) return false;   // Pentecost
    const week = getWeekOfLent(ctx.d);
    if (week === 1 || week === 2 || week === 3 || week === 4 || week === 5) return false;
    return true;
  },
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Kontakia');
    if (!blocks.length) return [];
    const hasRubric = blocks.some(b =>
      b.type === 'rubric' && /kontakion-theotokion/i.test(b.text || '')
    );
    if (hasRubric) return [];
    return [{
      message: 'Sunday Kontakia has no Kontakion-Theotokion rubric — section closes without the Theotokion.',
      hint:    'See features/sunday-kontakia-restructure.md. Default Theotokion is "Protection of Christians" at Tone 6.',
    }];
  },
};
