'use strict';

const makeBlock                    = require('../_shared/make-block');
const { resolveSource, deepGet }   = require('../_shared/resolve');

function assembleAposticha(apostichaSpec, calendarDay, fixedTexts, sources) {
  // A sticheron whose own label names its commemoration in the "(for X)" /
  // "from X" form beats the slot's label, which carries the principal's title.
  // Inside a feast window that title is wrong for whichever hymns belong to the
  // co-celebrated saint: on 2026-08-16 the aposticha Glory is the Image's
  // ("(for the Image)") and the Now-and-ever is the Dormition's ("(for the
  // Dormition, by the Emperor Leo the Wise)"), and both printed under a single
  // wrong heading. Labels without that form — the generic category incipits
  // that most menaion rows carry — never win. Same rule as lord-i-call.js.
  const namesCommemoration = (label) => !!label && /(?:^|\()\s*(?:for|from)\s+/i.test(label);
  const preferOwn = (own, slot) => (namesCommemoration(own) ? own : (slot || own));

  const section = 'Aposticha';
  const blocks = [];

  // Determine which aposticha psalm verses to use.
  // Sunday Great Vespers — whether the calendar entry has dayOfWeek='saturday'
  // (Saturday-evening date) or 'sunday' (date-shifted next-day entry) — uses
  // Ps. 92 verses ("The Lord is King…"). Lenten Saturdays use Ps. 122
  // (defaultVerses) instead.
  const isGreatVespers = calendarDay.vespers.serviceType === 'greatVespers';
  const isSundayVespers = isGreatVespers &&
    ['saturday', 'sunday'].includes(calendarDay.dayOfWeek);
  const isLentenSaturday = isSundayVespers &&
    calendarDay.dayOfWeek === 'saturday' &&
    calendarDay.liturgicalContext?.season === 'greatLent';
  const isPaschalVespers = calendarDay.vespers?.paschalAposticha ||
    (calendarDay.liturgicalContext?.season === 'brightWeek' && calendarDay.dayOfWeek === 'sunday');
  const verseTexts = isPaschalVespers
    ? fixedTexts.aposticha.paschalVerses
    : (isSundayVespers && !isLentenSaturday)
      ? fixedTexts.aposticha.saturdayVerses
      : fixedTexts.aposticha.defaultVerses;

  let idiomelon = null;

  for (let i = 0; i < apostichaSpec.slots.length; i++) {
    const slot = apostichaSpec.slots[i];

    if (slot.repeatPrevious) {
      // Insert psalm verse then repeat previous idiomelon
      if (verseTexts[i - 1]) {
        blocks.push(makeBlock(`apost-verse-${i}`, section, 'verse', 'reader',
          `V. ${verseTexts[i - 1]}`));
      }
      if (idiomelon) {
        blocks.push(makeBlock(`apost-repeat-${i}`, section, 'hymn', 'choir',
          idiomelon.text, { tone: idiomelon.tone, source: idiomelon.source, provenance: idiomelon.provenance }));
      }
      continue;
    }

    // Resolve text: 'fixed' source reads from fixedTexts, others from variable sources
    let sourceObj, slotSource;
    if (slot.source === 'fixed') {
      const text = deepGet(fixedTexts, slot.key);
      sourceObj = text ? { text } : null;
      slotSource = 'pentecostarion';
    } else {
      sourceObj = resolveSource(slot.source, slot.key, sources);
      slotSource = slot.source;
    }
    if (!sourceObj) continue;

    const prov = slot.provenance || sourceObj.provenance;
    // Prefer the hymn's own tone (from the source) over the slot's outer tone,
    // which is often the weekly tone (0 for fixed-tone feasts).
    const effTone = sourceObj.tone || slot.tone;
    if (slot.position === 1) {
      // First sticheron — no preceding verse, just the hymn
      blocks.push(makeBlock(`apost-idiomelon`, section, 'hymn', 'choir',
        sourceObj.text, { tone: effTone, source: slotSource, label: slot.label, provenance: prov }));
      idiomelon = { text: sourceObj.text, tone: effTone, source: slotSource, provenance: prov };
    } else {
      // Subsequent stichera — verse then hymn
      // Prefer explicit verse from slot spec (e.g. Holy Friday), fall back to fixed verse table
      const verseIndex = slot.position - 2;
      const verseText = slot.verse || verseTexts[verseIndex];
      if (verseText) {
        blocks.push(makeBlock(`apost-verse-${i}`, section, 'verse', 'reader',
          `V. ${verseText}`));
      }
      blocks.push(makeBlock(`apost-hymn-${i}`, section, 'hymn', 'choir',
        sourceObj.text, { tone: effTone, source: slotSource, label: slot.label, provenance: prov }));
    }
  }

  // Glory + Now
  if (apostichaSpec.glory) {
    let glorySource, glorySrc;
    if (apostichaSpec.glory.source === 'fixed') {
      const text = deepGet(fixedTexts, apostichaSpec.glory.key);
      glorySource = text ? { text } : null;
      glorySrc = 'pentecostarion';
    } else {
      glorySource = resolveSource(apostichaSpec.glory.source, apostichaSpec.glory.key, sources);
      glorySrc = apostichaSpec.glory.source;
    }
    if (apostichaSpec.glory.combinesGloryNow) {
      blocks.push(makeBlock('apost-glory-now-label', section, 'doxology', null,
        fixedTexts.doxology.gloryNow));
    } else {
      blocks.push(makeBlock('apost-glory-label', section, 'doxology', null,
        fixedTexts.doxology.gloryOnly));
    }
    if (glorySource) {
      blocks.push(makeBlock('apost-glory-hymn', section, 'hymn', 'choir',
        glorySource.text, { tone: glorySource.tone || apostichaSpec.glory.tone, source: glorySrc, label: preferOwn(glorySource.label, apostichaSpec.glory.label), provenance: apostichaSpec.glory.provenance || glorySource.provenance }));
    }
  }

  // A combined "Glory… now and ever" label folds the Now into the doxastichon,
  // so a separate Now would print a second label and a second hymn. Great Feasts
  // hit this: Transfiguration rendered its Tone 6 doxastichon and then an
  // Octoechos Theotokion underneath. Mirrors the guard in lord-i-call.js.
  if (apostichaSpec.now && !apostichaSpec.glory?.combinesGloryNow) {
    let nowSource, nowSrc;
    if (apostichaSpec.now.source === 'fixed') {
      const text = deepGet(fixedTexts, apostichaSpec.now.key);
      nowSource = text ? { text } : null;
      nowSrc = 'pentecostarion';
    } else {
      nowSource = resolveSource(apostichaSpec.now.source, apostichaSpec.now.key, sources);
      nowSrc = apostichaSpec.now.source;
    }
    blocks.push(makeBlock('apost-now-label', section, 'doxology', null,
      fixedTexts.doxology.nowOnly));
    if (nowSource) {
      blocks.push(makeBlock('apost-now-hymn', section, 'hymn', 'choir',
        nowSource.text, { tone: nowSource.tone || apostichaSpec.now.tone, source: nowSrc, label: preferOwn(nowSource.label, apostichaSpec.now.label), provenance: apostichaSpec.now.provenance || nowSource.provenance }));
    }
  }

  return blocks;
}

module.exports = assembleAposticha;
