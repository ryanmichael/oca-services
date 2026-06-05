'use strict';

const makeBlock = require('./_shared/make-block');
const warnings  = require('./_shared/warnings');

const { assembleOpening, assemblePsalm103 }       = require('./vespers-parts/opening');
const { assembleGreatLitany,
        assembleLittleLitany }                    = require('./vespers-parts/litanies');
const { assembleKathismaReading }                 = require('./vespers-parts/kathisma');
const assembleLordICall                           = require('./vespers-parts/lord-i-call');
const assembleProkeimenon                         = require('./vespers-parts/prokeimenon');
const assembleAposticha                           = require('./vespers-parts/aposticha');
const assembleNuncDimittis                        = require('./vespers-parts/nunc-dimittis');
const assembleTroparia                            = require('./common-parts/troparia');

const { _litCatechumens, _litLitaniesFaithful }   = require('./liturgy-parts/litanies');
const { _litBlessedBeTheName,
        _litClosingDoxology, _litPsalm33 }        = require('./liturgy-parts/thanksgiving');

/**
 * Assembles the Liturgy of the Presanctified Gifts for a given calendar day.
 *
 * The Presanctified begins as Lenten Vespers (Psalm 103 → Great Litany →
 * Kathisma 18 → Lord I Call → Entrance → Gladsome Light → Prokeimena with
 * OT readings), then transitions to the communion portion unique to this
 * service (Let My Prayer Arise → Great Entrance → Lord's Prayer → Communion).
 *
 * @param {Object} calendarDay        - Calendar entry (must have .vespers spec)
 * @param {Object} vespersFixed       - Parsed fixed-texts/vespers-fixed.json
 * @param {Object} liturgyFixed       - Parsed fixed-texts/liturgy-fixed.json
 * @param {Object} presanctifiedFixed - Parsed fixed-texts/presanctified-fixed.json
 * @param {Object} sources            - { triodion, menaion, octoechos, prokeimena, db }
 * @returns {ServiceBlock[]}
 */
function assemblePresanctified(calendarDay, vespersFixed, liturgyFixed, presanctifiedFixed, sources) {
  warnings.reset();
  const blocks = [];
  const vespers = calendarDay.vespers;

  // ── VESPERS PORTION ──────────────────────────────────────────────────────────

  // 1. Opening (same as Vespers)
  blocks.push(...assembleOpening(vespersFixed, false));

  // 2. Psalm 103
  blocks.push(...assemblePsalm103(vespersFixed));

  // 3. Great Litany
  blocks.push(...assembleGreatLitany(vespersFixed));

  // 4. Kathisma 18 (always Kathisma 18 at the Presanctified)
  blocks.push(...assembleKathismaReading(18, 'Kathisma'));
  blocks.push(...assembleLittleLitany(vespersFixed));

  // 5. Lord, I Call (with Lenten stichera)
  blocks.push(...assembleLordICall(vespers.lordICall, vespersFixed, sources));

  // 6. Entrance
  blocks.push(makeBlock('entrance-wisdom', 'The Entrance', 'prayer', 'deacon',
    vespersFixed.entrance.wisdom));

  // 7. Gladsome Light
  blocks.push(makeBlock('gladsome-light', 'Gladsome Light', 'hymn', 'choir',
    vespersFixed['gladsome-light']));

  // 8. Prokeimena + OT Readings (Genesis, Proverbs — Lenten double pattern)
  blocks.push(...assembleProkeimenon(vespers.prokeimenon, vespersFixed, sources));

  // ── PRESANCTIFIED PORTION ────────────────────────────────────────────────────

  // 9. "Let My Prayer Arise" (Psalm 140 with prostrations)
  blocks.push(..._psLetMyPrayerArise(presanctifiedFixed));

  // 10. Prayer of St. Ephrem
  blocks.push(..._psPrayerOfEphrem(presanctifiedFixed));

  // 11. Aposticha (Lenten)
  blocks.push(...assembleAposticha(vespers.aposticha, calendarDay, vespersFixed, sources));

  // 12. Nunc Dimittis
  blocks.push(...assembleNuncDimittis(vespersFixed));

  // 13. Troparia
  blocks.push(...assembleTroparia(vespers.troparia, sources));

  // 14. Litany for the Catechumens (uses liturgy fixed text)
  blocks.push(..._litCatechumens(liturgyFixed));

  // 15. Litanies of the Faithful
  blocks.push(..._litLitaniesFaithful(liturgyFixed));

  // 16. "Now the Powers of Heaven" (replaces Cherubic Hymn)
  blocks.push(..._psNowThePowers(presanctifiedFixed));

  // 17. Litany of Supplication (Presanctified variant)
  blocks.push(..._psSupplication(presanctifiedFixed));

  // 18. Lord's Prayer
  {
    const section = 'The Lord\'s Prayer';
    const lp = liturgyFixed['lords-prayer'];
    blocks.push(
      makeBlock('lords-prayer', section, 'prayer', 'all', lp.text),
      makeBlock('lp-doxology',  section, 'prayer', 'priest', lp.doxology),
      makeBlock('lp-dox-resp',  section, 'response', 'choir', lp.response),
    );
  }

  // 19. Elevation + Pre-Communion
  blocks.push(..._psPreCommunion(presanctifiedFixed));

  // 20. Communion Prayer — said by the people before approaching the chalice.
  blocks.push(makeBlock('pc-prayer', 'Communion Prayer', 'prayer', 'all',
    presanctifiedFixed['pre-communion-prayer'].text));

  // 20a. Communion Hymn — sung while the faithful are receiving.
  blocks.push(makeBlock('ch-text', 'Communion Hymn', 'hymn', 'choir',
    presanctifiedFixed['communion-hymn'].text));

  // 21. Post-Communion
  {
    const section = 'Post-Communion';
    const pc = presanctifiedFixed['post-communion'];
    blocks.push(
      makeBlock('pcb-priest',   section, 'prayer',   'priest', pc.priest),
      makeBlock('pcb-response', section, 'response', 'choir',  pc.people),
    );
  }

  // 22. Litany of Thanksgiving
  blocks.push(..._psThanksgiving(presanctifiedFixed));

  // 23. Prayer behind the Ambon
  blocks.push(makeBlock('prayer-ambon', 'Prayer behind the Ambon', 'prayer', 'priest',
    presanctifiedFixed['prayer-ambon'], { density: 'compact' }));

  // 24. Blessed be the Name
  blocks.push(..._litBlessedBeTheName(liturgyFixed));

  // 24a. Closing Doxology
  blocks.push(..._litClosingDoxology(false));

  // 25. Psalm 33
  blocks.push(..._litPsalm33(liturgyFixed));

  // 26. Dismissal
  blocks.push(..._psDismissal(presanctifiedFixed));

  blocks._warnings = warnings.get();
  return blocks;
}

// ─── Presanctified Section Assemblers ────────────────────────────────────────

function _psLetMyPrayerArise(f) {
  const section = 'Let My Prayer Arise';
  const lmp = f['let-my-prayer-arise'];
  const blocks = [];

  // Full refrain first
  blocks.push(makeBlock('lmp-refrain-0', section, 'hymn', 'choir', lmp.refrain));

  // Verses alternating with refrain and prostrations
  lmp.verses.forEach((verse, i) => {
    blocks.push(makeBlock(`lmp-v${i}`, section, 'verse', 'choir', verse));
    blocks.push(makeBlock(`lmp-prostration-${i}`, section, 'rubric', null, 'Prostration.'));
    // After the last verse, sing just the half-refrain
    const refrain = (i === lmp.verses.length - 1) ? lmp.halfRefrain : lmp.refrain;
    blocks.push(makeBlock(`lmp-refrain-${i + 1}`, section, 'hymn', 'choir', refrain));
  });

  return blocks;
}

function _psPrayerOfEphrem(f) {
  const section = 'Prayer of St. Ephrem';
  const pe = f['prayer-of-st-ephrem'];
  return [
    makeBlock('ephrem-rubric', section, 'rubric', null, pe.rubric),
    makeBlock('ephrem-text',   section, 'prayer', 'all', pe.text),
  ];
}

function _psNowThePowers(f) {
  const section = 'Now the Powers of Heaven';
  const np = f['now-the-powers'];
  return [
    makeBlock('np-first',  section, 'hymn', 'choir', np.firstHalf),
    makeBlock('np-rubric', section, 'rubric', null,
      'The presanctified Gifts are carried from the Table of Oblation through the nave to the Holy Table.'),
    makeBlock('np-second', section, 'hymn', 'choir', np.secondHalf),
    makeBlock('np-concl',  section, 'hymn', 'choir', np.conclusion),
    makeBlock('np-prostration', section, 'rubric', null, 'Prostration.'),
  ];
}

function _psSupplication(f) {
  const section = 'Litany of Supplication';
  const lit = f['litany-presanctified'];
  const blocks = [
    makeBlock('ps-supp-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('ps-supp-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`ps-supp-p${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`ps-supp-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  lit.petitions2.forEach((p, i) => {
    blocks.push(makeBlock(`ps-supp-q${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`ps-supp-qr${i}`, section, 'response', 'choir',  lit.petitions2Response));
  });
  blocks.push(
    makeBlock('ps-supp-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('ps-supp-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('ps-supp-excl',      section, 'prayer',   'priest', lit.exclamation),
  );
  return blocks;
}

function _psPreCommunion(f) {
  const section = 'Pre-Communion';
  const el = f['elevation'];
  return [
    makeBlock('pc-peace',       section, 'prayer',   'priest', 'Peace be unto all.'),
    makeBlock('pc-peace-r',     section, 'response', 'choir',  'And to thy spirit.'),
    makeBlock('pc-bow',         section, 'prayer',   'deacon', 'Bow your heads unto the Lord.'),
    makeBlock('pc-bow-r',       section, 'response', 'choir',  'To Thee, O Lord.'),
    makeBlock('pc-elevation-d', section, 'prayer',   'deacon', el.deacon),
    makeBlock('pc-elevation-p', section, 'prayer',   'priest', el.priest),
    makeBlock('pc-elevation-r', section, 'response', 'choir',  el.people),
  ];
}

function _psThanksgiving(f) {
  const section = 'Litany of Thanksgiving';
  const lit = f['litany-thanksgiving'];
  const blocks = [
    makeBlock('lt-deacon',   section, 'prayer',   'deacon', lit.deacon),
    makeBlock('lt-response', section, 'response', 'choir',  lit.response),
    makeBlock('lt-petition', section, 'prayer',   'deacon', lit.petition),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`lt-p${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`lt-r${i}`, section, 'response', 'choir',  lit.petitionResponse));
  });
  blocks.push(
    makeBlock('lt-prayer',    section, 'prayer',   'priest', lit.prayer, { density: 'compact' }),
    makeBlock('lt-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('lt-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('lt-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('lt-amen',      section, 'response', 'choir',  'Amen.'),
  );
  return blocks;
}

function _psDismissal(f) {
  const section = 'Dismissal';
  const d = f['dismissal'];
  return [
    makeBlock('dis-prayer',  section, 'prayer',   'priest', d.exclamation),
    makeBlock('dis-glory',   section, 'doxology', null,     d.glorySuffix),
    makeBlock('dis-response',section, 'response', 'choir',  d.response),
    makeBlock('dis-blessing',section, 'prayer',   'priest', d.finalBlessing),
    makeBlock('dis-amen',    section, 'response', 'choir',  d.amen),
  ];
}

module.exports = assemblePresanctified;
