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
  const blocks = [];
  // Great Feasts of the Lord carry a proper entrance verse (eisodikon), intoned
  // by the priest before the entrance hymn.
  const verse = typeof entranceHymn === 'object' ? entranceHymn.verse : null;
  if (verse) blocks.push(makeBlock('entrance-verse', section, 'verse', 'priest', verse));
  blocks.push(makeBlock('entrance-hymn', section, 'hymn', 'choir', text));
  return blocks;
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

/**
 * A rite appended immediately after the Prayer behind the Ambon — currently
 * only Transfiguration's Blessing of Grapes and Fruit. The two priestly
 * prayers are carried as incipit + book citation, because the parish booklet
 * gives them that way; they are rendered as rubrics rather than reconstructed.
 * The rite flows into the usual "Blessed be the name of the Lord", which the
 * Liturgy already emits after this.
 */
function _litPostAmbonRite(rite, liturgyFixed) {
  if (!rite) return [];
  const section = rite.label || 'Post-Ambon Rite';
  const blocks = [];
  if (rite.rubric) blocks.push(makeBlock('par-rubric', section, 'rubric', null, rite.rubric));
  if (rite.troparion) {
    blocks.push(makeBlock('par-troparion', section, 'hymn', 'choir',
      rite.troparion.text, { tone: rite.troparion.tone }));
  }
  if (rite.troparion && rite.kontakion) {
    blocks.push(makeBlock('par-glory-now', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.'));
  }
  if (rite.kontakion) {
    blocks.push(makeBlock('par-kontakion', section, 'hymn', 'choir',
      rite.kontakion.text, { tone: rite.kontakion.tone }));
  }
  (rite.prayers || []).forEach((pr, i) => {
    blocks.push(makeBlock(`par-p${i}-bid`,   section, 'prayer',   'deacon', 'Let us pray to the Lord.'));
    blocks.push(makeBlock(`par-p${i}-resp`,  section, 'response', 'choir',  'Lord, have mercy.'));
    blocks.push(makeBlock(`par-p${i}-text`,  section, 'prayer',   'priest', pr.incipit));
    if (pr.citation) blocks.push(makeBlock(`par-p${i}-cite`, section, 'rubric', null, pr.citation));
    blocks.push(makeBlock(`par-p${i}-amen`,  section, 'response', 'choir',  'Amen.'));
  });
  if (rite.sprinklingRubric) {
    blocks.push(makeBlock('par-sprinkle-rubric', section, 'rubric', null, rite.sprinklingRubric));
  }
  if (rite.sprinkling) {
    blocks.push(makeBlock('par-sprinkle', section, 'prayer', 'priest', rite.sprinkling));
  }
  return blocks;
}

module.exports = {
  _litSmallEntrance,
  _litEntranceHymn, _litPostAmbonRite,
  _litTroparia,
  _litKontakia,
};
