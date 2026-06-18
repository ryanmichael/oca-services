'use strict';

// "Let my prayer arise in Thy sight as incense, and let the lifting up of
// my hands be an evening sacrifice" (Ps 140:2) is the signature antiphonal
// hymn of the Presanctified Liturgy, sung as a procession with incense
// during the OT readings. Universal across every Presanctified service.

module.exports = {
  id:             'P2-presanctified-let-my-prayer-arise',
  family:         'structure',
  severity:       'high',
  description:    'Presanctified "Let My Prayer Arise" section contains "Let my prayer arise in Thy sight as incense".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'presanctified',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Let My Prayer Arise');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/let my prayer arise in thy sight as incense/.test(joined)) return [];
    return [{
      message: 'Presanctified "Let My Prayer Arise" section has no canonical hymn body.',
      hint:    'Check the Presanctified builder — section frame rendered without Psalm 140:2.',
    }];
  },
};
