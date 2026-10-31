'use strict';

const makeBlock          = require('../_shared/make-block');
const { resolveFixedRef } = require('../_shared/resolve');

/**
 * Density tiers for a litany (see DENSITY_CLASS in renderer.js).
 *
 * A litany is the densest thing in the book and the least of it is addressed
 * to the person holding it. In a Great Vespers the four litanies are 9.2 of
 * 36 booklet pages — 29% — and the reader's whole part in them is to sing
 * "Lord, have mercy." Printing the deacon's petitions and the choir's two-word
 * answer at the same size as a sticheron says they carry the same weight.
 *
 *   SAID — the deacon's petitions and the priest's exclamations. Followed,
 *          not spoken, by the pew; one size step down.
 *   CUE  — the short invariant answer. Located, not read.
 *
 * Measured 2026-10-31 on 2026-10-31 Great Vespers (St John, Tyler): tagging
 * these, with the psalmody, takes the booklet from 9 sheets to 7.
 */
const SAID = { density: 'compact' };
const CUE  = { density: 'cue' };

function assembleGreatLitany(fixedTexts) {
  const section = 'The Peace Litany';
  const lit = fixedTexts.litanies.great;
  const blocks = [
    makeBlock('gl-opening', section, 'prayer', 'deacon', lit.opening, SAID),
    makeBlock('gl-response', section, 'response', 'choir', lit.response, CUE),
  ];
  lit.petitions.forEach((petition, i) => {
    blocks.push(makeBlock(`gl-petition-${i + 1}`, section, 'prayer', 'deacon',
      resolveFixedRef(petition, fixedTexts), SAID));
    blocks.push(makeBlock(`gl-petition-${i + 1}-resp`, section, 'response', 'choir', lit.response, CUE));
  });
  blocks.push(
    makeBlock('gl-commemoration', section, 'prayer', 'deacon', lit.commemoration, SAID),
    makeBlock('gl-comm-response', section, 'response', 'choir', lit.commemorationResponse, CUE),
    makeBlock('gl-exclamation', section, 'prayer', 'priest', lit.exclamation, SAID),
    makeBlock('gl-amen', section, 'response', 'choir', fixedTexts.responses.amen, CUE),
  );
  return blocks;
}

function assembleLittleLitany(fixedTexts) {
  const section = 'Little Litany';
  const lit = fixedTexts.litanies.little;
  return [
    makeBlock('ll-opening', section, 'prayer', 'deacon', lit.opening, SAID),
    makeBlock('ll-response', section, 'response', 'choir', lit.response, CUE),
    makeBlock('ll-petition', section, 'prayer', 'deacon', lit.petition, SAID),
    makeBlock('ll-commemoration', section, 'prayer', 'deacon', lit.commemoration, SAID),
    makeBlock('ll-comm-response', section, 'response', 'choir', lit.commemorationResponse, CUE),
    makeBlock('ll-exclamation', section, 'prayer', 'priest', lit.exclamation1, SAID),
    makeBlock('ll-amen', section, 'response', 'choir', 'Amen.', CUE),
  ];
}

function assembleAugmentedLitany(fixedTexts) {
  const section = 'Litany of Fervent Supplication';
  const lit = fixedTexts.litanies.augmented;
  const blocks = [
    makeBlock('al-opening', section, 'prayer', 'deacon', lit.opening, SAID),
    makeBlock('al-response', section, 'response', 'choir', lit.response, CUE),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-petition-${i}`, section, 'prayer', 'deacon', p, SAID));
    blocks.push(makeBlock(`al-petition-${i}-resp`, section, 'response', 'choir', lit.response, CUE));
  });
  lit.triplePetitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-triple-${i}`, section, 'prayer', 'deacon',
      resolveFixedRef(p, fixedTexts), SAID));
    blocks.push(makeBlock(`al-triple-response-${i}`, section, 'response', 'choir', lit.tripleResponse, CUE));
  });
  blocks.push(
    makeBlock('al-exclamation', section, 'prayer', 'priest', lit.exclamation, SAID),
    makeBlock('al-amen', section, 'response', 'choir', 'Amen.', CUE),
  );
  return blocks;
}

function assembleEveningLitany(fixedTexts) {
  const section = 'Litany of Completion';
  const lit = fixedTexts.litanies.evening;
  const blocks = [
    makeBlock('el-opening', section, 'prayer', 'deacon', lit.opening, SAID),
    makeBlock('el-response', section, 'response', 'choir', lit.response, CUE),
    makeBlock('el-petition1', section, 'prayer', 'deacon', lit.petition1, SAID),
    makeBlock('el-p1-response', section, 'response', 'choir', lit.response, CUE),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`el-petition-${i + 2}`, section, 'prayer', 'deacon', p, SAID));
    blocks.push(makeBlock(`el-petition-${i + 2}-response`, section, 'response', 'choir',
      lit.petitionResponse, CUE));
  });
  blocks.push(
    makeBlock('el-commemoration', section, 'prayer', 'deacon', lit.commemoration, SAID),
    makeBlock('el-comm-response', section, 'response', 'choir', lit.commemorationResponse, CUE),
    makeBlock('el-exclamation', section, 'prayer', 'priest', lit.exclamation, SAID),
    makeBlock('el-amen', section, 'response', 'choir', 'Amen.', CUE),
    makeBlock('el-peace', section, 'prayer', 'priest', fixedTexts.responses.peaceToAll, SAID),
    makeBlock('el-peace-response', section, 'response', 'choir', fixedTexts.responses.andToThySpirit, CUE),
    makeBlock('el-bow', section, 'prayer', 'deacon', 'Let us bow our heads unto the Lord.', SAID),
    makeBlock('el-bow-response', section, 'response', 'choir', fixedTexts.responses.bowHeads, CUE),
    makeBlock('el-bow-prayer', section, 'prayer', 'priest', fixedTexts.prayers.bowHeads, SAID),
    makeBlock('el-bow-exclamation', section, 'prayer', 'priest',
      'Blessed and glorified be the might of Thy Kingdom: of the Father, and of the Son, and of the Holy Spirit, now and ever and unto ages of ages.', SAID),
    makeBlock('el-bow-amen', section, 'response', 'choir', 'Amen.', CUE),
  );
  return blocks;
}

module.exports = {
  assembleGreatLitany,
  assembleLittleLitany,
  assembleAugmentedLitany,
  assembleEveningLitany,
};
