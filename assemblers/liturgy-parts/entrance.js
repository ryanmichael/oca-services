'use strict';

const makeBlock = require('../_shared/make-block');
const mustGet   = require('../_shared/must-get');

function _litSmallEntrance(f) {
  const section = 'Little Entrance';
  const e = mustGet(f, 'small-entrance', { scope: section });
  if (!e) return [];
  return [
    makeBlock('se-rubric', section, 'rubric', null,
      'The clergy make the Little Entrance with the Gospel Book.'),
    makeBlock('se-deacon', section, 'prayer', 'deacon', e.deacon),
  ];
}

function _litEntranceHymn(entranceHymn) {
  const section = 'Entrance Hymn';
  const text = (typeof entranceHymn === 'object' ? entranceHymn.text : null) ||
    'Come, let us worship and fall down before Christ. O Son of God, Who art risen from the dead, save us who sing to Thee: Alleluia!';
  return [makeBlock('entrance-hymn', section, 'hymn', 'choir', text)];
}

function _litTroparia(tropariaSpec) {
  const section = 'Troparia';
  const blocks  = [];
  if (!tropariaSpec || !tropariaSpec.length) return blocks;
  tropariaSpec.forEach((t, i) => {
    if (t.rubric) blocks.push(makeBlock(`trop-rubric-${i}`, section, 'rubric', null, t.rubric));
    blocks.push(makeBlock(`trop-${i}`, section, 'hymn', 'choir', t.text,
      { tone: t.tone }));
  });
  return blocks;
}

function _litKontakia(kontakiaSpec) {
  const section = 'Kontakia';
  const blocks  = [];
  if (!kontakiaSpec || !kontakiaSpec.length) return blocks;
  kontakiaSpec.forEach((k, i) => {
    if (k.connector) {
      blocks.push(makeBlock(`kont-conn-${i}`, section, 'doxology', null, k.connector));
    }
    if (k.rubric)    blocks.push(makeBlock(`kont-rubric-${i}`, section, 'rubric', null, k.rubric));
    blocks.push(makeBlock(`kont-${i}`, section, 'hymn', 'choir', k.text,
      { tone: k.tone }));
  });
  return blocks;
}

module.exports = {
  _litSmallEntrance,
  _litEntranceHymn,
  _litTroparia,
  _litKontakia,
};
