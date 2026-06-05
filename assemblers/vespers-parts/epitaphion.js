'use strict';

const makeBlock         = require('../_shared/make-block');
const { resolveSource } = require('../_shared/resolve');

function assembleEpitaphion(epitaphionSpec, sources) {
  const section = 'Epitaphion Procession';
  const blocks = [];
  const ep = resolveSource(epitaphionSpec.source, epitaphionSpec.key, sources);
  if (!ep) return blocks;

  blocks.push(makeBlock('epi-rubric', section, 'rubric', null, ep.processionRubric));

  if (ep.venerationHymn) {
    blocks.push(makeBlock('epi-hymn', section, 'hymn', 'choir', ep.venerationHymn.text,
      { tone: ep.venerationHymn.tone, label: ep.venerationHymn.label }));
  }

  if (ep.venerationRefrains) {
    ep.venerationRefrains.forEach((r, i) => {
      blocks.push(makeBlock(`epi-refrain-${i}`, section, 'response', 'all', r));
    });
  }

  return blocks;
}

module.exports = assembleEpitaphion;
