'use strict';

const makeBlock      = require('./_shared/make-block');
const warnings       = require('./_shared/warnings');

const { assembleOpening, assemblePsalm103 }              = require('./vespers-parts/opening');
const { assembleGreatLitany, assembleLittleLitany,
        assembleAugmentedLitany, assembleEveningLitany } = require('./vespers-parts/litanies');
const { assembleKathisma }                               = require('./vespers-parts/kathisma');
const assembleLordICall                                  = require('./vespers-parts/lord-i-call');
const assembleOTReadings                                 = require('./vespers-parts/ot-readings');
const assembleProkeimenon                                = require('./vespers-parts/prokeimenon');
const assembleAposticha                                  = require('./vespers-parts/aposticha');
const assembleNuncDimittis                               = require('./vespers-parts/nunc-dimittis');
const { assembleLitya, assembleBlessingOfBread }         = require('./vespers-parts/litya');
const assembleEpitaphion                                 = require('./vespers-parts/epitaphion');

const assembleTroparia                                   = require('./common-parts/troparia');
const assembleDismissal                                  = require('./common-parts/dismissal');

/**
 * Assembles the complete Vespers service for a given calendar day.
 *
 * @param {Object} calendarDay  - Parsed calendar/YYYY-MM-DD.json
 * @param {Object} fixedTexts   - Parsed fixed-texts/vespers-fixed.json
 * @param {Object} sources      - { triodion, menaion, octoechos, prokeimena }
 * @returns {ServiceBlock[]}
 */
function assembleVespers(calendarDay, fixedTexts, sources) {
  warnings.reset();
  const blocks = [];
  const vespers = calendarDay.vespers;
  const isVigil = vespers.serviceType === 'all-night-vigil';
  const isGreatVespers = isVigil || vespers.serviceType === 'greatVespers';

  // ── 1. Opening ──────────────────────────────────────────────────────────────
  // Pentecostarion Sundays: "Christ is risen" 2½ times before the opening
  if (vespers.paschalOpening) {
    const section = 'Paschal Troparion';
    blocks.push(makeBlock('pt-priest', section, 'prayer', 'priest',
      'Christ is risen from the dead, trampling down death by death, and upon those in the tombs bestowing life! (2½ times)'));
    blocks.push(makeBlock('pt-choir', section, 'response', 'choir',
      'and upon those in the tombs bestowing life!'));
  }
  blocks.push(...assembleOpening(fixedTexts, isGreatVespers));

  // ── 2. Psalm 103 ────────────────────────────────────────────────────────────
  blocks.push(...assemblePsalm103(fixedTexts));

  // ── 3. Great Litany ─────────────────────────────────────────────────────────
  blocks.push(...assembleGreatLitany(fixedTexts));

  // ── 4. Kathisma ─────────────────────────────────────────────────────────────
  const kathismaBlocks = assembleKathisma(calendarDay, fixedTexts);
  blocks.push(...kathismaBlocks);
  // Little Litany follows kathisma (omitted only when kathisma itself is omitted)
  if (kathismaBlocks.length > 0) {
    blocks.push(...assembleLittleLitany(fixedTexts));
  }

  // ── 5. Lord, I Call ─────────────────────────────────────────────────────────
  blocks.push(...assembleLordICall(vespers.lordICall, fixedTexts, sources));

  // ── 6. Entrance (Great Vespers only) ────────────────────────────────────────
  if (isGreatVespers) {
    blocks.push(makeBlock('entrance-wisdom', 'The Entrance', 'prayer', 'deacon',
      fixedTexts.entrance.wisdom));
  }

  // ── 7. Gladsome Light ───────────────────────────────────────────────────────
  blocks.push(makeBlock('gladsome-light', 'Gladsome Light', 'hymn', 'choir',
    fixedTexts['gladsome-light']));

  // ── 8. Prokeimenon(a) + Lessons ─────────────────────────────────────────────
  blocks.push(...assembleProkeimenon(vespers.prokeimenon, fixedTexts, sources));

  // ── 8b. Old Testament Readings (vigil-rank Sundays with prophecies) ─────────
  if (vespers.otReadings && vespers.otReadings.length > 0) {
    blocks.push(...assembleOTReadings(vespers.otReadings));
  }

  // ── 9. Augmented Litany (Great Vespers) ─────────────────────────────────────
  if (isGreatVespers) {
    blocks.push(...assembleAugmentedLitany(fixedTexts));
  }

  // ── 10. Vouchsafe, O Lord ───────────────────────────────────────────────────
  blocks.push(makeBlock('vouchsafe', 'Vouchsafe, O Lord', 'prayer', 'reader',
    fixedTexts.prayers.vouchsafe));

  // ── 11. Evening Litany ──────────────────────────────────────────────────────
  blocks.push(...assembleEveningLitany(fixedTexts));

  // ── 11b. Litya (All-Night Vigil only) ────────────────────────────────────
  if (isVigil) {
    blocks.push(...assembleLitya(vespers.litya, fixedTexts, sources));
  }

  // ── 12. Aposticha ───────────────────────────────────────────────────────────
  blocks.push(...assembleAposticha(vespers.aposticha, calendarDay, fixedTexts, sources));

  // ── 13. Nunc Dimittis ───────────────────────────────────────────────────────
  blocks.push(...assembleNuncDimittis(fixedTexts));

  // ── 14. Troparia ────────────────────────────────────────────────────────────
  blocks.push(...assembleTroparia(vespers.troparia, sources, { repeatThrice: isVigil }));

  // ── 15. Augmented Litany (Daily Vespers — after troparia) ───────────────────
  if (!isGreatVespers) {
    blocks.push(...assembleAugmentedLitany(fixedTexts));
  }

  // ── 15b. Blessing of Bread (All-Night Vigil only) ────────────────────────
  if (isVigil) {
    blocks.push(...assembleBlessingOfBread(fixedTexts, { skipRejoiceOVirgin: isVigil }));
  }

  // ── 16. Dismissal ───────────────────────────────────────────────────────────
  blocks.push(...assembleDismissal(fixedTexts, vespers.dismissal));

  // ── 17. Epitaphion Procession (Burial Vespers only) ─────────────────────────
  if (vespers.epitaphion) {
    blocks.push(...assembleEpitaphion(vespers.epitaphion, sources));
  }

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assembleVespers;
