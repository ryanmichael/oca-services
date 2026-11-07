'use strict';

const makeBlock = require('../_shared/make-block');

// The lessons read at Great Vespers are Old Testament ones on almost every
// day that has them — but not on an Apostle's feast, where three readings
// from the Catholic Epistles are appointed instead. The OCA orders title the
// section by what is actually read, and do it consistently: of the 52 orders
// in reference/orders/ that print a readings block, the 48 with Old Testament
// lessons are headed "Old Testament Readings" and the 4 with epistles —
// 01-23, 10-18 (Luke), 11-16 (Matthew), 11-30 (Andrew) — are headed simply
// "Readings". Measured 2026-11-07; before that every date was headed "Old
// Testament Readings", so authoring an Apostle's feast would have printed
// "Old Testament Readings / The reading from 1 Peter."
const NT_BOOKS = new Set([
  'matthew', 'mark', 'luke', 'john', 'acts', 'romans',
  '1corinthians', '2corinthians', 'galatians', 'ephesians', 'philippians',
  'colossians', '1thessalonians', '2thessalonians', '1timothy', '2timothy',
  'titus', 'philemon', 'hebrews', 'james', '1peter', '2peter',
  '1john', '2john', '3john', 'jude', 'revelation', 'apocalypse',
]);

function isNewTestament(book) {
  const k = String(book || '')
    .toLowerCase()
    .replace(/\bfirst\b/g, '1').replace(/\bsecond\b/g, '2').replace(/\bthird\b/g, '3')
    .replace(/\biii\b/g, '3').replace(/\bii\b/g, '2').replace(/\bi\b/g, '1')
    .replace(/[^a-z0-9]/g, '');
  return NT_BOOKS.has(k);
}

/**
 * Assembles the Old Testament (or, on an Apostle's feast, epistle) lessons
 * read at Great Vespers after the prokeimenon.
 */
function assembleOTReadings(readings) {
  // Mixed sets exist — 07-26 appoints Wisdom of Solomon plus two from 1 John —
  // and the OCA order heads that one "Old Testament Readings". So the plain
  // heading is used only when NOTHING in the set is from the Old Testament.
  const section = (readings || []).length && readings.every(r => isNewTestament(r.book))
    ? 'Readings'
    : 'Old Testament Readings';
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
module.exports.isNewTestament = isNewTestament;
