'use strict';

// Calibrated against the Slavonic Octoechos daily cycle. Each day requires at
// least one matching keyword across the Lord I Call stichera (case-insensitive
// substring). Today's weekday-off-by-one bug would have flagged here:
// liturgical Thursday rendered Cross content with zero "apostle"/"Nicholas".
const THEMES = {
  monday:    { keywords: ['compunction', 'repent', 'angel', 'bodiless'],   note: 'Compunction + Bodiless Powers' },
  tuesday:   { keywords: ['forerunner', 'baptist'],                        note: 'Forerunner' },
  wednesday: { keywords: ['cross', 'crucifi', 'theotokos'],                note: 'Cross + Theotokos' },
  thursday:  { keywords: ['apostle', 'disciple', 'preach', 'nicholas', 'hierarch'], note: 'Apostles + St. Nicholas' },
  friday:    { keywords: ['cross', 'crucifi'],                             note: 'Cross + Theotokos' },
};

module.exports = {
  id:             'F-weekday-vespers-theme',
  family:         'theme',
  severity:       'medium',
  description:    'Weekday Vespers Lord I Call stichera should contain at least one keyword from the day\'s liturgical theme.',
  needsAssembled: true,
  // Restricted to ordinary time: Triodion/Pentecostarion/Holy Week stichera
  // replace weekday Octoechos content and have their own (non-weekday) themes.
  appliesTo: (ctx) =>
    ctx.service === 'vespers' &&
    ctx.season === 'ordinaryTime' &&
    THEMES[ctx.dow] !== undefined,
  check: (ctx) => {
    const theme = THEMES[ctx.dow];
    const blocks = ctx.assembled?.blocks || [];
    const lic = blocks.filter(b => /^Lord, I/.test(b.section || '') && b.type === 'hymn');
    if (!lic.length) return [];
    // Menaion stichera displace the back half of weekday Octoechos hymns —
    // the theme-bearing ones (Forerunner / Apostles / etc.) often live there.
    // When Menaion has injected stichera, skip the theme check rather than
    // flag a false positive.
    if (lic.some(b => b.source === 'menaion')) return [];
    const text = lic.map(b => (b.text || '').toLowerCase()).join(' ');
    const hits = theme.keywords.filter(kw => text.includes(kw));
    if (hits.length > 0) return [];
    return [{
      message: `${ctx.dow} Vespers LIC contains none of ${JSON.stringify(theme.keywords)} — expected theme: ${theme.note}`,
      hint:    'Octoechos weekday lookup may be misaligned; see VESPERS_SUNG_EVE in calendar-rules.js.',
    }];
  },
};
