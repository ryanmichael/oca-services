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
const assembleVesperalLiturgy                            = require('./assemblers/vesperal-liturgy');

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
