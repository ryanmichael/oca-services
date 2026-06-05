'use strict';

const makeBlock          = require('../_shared/make-block');
const { resolveFixedRef } = require('../_shared/resolve');

function _litAugmentedLitany(f) {
  const section = 'Litany of Fervent Supplication';
  const lit = f['augmented-litany'];
  const blocks = [
    makeBlock('al-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('al-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-p${i}`, section, 'prayer', 'deacon', resolveFixedRef(p, f)));
    blocks.push(makeBlock(`al-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  lit.triplePetitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-tp${i}`, section, 'prayer',   'deacon', resolveFixedRef(p, f)));
    blocks.push(makeBlock(`al-tr${i}`, section, 'response', 'choir',  lit.tripleResponse));
  });
  blocks.push(
    makeBlock('al-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('al-amen',      section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

function _litDeparted(f) {
  const section = 'Litany for the Departed';
  const lit = f['litany-departed'];
  if (!lit) return [];
  const blocks = [
    makeBlock('dep-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('dep-response', section, 'response', 'choir',  lit.tripleResponse),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`dep-p${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`dep-r${i}`, section, 'response', 'choir',  lit.tripleResponse));
  });
  blocks.push(
    makeBlock('dep-ask',      section, 'prayer',   'deacon', lit.askPetition),
    makeBlock('dep-ask-resp', section, 'response', 'choir',  lit.askResponse),
    makeBlock('dep-call',     section, 'prayer',   'deacon', lit.deaconCall),
    makeBlock('dep-secret',   section, 'prayer',   'priest', lit.secretPrayer),
    makeBlock('dep-excl',     section, 'prayer',   'priest', lit.exclamation),
    makeBlock('dep-amen',     section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

function _litCatechumens(f) {
  const section = 'Litany for the Catechumens';
  const lit = f['litany-catechumens'];
  const blocks = [
    makeBlock('cat-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('cat-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`cat-p${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`cat-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  blocks.push(
    makeBlock('cat-petition2', section, 'prayer',   'deacon', lit.petition2),
    makeBlock('cat-bow',       section, 'prayer',   'deacon', lit.bowHeads),
    makeBlock('cat-bow-resp',  section, 'response', 'choir',  lit.bowHeadsResponse),
    makeBlock('cat-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('cat-amen',      section, 'response', 'choir',  lit.amen),
    makeBlock('cat-dismissal', section, 'prayer',   'deacon', lit.dismissal),
  );
  return blocks;
}

function _litLitaniesFaithful(f) {
  const section = 'Litanies of the Faithful';
  const l1 = f['litany-faithful-1'];
  const l2 = f['litany-faithful-2'];
  const blocks = [
    makeBlock('lf1-opening',    section, 'prayer',   'deacon', l1.opening),
    makeBlock('lf1-response',   section, 'response', 'choir',  l1.response),
    makeBlock('lf1-petition',   section, 'prayer',   'deacon', l1.petition),
    makeBlock('lf1-pet-resp',   section, 'response', 'choir',  l1.response),
    makeBlock('lf1-wisdom',     section, 'prayer',   'deacon', l1.wisdom),
    makeBlock('lf1-excl',       section, 'prayer',   'priest', l1.exclamation),
    makeBlock('lf1-amen',       section, 'response', 'choir',  l1.amen),
    makeBlock('lf2-opening',    section, 'prayer',   'deacon', l2.opening),
    makeBlock('lf2-response',   section, 'response', 'choir',  l2.response),
  ];
  (l2.petitions || []).forEach((p, i) => {
    blocks.push(makeBlock(`lf2-p${i}`,       section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`lf2-p${i}-resp`,  section, 'response', 'choir',  l2.response));
  });
  blocks.push(
    makeBlock('lf2-petition',   section, 'prayer',   'deacon', l2.petition),
    makeBlock('lf2-pet-resp',   section, 'response', 'choir',  l2.response),
    makeBlock('lf2-wisdom',     section, 'prayer',   'deacon', l2.wisdom),
    makeBlock('lf2-excl',       section, 'prayer',   'priest', l2.exclamation),
    makeBlock('lf2-amen',       section, 'response', 'choir',  l2.amen),
  );
  return blocks;
}

module.exports = {
  _litAugmentedLitany,
  _litDeparted,
  _litCatechumens,
  _litLitaniesFaithful,
};
