'use strict';

// Holy Saturday Vesperal Liturgy reads fifteen Old Testament lessons during
// the Vespers portion — the great paschal vigil tradition. The lessons span
// salvation history (Creation, Crossing the Red Sea, Daniel and the three
// youths in the fiery furnace, Jonah, etc.). Each lesson is its own
// section: "First Reading" through "Fifteenth Reading". A regression
// dropping any one of them is invisible without a presence sweep.

const READINGS = [
  'First Reading', 'Second Reading', 'Third Reading', 'Fourth Reading',
  'Fifth Reading', 'Sixth Reading', 'Seventh Reading', 'Eighth Reading',
  'Ninth Reading', 'Tenth Reading', 'Eleventh Reading', 'Twelfth Reading',
  'Thirteenth Reading', 'Fourteenth Reading', 'Fifteenth Reading',
];

module.exports = {
  id:             'V3-vesperal-fifteen-readings',
  family:         'structure',
  severity:       'high',
  description:    'Vesperal Liturgy renders all fifteen Old Testament readings (First through Fifteenth).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vesperal-liturgy',
  check: (ctx) => {
    const sections = new Set((ctx.assembled?.blocks || []).map(b => b.section).filter(Boolean));
    if (!sections.has('First Reading')) return [];   // Service not assembled — quiet exit
    const missing = READINGS.filter(s => !sections.has(s));
    if (!missing.length) return [];
    return [{
      message: `Vesperal Liturgy missing OT reading section(s): ${missing.join(', ')}.`,
      hint:    'Check the Vesperal OT readings builder — all 15 lessons are appointed for Holy Saturday.',
    }];
  },
};
