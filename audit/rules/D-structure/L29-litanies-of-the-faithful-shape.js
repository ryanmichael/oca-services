'use strict';

// "Litanies of the Faithful" is the section between the Catechumens' dismissal
// and the Cherubic Hymn — it bundles the First and Second Litanies of the
// Faithful into a single section. A healthy render shows ~22 alternating
// prayer + response blocks across both litanies; collapsing or dropping one
// litany leaves a noticeably-thinner section that still renders the header.
// The lower bound below is conservative against the single-litany failure
// mode (around 10 blocks would indicate one litany dropped).

const MIN_BLOCKS = 14;

module.exports = {
  id:             'L29-litanies-of-the-faithful-shape',
  family:         'structure',
  severity:       'high',
  description:    `Litanies of the Faithful section has at least ${MIN_BLOCKS} blocks (both litanies present).`,
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Litanies of the Faithful');
    if (!blocks.length) return [];
    if (blocks.length >= MIN_BLOCKS) return [];
    return [{
      message: `Litanies of the Faithful has ${blocks.length} block(s); expected ≥${MIN_BLOCKS} (First + Second litanies).`,
      hint:    'One litany may have been dropped or collapsed — check the litanies builder for this date.',
    }];
  },
};
