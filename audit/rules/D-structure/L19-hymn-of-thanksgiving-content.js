'use strict';

// The Hymn of Thanksgiving sung after Communion is "Let our mouths be filled
// with Thy praise, O Lord…". Paired with L16 (post-Communion "We have seen
// the true Light") to cover the three canonical post-Communion hymns. A
// regression that drops the hymn block would still render the framing
// prayer ("Always, now and ever…") but lose the thanksgiving response.

module.exports = {
  id:             'L19-hymn-of-thanksgiving-content',
  family:         'structure',
  severity:       'high',
  description:    'Hymn of Thanksgiving contains "Let our mouths be filled with Thy praise".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Hymn of Thanksgiving');
    if (!blocks.length) return [];   // L5 doesn't enforce this section; cheap exit
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/let our mouths be filled/.test(joined)) return [];
    return [{
      message: 'Hymn of Thanksgiving has no "Let our mouths be filled with Thy praise" hymn.',
      hint:    'Check post-Communion section builder — a variant path may have dropped the canonical thanksgiving hymn.',
    }];
  },
};
