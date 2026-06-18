'use strict';

// Verifies the Nicene-Constantinopolitan Creed opens with "I believe in one
// God, the Father Almighty, Maker of heaven and earth…". L5 guarantees the
// section is present; this rule guarantees the *content* is the Creed and
// not some accidental substitution. The OCA archaic-English overlay still
// produces the same opening phrase, so this regex matches base + overlay.

module.exports = {
  id:             'L25-creed-opening',
  family:         'structure',
  severity:       'high',
  description:    'The Creed section opens with "I believe in one God, the Father Almighty".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'The Creed');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/i believe in one god[, ]+the father almighty/.test(joined)) return [];
    return [{
      message: 'The Creed section has no "I believe in one God, the Father Almighty" text.',
      hint:    'Check the Creed builder for this date — overlay path may have replaced the body without retaining the canonical opening.',
    }];
  },
};
