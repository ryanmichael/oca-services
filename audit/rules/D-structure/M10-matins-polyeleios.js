'use strict';

// The Polyeleios — selected verses of Psalm 134/135 — is sung at Matins
// on Sundays, polyeleos-rank saints, and Great Feasts, between the
// Kathismata and the Antiphons of Degrees. Opens "Praise ye the Name of
// the Lord; O ye servants, praise the Lord." Section self-scopes: only
// present on days where it's sung.

module.exports = {
  id:             'M10-matins-polyeleios',
  family:         'structure',
  severity:       'high',
  description:    'Matins Polyeleios section contains "Praise ye the Name of the Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Polyeleios');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/praise ye the name of the lord/.test(joined)) return [];
    return [{
      message: 'Matins Polyeleios section has no "Praise ye the Name of the Lord" verses.',
      hint:    'Check the Polyeleios builder — section frame rendered without the Psalm 134/135 verses.',
    }];
  },
};
