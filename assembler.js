/**
 * Orthodox Vespers Service Assembler
 *
 * Takes a calendar day entry and assembles an ordered array of rendered blocks
 * suitable for display or API delivery.
 *
 * assembleVespers(calendarDay, fixedTexts, sources) → ServiceBlock[]
 */

// ─── Shared data + primitives (./assemblers/_shared/) ──────────────────────
const { getPsalter, psalmBody, resolveVerse }            = require('./oca-psalter');
const { getVespersFixed, getMatinsFixed }                = require('./assemblers/_shared/fixed-text-loader');
const makeBlock                                          = require('./assemblers/_shared/make-block');
const warnings                                           = require('./assemblers/_shared/warnings');
const { resolveSource, resolveFixedRef, deepGet }        = require('./assemblers/_shared/resolve');

// ─── Vespers building blocks (./assemblers/vespers-parts/) ──────────────────
// Used by liturgy/matins/presanctified/vesperal-liturgy assemblers (still in this file).
// assembleVespers itself has been extracted to ./assemblers/vespers.js.
const { assembleOpening, assemblePsalm103 }              = require('./assemblers/vespers-parts/opening');
const { assembleGreatLitany, assembleLittleLitany,
        assembleAugmentedLitany, assembleEveningLitany } = require('./assemblers/vespers-parts/litanies');
const { assembleKathisma, assembleBlessedIsTheMan,
        assembleKathismaReading }                        = require('./assemblers/vespers-parts/kathisma');
const assembleLordICall                                  = require('./assemblers/vespers-parts/lord-i-call');
const assembleOTReadings                                 = require('./assemblers/vespers-parts/ot-readings');
const assembleProkeimenon                                = require('./assemblers/vespers-parts/prokeimenon');
const assembleAposticha                                  = require('./assemblers/vespers-parts/aposticha');
const assembleNuncDimittis                               = require('./assemblers/vespers-parts/nunc-dimittis');
const { assembleLitya, assembleBlessingOfBread }         = require('./assemblers/vespers-parts/litya');
const assembleEpitaphion                                 = require('./assemblers/vespers-parts/epitaphion');

// ─── Cross-family helpers (./assemblers/common-parts/) ─────────────────────
const assembleTroparia                                   = require('./assemblers/common-parts/troparia');
const assembleDismissal                                  = require('./assemblers/common-parts/dismissal');

// ─── Liturgy section helpers (./assemblers/liturgy-parts/) ─────────────────
// Used by assemblePresanctified + assembleVesperalLiturgy below (assembleLiturgy
// itself now lives in ./assemblers/liturgy.js and pulls these directly).
const { _litLittleLitany }                               = require('./assemblers/liturgy-parts/antiphons');
const { _litAugmentedLitany, _litCatechumens,
        _litLitaniesFaithful }                           = require('./assemblers/liturgy-parts/litanies');
const { _litGreatEntrance, _litSupplication }            = require('./assemblers/liturgy-parts/great-entrance');
const { _litAnaphora, _litLordsPrayer }                  = require('./assemblers/liturgy-parts/anaphora');
const { _litPreCommunion, _litCommunionPrayer,
        _litPostCommunion }                              = require('./assemblers/liturgy-parts/communion');
const { _litThanksgiving, _litBlessedBeTheName,
        _litClosingDoxology, _litPsalm33 }               = require('./assemblers/liturgy-parts/thanksgiving');

// ─── Leaf-service assemblers (./assemblers/) ───────────────────────────────
const assembleVespers                                    = require('./assemblers/vespers');
const assembleLiturgy                                    = require('./assemblers/liturgy');
const assembleMatins                                     = require('./assemblers/matins');
const assemblePaschalHours                               = require('./assemblers/paschal-hours');
const assembleMidnightOffice                             = require('./assemblers/midnight-office');
const assembleRoyalHours                                 = require('./assemblers/royal-hours');
const assemblePaschalMatins                              = require('./assemblers/paschal-matins');
const assembleBridegroomMatins                           = require('./assemblers/bridegroom-matins');
const assemblePassionGospels                             = require('./assemblers/passion-gospels');
const assembleLamentations                               = require('./assemblers/lamentations');

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single rendered block in the service output.
 * @typedef {Object} ServiceBlock
 * @property {string}  id        - Unique identifier
 * @property {string}  section   - Parent section label (e.g. "Lord, I Have Cried")
 * @property {string}  type      - "rubric" | "prayer" | "hymn" | "verse" | "response" | "doxology"
 * @property {string}  speaker   - "priest" | "deacon" | "reader" | "choir" | "all" | null
 * @property {string}  text      - The rendered text
 * @property {string}  [tone]    - Tone number if applicable
 * @property {string}  [source]  - Which liturgical book this came from
 * @property {string}  [label]   - Optional display label (e.g. "Dogmatikon", "For the Martyrs")
 */

// ─── Presanctified Liturgy Assembler ──────────────────────────────────────────

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

// ─── Vesperal Liturgy of St. Basil — Holy Saturday ──────────────────────────

/**
 * Assembles the Vesperal Liturgy of St. Basil the Great (Holy Saturday morning).
 * Combines Vespers (with 15 OT readings) and the Liturgy of St. Basil.
 *
 * Structure:
 *   VESPERS PORTION:
 *     Opening → Psalm 103 → Great Litany → Lord I Call (stichera) →
 *     Entrance → Gladsome Light → 15 Old Testament Readings →
 *     Song of the Three Youths → "Arise, O God" →
 *   LITURGY PORTION:
 *     Baptismal Hymn → Small Litany → Epistle → Gospel →
 *     Augmented Litany → Catechumens → Faithful Litanies →
 *     Cherubic Hymn ("Let all mortal flesh") → Great Entrance →
 *     Creed → Anaphora of St. Basil → Megalynarion →
 *     Lord's Prayer → Pre-Communion → Communion Hymn →
 *     Post-Communion → Thanksgiving → Dismissal
 *
 * @param {Object} vf   - Parsed fixed-texts/vesperal-liturgy-fixed.json (unique content)
 * @param {Object} vesp - Parsed fixed-texts/vespers-fixed.json (shared vespers texts)
 * @param {Object} lf   - Parsed fixed-texts/liturgy-fixed.json (shared liturgy texts)
 * @returns {ServiceBlock[]}
 */
function assembleVesperalLiturgy(vf, vesp, lf) {
  warnings.reset();
  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    makeBlock(id, section, type, speaker, text, extras);

  // ═══════════════════════════════════════════════════════════════════════════
  // VESPERS PORTION
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Opening ────────────────────────────────────────────────────────────────
  blocks.push(S('opening-excl', 'Opening', 'prayer', 'priest', vesp.opening.exclamation));
  blocks.push(S('opening-amen', 'Opening', 'response', 'choir', vesp.responses.amen));

  // ── Psalm 103 ──────────────────────────────────────────────────────────────
  blocks.push(...assemblePsalm103(vesp));

  // ── Great Litany ───────────────────────────────────────────────────────────
  blocks.push(...assembleGreatLitany(vesp));

  // ── Lord, I Have Cried ─────────────────────────────────────────────────────
  {
    const section = 'Lord, I Have Cried';
    const psalmVerses = vesp.lordICall.psalmVerses;
    blocks.push(S('lic-refrain', section, 'prayer', 'choir', vesp.lordICall.refrain));

    // Psalms 140, 141 (read in full)
    blocks.push(S('ps140', section, 'prayer', 'reader', psalmVerses.psalm140.text));
    blocks.push(S('ps141', section, 'prayer', 'reader', psalmVerses.psalm141.text));

    // Psalm 129 + 116 verses with stichera interleaved (dynamic count: On 6 or On 8)
    const stichera = vf.lordICall.stichera;
    const sticheraMap = {};
    const count = stichera.length;
    for (let i = 0; i < count; i++) {
      sticheraMap[count - i] = stichera[i];
    }

    const maxVerse = Math.max(...Object.keys(sticheraMap).map(Number));
    const allVerses = [...psalmVerses.psalm129.verses, ...psalmVerses.psalm116.verses];
    for (const verse of allVerses) {
      if (verse.number > maxVerse) continue; // skip verses above stichera count
      blocks.push(S(`lic-verse-${verse.number}`, section, 'verse', 'reader',
        `V. (${verse.number}) ${verse.text}`));
      if (sticheraMap[verse.number]) {
        const h = sticheraMap[verse.number];
        blocks.push(S(`lic-hymn-v${verse.number}`, section, 'hymn', 'choir', h.text,
          { tone: h.tone, source: 'triodion' }));
      }
    }

    // Glory
    blocks.push(S('lic-glory', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    blocks.push(S('lic-glory-hymn', section, 'hymn', 'choir', vf.lordICall.glory.text,
      { tone: vf.lordICall.glory.tone, source: 'triodion' }));

    // Now
    blocks.push(S('lic-now', section, 'doxology', null,
      'Now and ever and unto ages of ages. Amen.'));
    blocks.push(S('lic-now-hymn', section, 'hymn', 'choir', vf.lordICall.now.text,
      { source: 'triodion' }));
  }

  // ── Entrance ───────────────────────────────────────────────────────────────
  blocks.push(S('entrance', 'Entrance', 'rubric', 'deacon', vesp.entrance.wisdom));

  // ── Gladsome Light ─────────────────────────────────────────────────────────
  blocks.push(S('gladsome-light', 'Gladsome Light', 'hymn', 'choir', vesp['gladsome-light']));

  // ── 15 Old Testament Readings ──────────────────────────────────────────────
  for (const reading of vf.readings) {
    const section = reading.label;
    blocks.push(S(`reading-${reading.order}-label`, section, 'rubric', 'deacon',
      `${reading.book} (${reading.pericope})`));
    blocks.push(S(`reading-${reading.order}-text`, section, 'prayer', 'reader',
      reading.text));
  }

  // ── Song of the Three Youths ───────────────────────────────────────────────
  {
    const section = 'Song of the Three Youths';
    blocks.push(S('song-3-label', section, 'rubric', null, vf.songOfThreeYouths.label));
    blocks.push(S('song-3-text', section, 'hymn', 'choir', vf.songOfThreeYouths.text,
      { tone: vf.songOfThreeYouths.tone }));
  }

  // ── "Arise, O God" ─────────────────────────────────────────────────────────
  {
    const section = 'Arise, O God';
    blocks.push(S('arise-hymn', section, 'hymn', 'choir', vf.ariseOGod.text,
      { tone: vf.ariseOGod.tone, label: vf.ariseOGod.label }));
    for (let i = 0; i < vf.ariseOGod.verses.length; i++) {
      blocks.push(S(`arise-v${i}`, section, 'verse', 'reader', vf.ariseOGod.verses[i]));
      blocks.push(S(`arise-rep-${i}`, section, 'hymn', 'choir', vf.ariseOGod.text,
        { tone: vf.ariseOGod.tone }));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LITURGY PORTION (St. Basil the Great)
  // ═══════════════════════════════════════════════════════════════════════════

  const isBasil = true;

  // ── Baptismal Hymn (replaces Trisagion) ────────────────────────────────────
  blocks.push(S('baptismal-rubric', 'Baptismal Hymn', 'rubric', null,
    'In place of the Trisagion:'));
  blocks.push(S('baptismal-hymn', 'Baptismal Hymn', 'hymn', 'choir',
    vf.baptismalHymn.text, { label: vf.baptismalHymn.label }));

  // ── Little Litany (after Baptismal Hymn) ───────────────────────────────────
  blocks.push(..._litLittleLitany(lf, 'exclamation2', 'vl-post-bapt'));

  // ── Peace → Prokeimenon transition ─────────────────────────────────────────
  blocks.push(S('vl-peace', 'Epistle', 'prayer', 'priest', 'Peace be unto all.'));
  blocks.push(S('vl-peace-resp', 'Epistle', 'response', 'choir', 'And to thy spirit.'));

  // ── Epistle ────────────────────────────────────────────────────────────────
  // Note: No Alleluia at this service — "Arise, O God" (rendered above) replaces it
  {
    const section = 'Epistle';
    const ep = vf.epistle;
    blocks.push(S('ep-prok', section, 'hymn', 'reader',
      `Prokeimenon, Tone ${ep.prokeimenon.tone}:\n${ep.prokeimenon.refrain}`,
      { tone: ep.prokeimenon.tone }));
    blocks.push(S('ep-prok-v', section, 'verse', 'reader', ep.prokeimenon.verse));
    blocks.push(S('ep-announce', section, 'rubric', 'deacon',
      `The Reading from ${ep.book} (${ep.pericope}).`));
    blocks.push(S('ep-text', section, 'prayer', 'reader', ep.text, { density: 'compact' }));
  }

  // ── Gospel ─────────────────────────────────────────────────────────────────
  {
    const section = 'Gospel';
    blocks.push(S('gospel-glory', section, 'doxology', 'deacon',
      'Glory to Thee, O Lord, glory to Thee!'));
    blocks.push(S('gospel-label', section, 'rubric', 'deacon',
      `${vf.gospel.label} (${vf.gospel.book} ${vf.gospel.pericope})`));
    blocks.push(S('gospel-text', section, 'prayer', 'priest', vf.gospel.text, { density: 'compact' }));
    blocks.push(S('gospel-glory-end', section, 'doxology', 'choir',
      'Glory to Thee, O Lord, glory to Thee!'));
  }

  // ── Augmented Litany ───────────────────────────────────────────────────────
  blocks.push(..._litAugmentedLitany(lf));

  // ── Catechumens + Faithful ─────────────────────────────────────────────────
  blocks.push(..._litCatechumens(lf));
  blocks.push(..._litLitaniesFaithful(lf));

  // ── Cherubic Hymn: "Let All Mortal Flesh Keep Silence" ─────────────────────
  blocks.push(S('cherubic-hymn', 'Let All Mortal Flesh Keep Silence', 'hymn', 'choir',
    lf['cherubic-great-saturday']));

  // ── Great Entrance ─────────────────────────────────────────────────────────
  blocks.push(..._litGreatEntrance(lf));

  // ── Supplication + Creed ───────────────────────────────────────────────────
  blocks.push(..._litSupplication(lf));
  blocks.push(S('creed', 'The Creed', 'prayer', 'all', lf['creed']));

  // ── Anaphora of St. Basil — includes the Megalynarion ("Do not lament Me,
  //    O Mother", replacing "All of creation") at the liturgically correct
  //    point between the megalynarion cue and the intercessions exclamation.
  blocks.push(..._litAnaphora(isBasil, lf, vf.megalynarion));

  // ── Lord's Prayer ──────────────────────────────────────────────────────────
  blocks.push(..._litLordsPrayer(isBasil, lf));

  // ── Pre-Communion ──────────────────────────────────────────────────────────
  blocks.push(..._litPreCommunion(isBasil, lf));

  // ── Communion Hymn ─────────────────────────────────────────────────────────
  blocks.push(S('communion-hymn', 'Communion Hymn', 'hymn', 'choir',
    vf.communionHymn.text));

  // ── Communion Prayer ───────────────────────────────────────────────────────
  blocks.push(..._litCommunionPrayer(lf));

  // ── Post-Communion ─────────────────────────────────────────────────────────
  blocks.push(..._litPostCommunion({}, lf));

  // ── Hymn of Thanksgiving ───────────────────────────────────────────────────
  blocks.push(S('hot-always', 'Hymn of Thanksgiving', 'prayer', 'priest',
    lf['always-now-and-ever']));
  blocks.push(S('hot-amen', 'Hymn of Thanksgiving', 'response', 'choir',
    lf['amen']));
  blocks.push(S('let-our-mouths', 'Hymn of Thanksgiving', 'hymn', 'choir',
    lf['let-our-mouths']));

  // ── Thanksgiving Litany ────────────────────────────────────────────────────
  blocks.push(..._litThanksgiving(isBasil, lf));

  // ── Prayer behind the Ambon ────────────────────────────────────────────────
  blocks.push(S('prayer-ambon', 'Prayer behind the Ambon', 'prayer', 'priest',
    lf['prayer-ambon-basil'], { density: 'compact' }));

  // ── Blessed be the Name + Closing Doxology + Psalm 33 ─────────────────────
  blocks.push(..._litBlessedBeTheName(lf));
  blocks.push(..._litClosingDoxology(false));
  blocks.push(..._litPsalm33(lf));

  // ── Dismissal ──────────────────────────────────────────────────────────────
  blocks.push(S('dismissal', 'Dismissal', 'prayer', 'priest', vf.dismissal.text));
  blocks.push(S('dismissal-amen', 'Dismissal', 'response', 'choir', vf.dismissal.response));

  blocks._warnings = warnings.get();
  return blocks;
}


// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  assembleVespers,
  assembleLiturgy,
  assemblePresanctified,
  assemblePaschalHours,
  assembleMidnightOffice,
  assemblePaschalMatins,
  assembleBridegroomMatins,
  assemblePassionGospels,
  assembleLamentations,
  assembleVesperalLiturgy,
  assembleRoyalHours,
  assembleMatins,
  resolveSource,
};
