'use strict';

// From Pascha through Apodosis of Pascha (daysSincePascha 0..38) the Entrance
// Hymn substitutes the paschal verse "In the gathering places bless ye God
// the Lord, from the wellsprings of Israel…" for the standard "Come, let us
// worship…". After Apodosis the entrance reverts to the Ascension feast form
// during Ascension's afterfeast (P+39..P+47) and to the Pentecost feast form
// during Pentecost's afterfeast (P+49..P+56) — those windows are not scoped
// by this rule; the festal Entrance Hymn comes from each feast's own
// entranceHymn field, not from paschal substitution.

module.exports = {
  id:             'L12-paschal-entrance-hymn',
  family:         'structure',
  severity:       'high',
  description:    'Entrance Hymn substitutes paschal "In the gathering places…" from Pascha through Apodosis of Pascha (P 0..38).',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    return ctx.daysSincePascha >= 0 && ctx.daysSincePascha <= 38;
  },
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Entrance Hymn');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/gathering places|wellsprings of israel/.test(joined)) return [];
    if (/come, let us worship/.test(joined)) {
      return [{
        message: 'Paschal period but Entrance Hymn renders standard "Come, let us worship…" — paschal entrance substitution did not fire.',
        hint:    'OCA Liturgikon prints "In the gathering places bless ye God the Lord…" through Apodosis of Pascha.',
      }];
    }
    return [];
  },
};
