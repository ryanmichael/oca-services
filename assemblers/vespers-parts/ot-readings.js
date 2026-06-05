'use strict';

const makeBlock = require('../_shared/make-block');

/**
 * Assembles prokeimena. Handles both single (non-Lenten) and double (Lenten with readings).
 */
function assembleOTReadings(readings) {
  const section = 'Old Testament Readings';
  const blocks = [];
  for (const r of readings) {
    blocks.push(makeBlock(`ot-${r.order}-wisdom`,  section, 'rubric',  'deacon', 'Wisdom!'));
    blocks.push(makeBlock(`ot-${r.order}-reader`,  section, 'rubric',  'reader', `The reading from ${r.book}.`));
    blocks.push(makeBlock(`ot-${r.order}-attend`,  section, 'rubric',  'deacon', 'Let us attend.'));
    blocks.push(makeBlock(`ot-${r.order}-ref`,     section, 'rubric',  null,     `${r.book} ${r.pericope}`));
    if (r.text) {
      blocks.push(makeBlock(`ot-${r.order}-text`,  section, 'prayer',  'reader', r.text, { density: 'compact' }));
    } else {
      blocks.push(makeBlock(`ot-${r.order}-text`,  section, 'prayer',  'reader', `[${r.book} ${r.pericope}]`));
    }
  }
  return blocks;
}

module.exports = assembleOTReadings;
