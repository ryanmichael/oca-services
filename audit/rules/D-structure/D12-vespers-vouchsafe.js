'use strict';

// "Vouchsafe, O Lord, to keep us this night without sin…" — sung after the
// Gladsome Light and Evening Prokeimenon (or, at Sat Great Vespers, between
// the 2nd and 3rd kneeling at Pentecost; the section name is the same).
// A regression dropping the body leaves the section header with no text.

module.exports = {
  id:             'D12-vespers-vouchsafe',
  family:         'structure',
  severity:       'high',
  description:    'Vespers Vouchsafe, O Lord section contains "Vouchsafe, O Lord, to keep us this night without sin".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Vouchsafe, O Lord');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/vouchsafe[, ]+o lord[, ]+to keep us this night without sin/.test(joined)) return [];
    return [{
      message: 'Vespers Vouchsafe section has no "Vouchsafe, O Lord, to keep us this night without sin" prayer body.',
      hint:    'Check the Vouchsafe builder — section frame rendered without the canonical prayer.',
    }];
  },
};
