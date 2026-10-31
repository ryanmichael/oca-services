'use strict';

const makeBlock          = require('../_shared/make-block');
const { resolveFixedRef } = require('../_shared/resolve');
const mustGet             = require('../_shared/must-get');

/**
 * Density tiers, matching assemblers/vespers-parts/litanies.js. SAID is the
 * deacon's petitions and the priest's exclamations — followed by the pew, not
 * spoken by it. CUE is the short invariant answer ("Lord, have mercy."), which
 * a reader locates rather than reads. Both files must agree, or a parish that
 * prints a Vespers booklet and a Liturgy booklet gets two different treatments
 * of the same two words.
 */
const SAID = { density: 'compact' };
const CUE  = { density: 'cue' };

function _litAugmentedLitany(f) {
  const section = 'Litany of Fervent Supplication';
  const lit = mustGet(f, 'augmented-litany', { scope: section });
  if (!lit) return [];
  const blocks = [
    makeBlock('al-opening',  section, 'prayer',   'deacon', lit.opening, SAID),
    makeBlock('al-response', section, 'response', 'choir',  lit.response, CUE),
  ];
  (lit.petitions || []).forEach((p, i) => {
    blocks.push(makeBlock(`al-p${i}`, section, 'prayer', 'deacon', resolveFixedRef(p, f), SAID));
    blocks.push(makeBlock(`al-p${i}-resp`, section, 'response', 'choir', lit.response, CUE));
  });
  (lit.triplePetitions || []).forEach((p, i) => {
    blocks.push(makeBlock(`al-tp${i}`, section, 'prayer',   'deacon', resolveFixedRef(p, f), SAID));
    blocks.push(makeBlock(`al-tr${i}`, section, 'response', 'choir',  lit.tripleResponse, CUE));
  });
  blocks.push(
    makeBlock('al-excl',      section, 'prayer',   'priest', lit.exclamation, SAID),
    makeBlock('al-amen',      section, 'response', 'choir',  lit.amen, CUE),
  );
  return blocks;
}

function _litDeparted(f) {
  const section = 'Litany for the Departed';
  const lit = mustGet(f, 'litany-departed', { scope: section });
  if (!lit) return [];
  const blocks = [
    makeBlock('dep-opening',  section, 'prayer',   'deacon', lit.opening, SAID),
    makeBlock('dep-response', section, 'response', 'choir',  lit.tripleResponse, CUE),
  ];
  (lit.petitions || []).forEach((p, i) => {
    blocks.push(makeBlock(`dep-p${i}`, section, 'prayer',   'deacon', p, SAID));
    blocks.push(makeBlock(`dep-r${i}`, section, 'response', 'choir',  lit.tripleResponse, CUE));
  });
  blocks.push(
    makeBlock('dep-ask',      section, 'prayer',   'deacon', lit.askPetition, SAID),
    makeBlock('dep-ask-resp', section, 'response', 'choir',  lit.askResponse, CUE),
    makeBlock('dep-call',     section, 'prayer',   'deacon', lit.deaconCall, SAID),
    makeBlock('dep-secret',   section, 'prayer',   'priest', lit.secretPrayer, SAID),
    makeBlock('dep-excl',     section, 'prayer',   'priest', lit.exclamation, SAID),
    makeBlock('dep-amen',     section, 'response', 'choir',  lit.amen, CUE),
  );
  return blocks;
}

function _litCatechumens(f) {
  const section = 'Litany for the Catechumens';
  const lit = mustGet(f, 'litany-catechumens', { scope: section });
  if (!lit) return [];
  const blocks = [
    makeBlock('cat-opening',  section, 'prayer',   'deacon', lit.opening, SAID),
    makeBlock('cat-response', section, 'response', 'choir',  lit.response, CUE),
  ];
  (lit.petitions || []).forEach((p, i) => {
    blocks.push(makeBlock(`cat-p${i}`, section, 'prayer', 'deacon', p, SAID));
    blocks.push(makeBlock(`cat-p${i}-resp`, section, 'response', 'choir', lit.response, CUE));
  });
  blocks.push(
    makeBlock('cat-petition2', section, 'prayer',   'deacon', lit.petition2, SAID),
    makeBlock('cat-bow',       section, 'prayer',   'deacon', lit.bowHeads, SAID),
    makeBlock('cat-bow-resp',  section, 'response', 'choir',  lit.bowHeadsResponse, CUE),
    makeBlock('cat-excl',      section, 'prayer',   'priest', lit.exclamation, SAID),
    makeBlock('cat-amen',      section, 'response', 'choir',  lit.amen, CUE),
    makeBlock('cat-dismissal', section, 'prayer',   'deacon', lit.dismissal, SAID),
  );
  return blocks;
}

function _litLitaniesFaithful(f, opts = {}) {
  const section = 'Litanies of the Faithful';
  const l1 = mustGet(f, 'litany-faithful-1', { scope: section });
  const l2 = mustGet(f, 'litany-faithful-2', { scope: section });
  if (!l1 || !l2) return [];

  // Parish rubric: the OCA Sluzhebnik 2nd Litany of the Faithful is the
  // short form (opening + Help-us + Wisdom + exclamation). The long form
  // (with 4 great-litany-style petitions before Help-us) appears in some
  // older Russian-tradition Liturgika; parishes that use it opt in.
  const longForm = opts.rubrics?.litanies?.faithful2Long === true;

  const blocks = [
    makeBlock('lf1-opening',    section, 'prayer',   'deacon', l1.opening, SAID),
    makeBlock('lf1-response',   section, 'response', 'choir',  l1.response, CUE),
    makeBlock('lf1-petition',   section, 'prayer',   'deacon', l1.petition, SAID),
    makeBlock('lf1-pet-resp',   section, 'response', 'choir',  l1.response, CUE),
    makeBlock('lf1-wisdom',     section, 'prayer',   'deacon', l1.wisdom, SAID),
    makeBlock('lf1-excl',       section, 'prayer',   'priest', l1.exclamation, SAID),
    makeBlock('lf1-amen',       section, 'response', 'choir',  l1.amen, CUE),
    makeBlock('lf2-opening',    section, 'prayer',   'deacon', l2.opening, SAID),
    makeBlock('lf2-response',   section, 'response', 'choir',  l2.response, CUE),
  ];
  if (longForm) {
    (l2.petitions || []).forEach((p, i) => {
      blocks.push(makeBlock(`lf2-p${i}`,       section, 'prayer',   'deacon', p, SAID));
      blocks.push(makeBlock(`lf2-p${i}-resp`,  section, 'response', 'choir',  l2.response, CUE));
    });
  }
  blocks.push(
    makeBlock('lf2-petition',   section, 'prayer',   'deacon', l2.petition, SAID),
    makeBlock('lf2-pet-resp',   section, 'response', 'choir',  l2.response, CUE),
    makeBlock('lf2-wisdom',     section, 'prayer',   'deacon', l2.wisdom, SAID),
    makeBlock('lf2-excl',       section, 'prayer',   'priest', l2.exclamation, SAID),
    makeBlock('lf2-amen',       section, 'response', 'choir',  l2.amen, CUE),
  );
  return blocks;
}

module.exports = {
  _litAugmentedLitany,
  _litDeparted,
  _litCatechumens,
  _litLitaniesFaithful,
};
