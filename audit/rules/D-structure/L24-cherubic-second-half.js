'use strict';

// L7 verifies the Cherubic Hymn is *split* around the Great Entrance, but
// not that the second half has its canonical text. The first half is "We,
// who mystically represent the Cherubim…"; the second half (sung after the
// Entrance, "more quickly, with strength") is "That we may receive the King
// of all, Who cometh invisibly upborne by the angelic hosts." A regression
// that duplicates the first half on both sides — or drops the second half
// body keeping only the rubric — would survive L7 but fail this rule.
//
// Excluded: Holy Thursday + Holy Saturday vesperal Liturgies, which
// substitute the Cherubic entirely (Mystical Supper / Let All Mortal Flesh).

module.exports = {
  id:             'L24-cherubic-second-half',
  family:         'structure',
  severity:       'high',
  description:    'Cherubic Hymn blocks after the Great Entrance contain "That we may receive the King of all".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const geIdx = blocks.findIndex(b => b.section === 'Great Entrance');
    if (geIdx === -1) return [];

    // If no Cherubic Hymn blocks at all, this is L5/L7 territory — quiet exit.
    const cherubAfter = blocks
      .slice(geIdx + 1)
      .filter(b => b.section === 'Cherubic Hymn');
    if (!cherubAfter.length) return [];

    const joined = cherubAfter.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/receive the king of all/.test(joined)) return [];
    return [{
      message: 'Cherubic Hymn blocks after Great Entrance have no "That we may receive the King of all" text.',
      hint:    'Second-half hymn body may be dropped or the first-half hymn duplicated. Check cherubic-hymn variant for this date.',
    }];
  },
};
