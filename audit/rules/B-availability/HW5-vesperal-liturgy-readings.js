'use strict';

const READING_SECTIONS = [
  'First', 'Second', 'Third', 'Fourth', 'Fifth',
  'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
  'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth',
].map(n => `${n} Reading`);

module.exports = {
  id:             'HW5-vesperal-liturgy-15-readings',
  family:         'availability',
  severity:       'high',
  description:    'Vesperal Liturgy of St. Basil (Holy Saturday morning) must include all 15 Old Testament readings.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vesperal-liturgy',
  check: (ctx) => {
    const blocks  = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const present = new Set(blocks.map(b => b.section).filter(Boolean));
    const missing = READING_SECTIONS.filter(s => !present.has(s));
    if (!missing.length) return [];
    return [{
      message: `Vesperal Liturgy missing OT reading section(s): ${missing.join(', ')}`,
      hint:    'Check assembleVesperalLiturgy in assembler.js.',
    }];
  },
};
