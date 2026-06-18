'use strict';

// At Holy Saturday Vesperal Liturgy the Alleluia between Epistle and Gospel
// is replaced with "Arise, O God, judge the earth, for to Thee belong all
// the nations!" (Psalm 81/82:8) — the proclamation that anticipates the
// Resurrection. Section self-scopes via presence.

module.exports = {
  id:             'V4-vesperal-arise-o-god',
  family:         'structure',
  severity:       'high',
  description:    'Vesperal Liturgy "Arise, O God" section contains "Arise, O God, judge the earth".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vesperal-liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Arise, O God');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/arise[, ]+o god[, ]+judge the earth/.test(joined)) return [];
    return [{
      message: 'Vesperal Liturgy "Arise, O God" section has no canonical hymn body.',
      hint:    'Check the Holy Saturday post-Epistle builder — Alleluia substitution may have collapsed.',
    }];
  },
};
