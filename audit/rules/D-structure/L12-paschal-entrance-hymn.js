'use strict';

// During Bright Week + pentecostarion season the Entrance Hymn substitutes
// the paschal verse "In the gathering places bless ye God the Lord, from the
// wellsprings of Israel…" for the standard "Come, let us worship…". The
// parish-override allowlist (LIT-entrance-hymn-paschal-period) suppresses
// this in parish view; the default (no-parish) endpoint should always render
// the paschal entrance in this window per OCA Liturgikon.

module.exports = {
  id:             'L12-paschal-entrance-hymn',
  family:         'structure',
  severity:       'high',
  description:    'Entrance Hymn substitutes paschal "In the gathering places…" during Bright Week + pentecostarion.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    return ctx.isBrightWeek || ctx.isPentecostarion;
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
