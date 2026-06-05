'use strict';

const makeBlock = require('../_shared/make-block');

function _litThanksgiving(isBasil, f) {
  const section = 'Litany of Thanksgiving';
  const lit = f['litany-thanksgiving'];
  const blocks = [
    makeBlock('lt-deacon',   section, 'prayer',   'deacon', lit.deacon),
    makeBlock('lt-response', section, 'response', 'choir',  lit.response),
    makeBlock('lt-petition', section, 'prayer',   'deacon', lit.petition),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`lt-p${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`lt-r${i}`, section, 'response', 'choir',  lit.petitionResponse));
  });
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
  const b = f['blessed-be-the-name'];
  return [
    makeBlock('bbn-text',     section, 'hymn',     'choir',  `${b.text} (×3)`),
    makeBlock('bbn-response', section, 'response', 'choir',  b.response),
    makeBlock('bbn-blessing', section, 'prayer',   'priest', b.finalBlessing),
    makeBlock('bbn-final',    section, 'response', 'choir',  b.finalResponse),
  ];
}

function _litClosingDoxology(isPaschalPeriod) {
  const section = 'Closing Doxology';
  const blocks = [
    makeBlock('cd-glory', section, 'prayer', 'priest',
      'Glory to Thee, O Christ our God and our hope, glory to Thee.'),
  ];
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
  const p = f['psalm-33'];
  return [
    makeBlock('ps33-rubric', section, 'rubric', null, p.rubric),
    makeBlock('ps33-text',   section, 'prayer', 'reader', p.text, { density: 'compact' }),
    makeBlock('ps33-glory',  section, 'doxology', null, p.glory),
  ];
}

module.exports = {
  _litThanksgiving,
  _litBlessedBeTheName,
  _litClosingDoxology,
  _litPsalm33,
};
