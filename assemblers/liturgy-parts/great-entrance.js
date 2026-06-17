'use strict';

const makeBlock = require('../_shared/make-block');
const mustGet   = require('../_shared/must-get');

function _litGreatEntrance(f) {
  const section = 'Great Entrance';
  const e = mustGet(f, 'great-entrance', { scope: section });
  if (!e) return [];
  return [
    makeBlock('ge-rubric',   section, 'rubric',   null,     e.rubric),
    makeBlock('ge-comm',     section, 'prayer',   'priest', e.commonCommemoration),
    makeBlock('ge-response', section, 'response', 'choir',  e.response),
  ];
}

function _litSupplication(f) {
  const section = 'Litany of Supplication';
  const lit = mustGet(f, 'litany-supplication', { scope: section });
  if (!lit) return [];
  const blocks = [
    makeBlock('sup-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('sup-response', section, 'response', 'choir',  lit.response),
  ];
  (lit.petitions || []).forEach((p, i) => {
    blocks.push(makeBlock(`sup-p${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`sup-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  (lit.petitions2 || []).forEach((p, i) => {
    blocks.push(makeBlock(`sup-p2-${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`sup-gr-${i}`, section, 'response', 'choir',  lit.petitions2Response));
  });
  blocks.push(
    makeBlock('sup-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('sup-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('sup-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('sup-amen',      section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

module.exports = { _litGreatEntrance, _litSupplication };
