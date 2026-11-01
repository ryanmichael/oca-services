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
const LITANY_SECTION = /litany|litanies/i;

function normalizeLitanyDensity(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((b) => {
    if (!b || b.density) return b;
    if (!LITANY_SECTION.test(b.section || '')) return b;
    // The short invariant answer: located, not read.
    if (b.type === 'response' && b.speaker === 'choir') {
      return { ...b, density: 'cue' };
    }
    // The deacon's petitions and the priest's exclamations: followed, not said.
    if (b.type === 'prayer' && (b.speaker === 'deacon' || b.speaker === 'priest')) {
      return { ...b, density: 'compact' };
    }
    // Everything else in a litany section keeps body size — notably the
    // `doxology`/`choir` "Glory to the Father…" that closes a Little Litany,
    // which the congregation sings.
    return b;
  });
}

const withLitanyDensity = (fn) => function (...args) {
  return normalizeLitanyDensity(fn.apply(this, args));
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
