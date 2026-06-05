'use strict';

const makeBlock = require('../_shared/make-block');

function assembleNuncDimittis(fixedTexts) {
  const section = 'Nunc Dimittis';
  return [
    makeBlock('nunc-dimittis', section, 'prayer', 'reader', fixedTexts.prayers.nuncDimittis),
    makeBlock('trisagion-2', section, 'prayer', 'reader', fixedTexts.prayers.trisagion),
    makeBlock('glory-now-nd', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
    makeBlock('most-holy-trinity-2', section, 'prayer', 'reader', fixedTexts.prayers.mostHolyTrinity),
    makeBlock('lhm-3-2', section, 'response', 'reader', fixedTexts.responses.lordHaveMercyThrice),
    makeBlock('glory-now-nd-2', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
    makeBlock('our-father-2', section, 'prayer', 'reader', fixedTexts.prayers.ourFather),
    makeBlock('kingdom-doxology-2', section, 'prayer', 'priest', fixedTexts.prayers['ourFather.doxology']),
    makeBlock('nd-amen', section, 'response', 'choir', 'Amen.'),
  ];
}

module.exports = assembleNuncDimittis;
