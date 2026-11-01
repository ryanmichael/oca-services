'use strict';

/**
 * Public assembler API. The codebase's single import point —
 * `require('./assembler')` re-exports from here.
 *
 * Each named assembler is a leaf module under `./assemblers/`.
 * Section helpers (vespers-parts/, common-parts/, liturgy-parts/)
 * are internal and not surfaced here.
 */

const { resolveSource } = require('./_shared/resolve');

/**
 * Litany density, applied once for every service.
 *
 * This started as explicit `{ density: … }` at each call site, which is how
 * the booklet shipped on 2026-10-31 with the Liturgy's Fervent Supplication,
 * Catechumens and Faithful litanies stepped down while its Great Litany, both
 * Little Litanies, the Supplication litany and the Litany of Thanksgiving
 * stayed at body size — 75 of 98 blocks untouched, in one booklet. The cause
 * was simple: litanies are emitted from TWELVE files, two of them named
 * `litanies.js`, and tagging the two obvious ones looked complete.
 *
 * A call-site convention that must be repeated in twelve places will be wrong
 * in at least one of them. This is the one place every service passes
 * through, so the rule is applied here instead and a thirteenth emitter
 * cannot miss it.
 *
 * The rule is scoped to litany sections, which is what makes it safe to key
 * off role rather than text. Measured over 7 services x 9 dates: all 1151
 * `response`/`choir` blocks inside a litany section are one of six fixed
 * acclamations, the longest 53 characters ("Lord, have mercy." x3), none
 * above 70 — so there is no "More honorable than the Cherubim" hiding in
 * there to be shrunk by mistake. Outside a litany section nothing is touched.
 *
 * An explicit `density` always wins, so a block that needs `fine` (the silent
 * pre-Communion prayer) or a deliberate exception keeps it.
 */
/**
 * Each entry: the sections it covers, then `type/speaker` -> density. A role
 * not listed keeps body size, which is how everything SUNG stays full size
 * without needing to be named.
 *
 * The three antiphons are deliberately absent. Every block in them — psalm
 * verses, refrains, "Only-begotten Son", the Beatitude troparia — is sung, so
 * none of it is stepped down. Only the Little Litanies BETWEEN the antiphons
 * are, via the litany rule.
 */
const DENSITY_RULES = [
  {
    // Every litany, in every service.
    sections: /litany|litanies/i,
    roles: {
      // The short invariant answer: located, not read.
      'response/choir': 'cue',
      // The deacon's petitions and the priest's exclamations: followed, not said.
      'prayer/deacon': 'compact',
      'prayer/priest': 'compact',
    },
  },
  {
    // The priest's dismissal. The choir's answers stay at body size, so the
    // page reads small = he says it, full size = we sing it — the same
    // contrast the litanies use. In Vespers and Matins this is a four-part
    // dialogue (81/29/60/398 chars) rather than the Liturgy's single block.
    sections: /^dismissal$/i,
    roles: { 'prayer/priest': 'compact' },
  },
  {
    // Read after the dismissal while the faithful venerate — about 4,400
    // characters of prayer. Not the "Hymn of Thanksgiving" or the "Litany of
    // Thanksgiving", which are different sections and sung.
    sections: /^prayers of thanksgiving$/i,
    roles: { 'prayer/reader': 'compact', 'prayer/priest': 'compact' },
  },
];

function normalizeDensity(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((b) => {
    if (!b || b.density) return b;              // an explicit tag always wins
    const section = b.section || '';
    for (const rule of DENSITY_RULES) {
      if (!rule.sections.test(section)) continue;
      const step = rule.roles[`${b.type}/${b.speaker}`];
      if (step) return { ...b, density: step };
      break;
    }
    return b;
  });
}

const withLitanyDensity = (fn) => function (...args) {
  return normalizeDensity(fn.apply(this, args));
};

module.exports = {
  assembleVespers:          withLitanyDensity(require('./vespers')),
  assembleLiturgy:          withLitanyDensity(require('./liturgy')),
  assembleMatins:           withLitanyDensity(require('./matins')),
  assemblePresanctified:    withLitanyDensity(require('./presanctified')),
  assembleVesperalLiturgy:  withLitanyDensity(require('./vesperal-liturgy')),
  assemblePaschalHours:     withLitanyDensity(require('./paschal-hours')),
  assembleMidnightOffice:   withLitanyDensity(require('./midnight-office')),
  assembleRoyalHours:       withLitanyDensity(require('./royal-hours')),
  assemblePaschalMatins:    withLitanyDensity(require('./paschal-matins')),
  assembleBridegroomMatins: withLitanyDensity(require('./bridegroom-matins')),
  assemblePassionGospels:   withLitanyDensity(require('./passion-gospels')),
  assembleLamentations:     withLitanyDensity(require('./lamentations')),
  assembleTypika:           withLitanyDensity(require('./typika')),
  assemblePanikhida:        withLitanyDensity(require('./panikhida')),
  resolveSource,
};
