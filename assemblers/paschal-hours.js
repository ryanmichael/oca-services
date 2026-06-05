'use strict';

const makeBlock = require('./_shared/make-block');
const warnings  = require('./_shared/warnings');

/**
 * Assembles the Paschal Hours service. Replaces all four Hours during
 * Bright Week (Pascha through Bright Saturday). 100% fixed content —
 * same every year. No variable content.
 *
 * @param {Object} f - Parsed fixed-texts/paschal-hours-fixed.json
 * @returns {ServiceBlock[]}
 */
function assemblePaschalHours(f) {
  warnings.reset();
  const blocks = [];

  // 1. Opening
  blocks.push(
    makeBlock('opening-exclamation', 'Opening', 'prayer', 'priest', f.opening.exclamation),
    makeBlock('opening-amen', 'Opening', 'response', 'reader', f.opening.amen),
  );

  // 2. Paschal Troparion ×3
  const section2 = 'Paschal Troparion';
  for (let i = 0; i < 3; i++) {
    blocks.push(makeBlock(`pt-${i}`, section2, 'hymn', 'choir', f['paschal-troparion'], { tone: 5 }));
  }

  // 3. "Having beheld the Resurrection of Christ"
  blocks.push(makeBlock('having-beheld', 'Having Beheld the Resurrection', 'hymn', 'choir',
    f['having-beheld']));

  // 4. Hypakoe
  blocks.push(makeBlock('hypakoe', 'Hypakoe', 'hymn', 'choir',
    f.hypakoe.text, { tone: f.hypakoe.tone }));

  // 5. Kontakion
  blocks.push(makeBlock('kontakion', 'Kontakion', 'hymn', 'choir',
    f.kontakion.text, { tone: f.kontakion.tone }));

  // 6. Ikos
  blocks.push(makeBlock('ikos', 'Kontakion', 'hymn', 'reader',
    f.ikos.text));

  // 7. Paschal Troparion ×3 (again)
  for (let i = 0; i < 3; i++) {
    blocks.push(makeBlock(`pt2-${i}`, 'Paschal Troparion', 'hymn', 'choir',
      f['paschal-troparion'], { tone: 5 }));
  }

  // 8. "In the grave bodily" troparion
  const section8 = 'Exaposteilarion';
  blocks.push(makeBlock('in-the-grave', section8, 'hymn', 'choir',
    f['troparion-in-the-grave'].text, { tone: f['troparion-in-the-grave'].tone }));

  // 9. Glory
  blocks.push(makeBlock('ex-glory-label', section8, 'doxology', null,
    'Glory to the Father, and to the Son, and to the Holy Spirit.'));
  blocks.push(makeBlock('ex-glory', section8, 'hymn', 'choir',
    f['troparion-glory'].text));

  // 10. Now and ever
  blocks.push(makeBlock('ex-now-label', section8, 'doxology', null,
    'Now and ever and unto ages of ages. Amen.'));
  blocks.push(makeBlock('ex-now', section8, 'hymn', 'choir',
    f['troparion-now'].text));

  // 11. Lord, have mercy ×40
  blocks.push(makeBlock('lhm-40', 'Petitions', 'response', 'reader',
    'Lord, have mercy. (×40)'));

  // 12. Glory, Now
  blocks.push(makeBlock('glory-now', 'Petitions', 'doxology', 'reader',
    'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));

  // 13. More honorable than the Cherubim
  blocks.push(makeBlock('magnification', 'Petitions', 'hymn', 'reader',
    'More honorable than the Cherubim, and more glorious beyond compare than the Seraphim, without corruption thou gavest birth to God the Word: true Theotokos, we magnify thee.'));

  // 14. Dismissal
  const sectionD = 'Dismissal';
  blocks.push(
    makeBlock('dis-text', sectionD, 'prayer', 'priest', f.dismissal.text),
    makeBlock('dis-amen', sectionD, 'response', 'choir', f.dismissal.response),
    makeBlock('dis-troparion', sectionD, 'hymn', 'choir', f.dismissal.finalTroparion, { tone: 5 }),
    makeBlock('dis-blessing', sectionD, 'prayer', 'priest', f.dismissal.finalBlessing),
    makeBlock('dis-final-amen', sectionD, 'response', 'choir', 'Amen.'),
  );

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assemblePaschalHours;
