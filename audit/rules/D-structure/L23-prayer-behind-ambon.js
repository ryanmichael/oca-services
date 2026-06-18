'use strict';

// "Prayer behind the Ambon" is the priest's final blessing prayer, "O Lord,
// Who blessest those who bless Thee, and sanctifiest those who put their
// trust in Thee…". A regression that drops the prayer text leaves only the
// section header — a silent loss in the rubric.

module.exports = {
  id:             'L23-prayer-behind-ambon',
  family:         'structure',
  severity:       'high',
  description:    'Prayer behind the Ambon contains "O Lord, Who blessest those who bless Thee".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Prayer behind the Ambon');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/blessest those who bless thee/.test(joined)) return [];
    return [{
      message: 'Prayer behind the Ambon section has no "O Lord, Who blessest those who bless Thee" prayer text.',
      hint:    'Section frame rendered without the canonical prayer body — check the post-Communion builder for this date.',
    }];
  },
};
