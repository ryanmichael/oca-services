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
const assemblePresanctified                              = require('./assemblers/presanctified');
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
