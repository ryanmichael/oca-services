'use strict';

// Pre-Communion call-and-response: priest exclaims "The holy Things are for
// the holy!" and the choir responds "One is holy, one is Lord, Jesus
// Christ, to the glory of God the Father. Amen." This is the immediate
// rubric framing the showing of the chalice and a universal invariant
// across both Chrysostom and Basil rites.

module.exports = {
  id:             'L22-pre-communion-holy-things',
  family:         'structure',
  severity:       'high',
  description:    'Pre-Communion contains "The holy Things are for the holy" / "One is holy, one is Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Pre-Communion');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    const issues = [];
    if (!/holy things are for the holy/.test(joined)) {
      issues.push({ message: 'Pre-Communion missing priest\'s exclamation "The holy Things are for the holy".' });
    }
    if (!/one is holy[, ]+one is lord/.test(joined)) {
      issues.push({ message: 'Pre-Communion missing choir response "One is holy, one is Lord".' });
    }
    return issues;
  },
};
