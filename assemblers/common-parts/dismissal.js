'use strict';

const makeBlock = require('../_shared/make-block');

/**
 * Cross-family helper: builds the dismissal block stack and the per-day
 * "proper" dismissal text from `dismissalSpec` (opening + dayPatron + saints).
 * Holy Friday uses a hard-coded form; everything else composes the standard
 * "May Christ our true God…" formula.
 */
function assembleDismissal(fixedTexts, dismissalSpec) {
  const section = 'Dismissal';
  const d = fixedTexts.dismissal;

  // Build proper dismissal text
  let properText = '[Proper Dismissal for the day]';
  if (dismissalSpec) {
    if (dismissalSpec.opening === 'holyFriday') {
      properText = 'May He Who for us men and for our salvation endured in the flesh the dread passion, the life-giving Cross and voluntary burial, Christ our true God, through the prayers of His most pure Mother, and of all the saints, have mercy on us and save us, for He is good and loves mankind.';
    } else {
      let opening;
      if (dismissalSpec.dismissalIntroit) {
        // Festal introit names the feast ("…Who was transfigured in glory on
        // Mount Tabor…"). Same field the Liturgy dismissal uses; only feasts
        // that have one in great-feast-variants.json get it, the rest fall
        // through to the generic opening below.
        opening = dismissalSpec.dismissalIntroit;
      } else if (dismissalSpec.opening === 'feast' && dismissalSpec.feastLabel) {
        opening = 'May Christ our true God,';
      } else if (dismissalSpec.opening === 'sunday') {
        opening = 'May He Who rose from the dead, Christ our true God,';
      } else {
        opening = 'May Christ our true God,';
      }

      const parts = ['through the prayers of His most pure Mother'];
      if (dismissalSpec.dayPatron) parts.push(`of ${dismissalSpec.dayPatron}`);
      const saints = dismissalSpec.saints || [];
      if (saints.length > 0) parts.push(`of ${saints.join('; ')}`);
      const closing = `${parts.join('; ')}; and of all the saints, have mercy on us and save us, forasmuch as He is good and loveth mankind.`;
      properText = `${opening} ${closing}`;
    }
  }

  return [
    makeBlock('dis-wisdom', section, 'prayer', 'deacon', d.wisdom),
    makeBlock('dis-father-bless', section, 'response', 'choir', d.fatherBless),
    makeBlock('dis-blessed', section, 'prayer', 'priest', d.blessedHeWhoIs),
    makeBlock('dis-confirm', section, 'response', 'choir', d.confirm),
    makeBlock('dis-theotokos', section, 'prayer', 'priest', d.mostHolyTheotokos),
    makeBlock('dis-magnification', section, 'response', 'choir', d.magnification),
    makeBlock('dis-glory-christ', section, 'prayer', 'priest', d.gloryChrist),
    makeBlock('dis-final', section, 'response', 'choir', d.finalResponse),
    makeBlock('dis-proper', section, 'prayer', 'priest', properText),
    makeBlock('dis-amen', section, 'response', 'choir', 'Amen.'),
  ];
}

module.exports = assembleDismissal;
