'use strict';

// "Having beheld the Resurrection of Christ, let us worship the holy Lord
// Jesus, the only sinless One…" — sung at Sunday Matins after the
// reading of the Matins Gospel. A Sunday-only invariant; weekday Matins
// has no Matins Gospel and no "Having Beheld" hymn, so section presence
// self-scopes the rule.

module.exports = {
  id:             'M13-matins-having-beheld',
  family:         'structure',
  severity:       'high',
  description:    'Matins "Having Beheld the Resurrection" section contains "Having beheld the Resurrection of Christ".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Having Beheld the Resurrection');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/having beheld the resurrection of christ/.test(joined)) return [];
    return [{
      message: 'Matins "Having Beheld the Resurrection" section has no canonical hymn text.',
      hint:    'Check the post-Gospel Sunday Matins builder — section frame rendered without the hymn body.',
    }];
  },
};
