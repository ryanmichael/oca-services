'use strict';

// The Closing Doxology section renders the priest's "Glory to Thee, O Christ
// our God and our hope, glory to Thee" — the final exclamation immediately
// before the dismissal. A regression that drops this leaves the section
// header followed only by the "Glory…now and ever" response.

module.exports = {
  id:             'L34-closing-doxology',
  family:         'structure',
  severity:       'high',
  description:    'Closing Doxology contains "Glory to Thee, O Christ our God and our hope, glory to Thee".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Closing Doxology');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/glory to thee[, ]+o christ our god and our hope/.test(joined)) return [];
    return [{
      message: 'Closing Doxology has no "Glory to Thee, O Christ our God and our hope" priestly exclamation.',
      hint:    'Section frame rendered without the priestly close — check the doxology builder.',
    }];
  },
};
