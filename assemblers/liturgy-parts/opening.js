'use strict';

const makeBlock          = require('../_shared/make-block');
const { resolveFixedRef } = require('../_shared/resolve');
const mustGet             = require('../_shared/must-get');

function _litOpeningDoxology(f) {
  const section = 'Opening Doxology';
  const d = mustGet(f, 'opening-doxology', { scope: section });
  if (!d) return [];
  return [
    makeBlock('od-exclamation', section, 'prayer', 'priest', d.exclamation),
    makeBlock('od-response',    section, 'response', 'choir', d.response),
  ];
}

function _litGreatLitany(f) {
  const section = 'Great Litany';
  const lit = mustGet(f, 'great-litany', { scope: section });
  if (!lit) return [];
  const blocks = [
    makeBlock('gl-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('gl-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`gl-p${i}`, section, 'prayer', 'deacon', resolveFixedRef(p, f)));
    blocks.push(makeBlock(`gl-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  blocks.push(
    makeBlock('gl-commemoration', section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('gl-comm-resp',     section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('gl-exclamation',   section, 'prayer',   'priest', lit.exclamation),
    makeBlock('gl-amen',          section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

module.exports = { _litOpeningDoxology, _litGreatLitany };
