'use strict';

// The Communion Prayer section contains the communicant's prayer "I believe,
// O Lord, and I confess that Thou art truly the Christ, the Son of the
// Living God, Who camest into the world to save sinners, of whom I am
// first…". L5 guarantees the section is present; this rule guarantees the
// confession body is present (variant paths reshape the order via
// `confessFirst` but never drop the prayer body).
//
// Paschal period: in Bright Week and pentecostarion the call/response
// before this prayer is suppressed, but the confession itself still renders.

module.exports = {
  id:             'L27-communion-prayer-confess',
  family:         'structure',
  severity:       'high',
  description:    'Communion Prayer contains "I believe, O Lord, and I confess".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Communion Prayer');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/i believe[, ]+o lord[, ]+and i confess/.test(joined)) return [];
    return [{
      message: 'Communion Prayer section has no "I believe, O Lord, and I confess" prayer body.',
      hint:    'Check the Communion Prayer builder for this date — variant path may have dropped the confession.',
    }];
  },
};
