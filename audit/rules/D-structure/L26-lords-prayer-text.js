'use strict';

// The Lord's Prayer section must contain the Our Father itself — "Our Father,
// who art in heaven, hallowed be Thy Name…". L5 guarantees the section
// header renders; this rule catches the case where the priest's prefatory
// "And make us worthy, O Master…" prayer is present but the Our Father body
// is missing.

module.exports = {
  id:             'L26-lords-prayer-text',
  family:         'structure',
  severity:       'high',
  description:    "The Lord's Prayer section contains \"Our Father, who art in heaven\".",
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === "The Lord's Prayer");
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/our father[, ]+who art in heaven/.test(joined)) return [];
    return [{
      message: "The Lord's Prayer section has no \"Our Father, who art in heaven\" body.",
      hint:    'Section frame rendered without the Our Father itself — check the Lord\'s Prayer builder.',
    }];
  },
};
