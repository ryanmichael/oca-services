'use strict';

const makeBlock = require('../_shared/make-block');
const mustGet   = require('../_shared/must-get');

function _litThanksgiving(isBasil, f) {
  const section = 'Litany of Thanksgiving';
  const lit = mustGet(f, 'litany-thanksgiving', { scope: section });
  if (!lit) return [];
  // The post-Communion Litany of Thanksgiving is the SHORT litany (3 deacon
  // petitions): thanksgiving-for-partaking → "Help us, save us" → the "whole
  // day perfect…" commit. It does NOT carry the supplicatory "Grant this, O
  // Lord" petitions (angel of peace, pardon, Christian ending, etc.) — those
  // belong to the Litany of Completion at Vespers/Matins. Guarded by L37.
  const blocks = [
    makeBlock('lt-deacon',     section, 'prayer',   'deacon', lit.deacon),
    makeBlock('lt-response',   section, 'response', 'choir',  lit.response),
    makeBlock('lt-petition',   section, 'prayer',   'deacon', lit.petition),
    makeBlock('lt-petition-r', section, 'response', 'choir',  lit.response),
  ];
  blocks.push(makeBlock('lt-prayer', section, 'prayer', 'priest',
    isBasil ? lit['prayer-basil'] : lit['prayer-chrysostom'],
    { density: 'compact' }));
  blocks.push(
    makeBlock('lt-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('lt-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('lt-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('lt-amen',      section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

function _litBlessedBeTheName(f) {
  const section = 'Blessed be the Name';
  const b = mustGet(f, 'blessed-be-the-name', { scope: section });
  if (!b) return [];
  // OCA order: only "Blessed be the name of the Lord" (×3) here; Psalm 33
  // follows, and the priestly blessing ("The blessing of the Lord be upon
  // you…") is emitted afterward by _litClosingDoxology.
  return [
    makeBlock('bbn-text',     section, 'hymn',     'choir',  `${b.text} (×3)`),
    makeBlock('bbn-response', section, 'response', 'choir',  b.response),
  ];
}

function _litClosingDoxology(isPaschalPeriod, f) {
  const section = 'Closing Doxology';
  const blocks = [];
  // Priestly blessing "The blessing of the Lord be upon you…" comes here —
  // after Psalm 33, before "Glory to Thee, O Christ…" (OCA order).
  const b = f && mustGet(f, 'blessed-be-the-name', { scope: section });
  if (b) {
    blocks.push(makeBlock('cd-blessing', section, 'prayer',   'priest', b.finalBlessing));
    blocks.push(makeBlock('cd-blessing-r', section, 'response', 'choir',  b.finalResponse));
  }
  blocks.push(
    makeBlock('cd-glory', section, 'prayer', 'priest',
      'Glory to Thee, O Christ our God and our hope, glory to Thee.'),
  );
  if (isPaschalPeriod) {
    blocks.push(makeBlock('cd-paschal', section, 'hymn', 'choir',
      'Christ is risen from the dead, trampling down death by death, and upon those in the tombs bestowing life! (thrice)'));
    blocks.push(makeBlock('cd-paschal-end', section, 'prayer', 'priest',
      'And unto us He has given eternal life. Let us worship His Resurrection on the third day!'));
  } else {
    blocks.push(makeBlock('cd-glory-r', section, 'response', 'choir',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen. Lord, have mercy. Lord, have mercy. Lord, have mercy. Father, bless.'));
  }
  return blocks;
}

function _litPsalm33(f) {
  const section = 'Psalm 33';
  const p = mustGet(f, 'psalm-33', { scope: section });
  if (!p) return [];
  // Full Psalm 33, one verse per line (each its own block, no per-verse speaker
  // label) so any parish can use as many verses as its antidoron distribution
  // needs — one static version, no per-parish logic. `shortFormAfter` marks the
  // traditional short-form endpoint with a rubric divider. No concluding
  // "Glory… now and ever…": Psalm 33 flows straight into the priestly blessing
  // ("The blessing of the Lord be upon you…"). Guarded by L38.
  const verses = Array.isArray(p.verses) ? p.verses : (p.text ? [p.text] : []);
  const cutoff = p.shortFormAfter || 0;
  const blocks = [makeBlock('ps33-rubric', section, 'rubric', null, p.rubric)];
  verses.forEach((v, i) => {
    blocks.push(makeBlock(`ps33-v${i + 1}`, section, 'prayer', null, v, { density: 'compact' }));
    if (cutoff && i + 1 === cutoff) {
      blocks.push(makeBlock('ps33-shortform', section, 'rubric', null,
        'The psalm may conclude here.'));
    }
  });
  return blocks;
}

module.exports = {
  _litThanksgiving,
  _litBlessedBeTheName,
  _litClosingDoxology,
  _litPsalm33,
};
