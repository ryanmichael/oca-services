'use strict';

const makeBlock = require('../_shared/make-block');

function assembleGreatLitany(fixedTexts) {
  const section = 'The Peace Litany';
  const lit = fixedTexts.litanies.great;
  const blocks = [
    makeBlock('gl-opening', section, 'prayer', 'deacon', lit.opening),
    makeBlock('gl-response', section, 'response', 'choir', lit.response),
  ];
  lit.petitions.forEach((petition, i) => {
    blocks.push(makeBlock(`gl-petition-${i + 1}`, section, 'prayer', 'deacon', petition));
    blocks.push(makeBlock(`gl-petition-${i + 1}-resp`, section, 'response', 'choir', lit.response));
  });
  blocks.push(
    makeBlock('gl-commemoration', section, 'prayer', 'deacon', lit.commemoration),
    makeBlock('gl-comm-response', section, 'response', 'choir', lit.commemorationResponse),
    makeBlock('gl-exclamation', section, 'prayer', 'priest', lit.exclamation),
    makeBlock('gl-amen', section, 'response', 'choir', fixedTexts.responses.amen),
  );
  return blocks;
}

function assembleLittleLitany(fixedTexts) {
  const section = 'Little Litany';
  const lit = fixedTexts.litanies.little;
  return [
    makeBlock('ll-opening', section, 'prayer', 'deacon', lit.opening),
    makeBlock('ll-response', section, 'response', 'choir', lit.response),
    makeBlock('ll-petition', section, 'prayer', 'deacon', lit.petition),
    makeBlock('ll-commemoration', section, 'prayer', 'deacon', lit.commemoration),
    makeBlock('ll-comm-response', section, 'response', 'choir', lit.commemorationResponse),
    makeBlock('ll-exclamation', section, 'prayer', 'priest', lit.exclamation1),
    makeBlock('ll-amen', section, 'response', 'choir', 'Amen.'),
  ];
}

function assembleAugmentedLitany(fixedTexts) {
  const section = 'Litany of Fervent Supplication';
  const lit = fixedTexts.litanies.augmented;
  const blocks = [
    makeBlock('al-opening', section, 'prayer', 'deacon', lit.opening),
    makeBlock('al-response', section, 'response', 'choir', lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-petition-${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`al-petition-${i}-resp`, section, 'response', 'choir', lit.response));
  });
  lit.triplePetitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-triple-${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`al-triple-response-${i}`, section, 'response', 'choir', lit.tripleResponse));
  });
  blocks.push(
    makeBlock('al-exclamation', section, 'prayer', 'priest', lit.exclamation),
    makeBlock('al-amen', section, 'response', 'choir', 'Amen.'),
  );
  return blocks;
}

function assembleEveningLitany(fixedTexts) {
  const section = 'Litany of Completion';
  const lit = fixedTexts.litanies.evening;
  const blocks = [
    makeBlock('el-opening', section, 'prayer', 'deacon', lit.opening),
    makeBlock('el-response', section, 'response', 'choir', lit.response),
    makeBlock('el-petition1', section, 'prayer', 'deacon', lit.petition1),
    makeBlock('el-p1-response', section, 'response', 'choir', lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`el-petition-${i + 2}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`el-petition-${i + 2}-response`, section, 'response', 'choir',
      lit.petitionResponse));
  });
  blocks.push(
    makeBlock('el-commemoration', section, 'prayer', 'deacon', lit.commemoration),
    makeBlock('el-comm-response', section, 'response', 'choir', lit.commemorationResponse),
    makeBlock('el-exclamation', section, 'prayer', 'priest', lit.exclamation),
    makeBlock('el-amen', section, 'response', 'choir', 'Amen.'),
    makeBlock('el-peace', section, 'prayer', 'priest', fixedTexts.responses.peaceToAll),
    makeBlock('el-peace-response', section, 'response', 'choir', fixedTexts.responses.andToThySpirit),
    makeBlock('el-bow', section, 'prayer', 'deacon', 'Let us bow our heads unto the Lord.'),
    makeBlock('el-bow-response', section, 'response', 'choir', fixedTexts.responses.bowHeads),
    makeBlock('el-bow-prayer', section, 'prayer', 'priest', fixedTexts.prayers.bowHeads),
    makeBlock('el-bow-exclamation', section, 'prayer', 'priest',
      'Blessed and glorified be the might of Thy Kingdom: of the Father, and of the Son, and of the Holy Spirit, now and ever and unto ages of ages.'),
    makeBlock('el-bow-amen', section, 'response', 'choir', 'Amen.'),
  );
  return blocks;
}

module.exports = {
  assembleGreatLitany,
  assembleLittleLitany,
  assembleAugmentedLitany,
  assembleEveningLitany,
};
