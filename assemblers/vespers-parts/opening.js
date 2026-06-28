'use strict';

const makeBlock = require('../_shared/make-block');

function assembleOpening(fixedTexts, isGreatVespers, rubrics) {
  const section = 'Opening';
  const exclamation = makeBlock('opening-exclamation', section, 'prayer', 'priest', fixedTexts.opening.exclamation);
  const amen = makeBlock('opening-amen', section, 'response', 'reader', fixedTexts.opening.amen);

  // When the preceding Hour (Ninth for Vespers, Midnight Office for Matins)
  // was read immediately before, the reader's opening prayers were already
  // said there; service goes from Amen directly to Psalm 103 / royal opening.
  if (rubrics?.opening?.hoursPrecede) {
    return [exclamation, amen];
  }

  return [
    exclamation,
    amen,
    makeBlock('heavenly-king', section, 'prayer', 'reader', fixedTexts.prayers.heavenlyKing),
    makeBlock('trisagion', section, 'prayer', 'reader', fixedTexts.prayers.trisagion),
    makeBlock('glory-now-1', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
    makeBlock('most-holy-trinity', section, 'prayer', 'reader', fixedTexts.prayers.mostHolyTrinity),
    makeBlock('lhm-3', section, 'response', 'reader', fixedTexts.responses.lordHaveMercyThrice),
    makeBlock('glory-now-2', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
    makeBlock('our-father', section, 'prayer', 'reader', fixedTexts.prayers.ourFather),
    makeBlock('kingdom-doxology', section, 'prayer', 'priest', fixedTexts.prayers['ourFather.doxology']),
    makeBlock('lhm-12', section, 'response', 'reader', fixedTexts.responses.lordHaveMercyTwelve),
    makeBlock('glory-now-3', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
  ];
}

function assemblePsalm103(fixedTexts) {
  const section = 'Psalm 103';
  const p = fixedTexts.psalm103;
  return [
    makeBlock('ps103-intro', section, 'prayer', 'reader', p.intro),
    makeBlock('ps103-body', section, 'prayer', 'reader', p.body),
    makeBlock('ps103-refrain', section, 'rubric', 'reader', p.refrain),
    makeBlock('ps103-close', section, 'doxology', 'reader', p.close),
    makeBlock('alleluia-3', section, 'response', 'reader', fixedTexts.responses.alleluiaThrice),
  ];
}

module.exports = { assembleOpening, assemblePsalm103 };
