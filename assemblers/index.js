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

module.exports = {
  assembleVespers:          require('./vespers'),
  assembleLiturgy:          require('./liturgy'),
  assembleMatins:           require('./matins'),
  assemblePresanctified:    require('./presanctified'),
  assembleVesperalLiturgy:  require('./vesperal-liturgy'),
  assemblePaschalHours:     require('./paschal-hours'),
  assembleMidnightOffice:   require('./midnight-office'),
  assembleRoyalHours:       require('./royal-hours'),
  assemblePaschalMatins:    require('./paschal-matins'),
  assembleBridegroomMatins: require('./bridegroom-matins'),
  assemblePassionGospels:   require('./passion-gospels'),
  assembleLamentations:     require('./lamentations'),
  assembleTypika:           require('./typika'),
  resolveSource,
};
